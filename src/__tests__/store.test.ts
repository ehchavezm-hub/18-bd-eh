import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DataAdapter } from '../data/adapter';
import { DataError } from '../data/adapter';
import type { Row } from '../lib/rows';
import { getState, initStore, resetStore, save, sync } from '../data/store';
import { crearVault } from '../auth/vault';
import type { TableName } from '../config/schema';

function fake(): DataAdapter & { sheet: Record<string, Row[]>; offline: boolean; calls: string[] } {
  const sheet: Record<string, Row[]> = { MOVIMIENTOS: [{ MOVIMIENTO_ID: 'm1', MONTO: 5 }], BITACORA: [] };
  const f = {
    sheet, offline: false, calls: [] as string[],
    describe: async () => ({ title: 't', tables: [] }),
    read: async (t: TableName) => sheet[t] ?? [],
    header: async () => [],
    readMany: async (ts: TableName[]) => { if (f.offline) throw new DataError('x', 'network'); f.calls.push('readMany'); return Object.fromEntries(ts.map((t) => [t, [...(sheet[t] ?? [])]])); },
    append: async (t: TableName, rows: Row[]) => { if (f.offline) throw new DataError('x', 'network'); f.calls.push(`append:${t}:${rows.length}`); sheet[t] = [...(sheet[t] ?? []), ...rows]; },
    update: async (t: TableName, id: string, patch: Row) => { if (f.offline) throw new DataError('x', 'network'); f.calls.push(`update:${t}`); sheet[t] = (sheet[t] ?? []).map((r) => (r.MOVIMIENTO_ID === id ? { ...r, ...patch } : r)); },
  };
  return f;
}

describe('store', () => {
  beforeEach(async () => { await crearVault('482193'); await resetStore(); });

  it('guarda sin internet y envía al reconectar, en orden', async () => {
    const db = fake();
    await initStore(db, 'test');
    db.offline = true;
    await save('MOVIMIENTOS', { MOVIMIENTO_ID: 'm2', MONTO: 10 });
    await save('MOVIMIENTOS', { MOVIMIENTO_ID: 'm3', MONTO: 20 });
    await save('MOVIMIENTOS', { MOVIMIENTO_ID: 'm2', MONTO: 11 }, 'update');
    await sync();
    expect(getState().pending).toBe(3);
    expect(getState().tables.MOVIMIENTOS.map((r) => r.MOVIMIENTO_ID)).toEqual(['m2', 'm3']); // visible al instante
    db.offline = false;
    await sync();
    expect(getState().pending).toBe(0);
    expect(db.calls.slice(0, 2)).toEqual(['append:MOVIMIENTOS:2', 'update:MOVIMIENTOS']);
    expect(db.sheet.MOVIMIENTOS.find((r) => r.MOVIMIENTO_ID === 'm2')?.MONTO).toBe(11);
    expect(getState().tables.MOVIMIENTOS).toHaveLength(3);
  });

  it('marca la sesión vencida sin romper', async () => {
    const db = fake();
    db.readMany = async () => { throw new DataError('exp', 'auth'); };
    await initStore(db, 'test');
    await sync();
    expect(getState().authExpired).toBe(true);
  });
});
