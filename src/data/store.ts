/**
 * Almacén de la app: copia local de las tablas + cola de cambios + sincronización.
 * - Lee siempre de la copia local (funciona sin internet).
 * - Cada cambio se aplica al instante en la copia local y se encola.
 * - La cola se envía a Google Sheets cuando hay conexión, en orden.
 */
import { useSyncExternalStore } from 'react';
import type { TableName } from '../config/schema';
import type { Row } from '../lib/rows';
import type { DataAdapter } from './adapter';
import { DataError } from './adapter';
import { localDb, type OutboxItem } from './localDb';
import { nowStamp } from '../domain/dates';
import { cifrar, descifrar } from '../auth/vault';

/** Tablas que la app mantiene en el teléfono. */
export const SYNC_TABLES: TableName[] = [
  'MOVIMIENTOS', 'INSTITUCIONES', 'CUENTAS', 'CATEGORIAS', 'CENTROS', 'LUGARES', 'MONEDAS', 'TIPO_CAMBIO',
  'PAISES', 'LISTAS', 'CONFIG', 'RECURRENTES', 'PRESUPUESTOS', 'REGLAS_CATEGORIZACION', 'CIERRES_MES',
];
/** Tablas opcionales: si la hoja no las tiene, la app sigue funcionando sin ellas. */
export const OPTIONAL_TABLES: TableName[] = ['METAS', 'ACTIVOS'];

const ID_COL: Partial<Record<TableName, string>> = {
  MOVIMIENTOS: 'MOVIMIENTO_ID', INSTITUCIONES: 'INSTITUCION_ID', CUENTAS: 'CUENTA_ID', CATEGORIAS: 'CATEGORIA_ID',
  CENTROS: 'CENTRO_ID', LUGARES: 'LUGAR_ID', MONEDAS: 'MONEDA', RECURRENTES: 'RECURRENTE_ID', PRESUPUESTOS: 'PRESUPUESTO_ID',
  REGLAS_CATEGORIZACION: 'REGLA_ID', METAS: 'META_ID', ACTIVOS: 'ACTIVO_ID', BITACORA: 'BITACORA_ID', TIPO_CAMBIO: 'TIPO_CAMBIO_SIN_ID', PAISES: 'PAIS_ID', CONTRAPARTES: 'CONTRAPARTE_ID',
};
export const idColumn = (t: TableName) => ID_COL[t] ?? 'ID';

export interface StoreState {
  tables: Record<string, Row[]>;
  pending: number;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
  ready: boolean;
  /** La sesión de Google expiró: hay que volver a entrar. */
  authExpired: boolean;
  version: number;
}

let state: StoreState = { tables: {}, pending: 0, syncing: false, lastSync: null, error: null, ready: false, authExpired: false, version: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<StoreState>) => {
  state = { ...state, ...patch, version: state.version + 1 };
  listeners.forEach((l) => l());
};

export const getState = () => state;
/** Fuerza a recalcular las pantallas (p. ej. cuando llega el tipo de cambio histórico). */
export const refrescar = () => set({});
export function useStore(): StoreState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

let adapter: DataAdapter | null = null;
let device = 'APP';

/** Carga la copia local guardada en el teléfono (arranque instantáneo y sin internet). */
export async function initStore(db: DataAdapter, deviceName: string) {
  adapter = db;
  device = deviceName;
  const cached = await localDb.cache.toArray();
  const tables: Record<string, Row[]> = {};
  let lastSync: string | null = null;
  for (const c of cached) {
    let rows: Row[] | null = null;
    if (c.enc) { try { rows = await descifrar<Row[]>(c.enc); } catch { rows = null; } }
    else if (c.rows) { rows = c.rows; await localDb.cache.put({ table: c.table, enc: await cifrar(rows), fetchedAt: c.fetchedAt }); } // migración: cifrar lo que estaba en claro
    if (!rows) { await localDb.cache.delete(c.table); continue; } // no se pudo descifrar: se vuelve a descargar
    tables[c.table] = rows;
    if (!lastSync || c.fetchedAt > lastSync) lastSync = c.fetchedAt;
  }
  // migración: cifrar los cambios pendientes que estaban en claro
  for (const it of await localDb.outbox.toArray()) {
    if (it.payload && !it.enc) await localDb.outbox.put({ ...it, payload: undefined, enc: await cifrar(it.payload) });
  }
  const pending = await localDb.outbox.count();
  set({ tables, pending, lastSync, ready: cached.length > 0 });
}

function upsertLocal(table: string, idCol: string, row: Row, mode: 'append' | 'update') {
  const rows = [...(state.tables[table] ?? [])];
  const key = row[idCol];
  const i = key === undefined || key === null || key === '' ? -1 : rows.findIndex((r) => String(r[idCol]) === String(key));
  if (i >= 0) rows[i] = { ...rows[i], ...row };
  else if (mode === 'append') rows.push(row);
  return rows;
}

// Nota: el cifrado (asíncrono) se hace ANTES de abrir la transacción de IndexedDB.
async function cifrarTabla(table: string, rows: Row[]) {
  return { table, enc: await cifrar(rows), fetchedAt: state.lastSync ?? nowStamp() };
}

/** Guarda un registro nuevo (o cambios) localmente y lo encola para enviarlo a la hoja. */
export async function save(table: TableName, row: Row, op: 'append' | 'update' = 'append') {
  const idCol = idColumn(table);
  const id = String(row[idCol] ?? '');
  const rows = upsertLocal(table, idCol, row, op);
  const tabla = await cifrarTabla(table, rows);
  const enc = await cifrar(row);
  await localDb.transaction('rw', localDb.cache, localDb.outbox, async () => {
    await localDb.cache.put(tabla);
    await localDb.outbox.add({ table, op, id, enc, createdAt: nowStamp(), attempts: 0 });
  });
  set({ tables: { ...state.tables, [table]: rows }, pending: state.pending + 1 });
  void sync();
}

/** Registra un cambio en la bitácora (quién, qué, cuándo). */
export async function log(tabla: string, registroId: string, campo: string, anterior: unknown, nuevo: unknown, motivo: string) {
  await save('BITACORA', {
    BITACORA_ID: crypto.randomUUID(), FECHA_HORA: nowStamp(), TABLA: tabla, REGISTRO_ID: registroId, CAMPO: campo,
    VALOR_ANTERIOR: anterior === null || anterior === undefined ? '' : String(anterior),
    VALOR_NUEVO: nuevo === null || nuevo === undefined ? '' : String(nuevo), ORIGEN: 'APP', DISPOSITIVO: device, MOTIVO: motivo,
  });
}

let running: Promise<void> | null = null;

/** Envía la cola y trae las tablas actualizadas. Seguro de llamar muchas veces. */
export function sync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (!adapter || !navigator.onLine) return;
    set({ syncing: true, error: null, authExpired: false });
    try {
      // 1) Enviar cambios pendientes, en orden. Los "append" seguidos de la misma tabla van juntos.
      for (;;) {
        const items = await localDb.outbox.orderBy('seq').limit(50).toArray();
        if (items.length === 0) break;
        const first = items[0];
        const batch: OutboxItem[] = [first];
        if (first.op === 'append') for (const it of items.slice(1)) { if (it.op === 'append' && it.table === first.table) batch.push(it); else break; }
        try {
          const payloads = await Promise.all(batch.map(async (b) => (b.enc ? descifrar<Row>(b.enc) : (b.payload as Row))));
          if (first.op === 'append') await adapter.append(first.table as TableName, payloads);
          else await adapter.update(first.table as TableName, first.id, payloads[0]);
          await localDb.outbox.bulkDelete(batch.map((b) => b.seq!));
          set({ pending: await localDb.outbox.count() });
        } catch (e) {
          await localDb.outbox.update(first.seq!, { attempts: first.attempts + 1, lastError: (e as Error).message });
          throw e;
        }
      }
      // 2) Traer la versión actual de las tablas.
      const fresh = await adapter.readMany(SYNC_TABLES);
      try { Object.assign(fresh, await adapter.readMany(OPTIONAL_TABLES)); }
      catch (e) { if (e instanceof DataError && (e.kind === 'auth' || e.kind === 'network')) throw e; /* la hoja no tiene esas pestañas */ }
      const stamp = nowStamp();
      const cifradas = await Promise.all(Object.entries(fresh).map(async ([t, rows]) => ({ table: t, enc: await cifrar(rows), fetchedAt: stamp })));
      await localDb.transaction('rw', localDb.cache, async () => { await localDb.cache.bulkPut(cifradas); });
      set({ tables: { ...state.tables, ...fresh }, lastSync: stamp, ready: true });
    } catch (e) {
      set({ error: e instanceof DataError ? e.message : 'No se pudo sincronizar. Se reintentará.', authExpired: e instanceof DataError && e.kind === 'auth' });
    } finally {
      set({ syncing: false });
      running = null;
    }
  })();
  return running;
}

/** Borra la copia local (al cerrar sesión o "borrar todo"). */
export async function resetStore() {
  await localDb.cache.clear();
  await localDb.outbox.clear();
  set({ tables: {}, pending: 0, lastSync: null, ready: false, error: null });
}
