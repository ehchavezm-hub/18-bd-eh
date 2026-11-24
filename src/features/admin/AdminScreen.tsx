import { useMemo, useState } from 'react';
import { loadSettings, saveSettings } from '../../config/settings';
import { useData } from '../../data/useData';
import { useStore, sync } from '../../data/store';
import { CatalogEditor, secuenciaId, slugId, type CatalogSpec } from './CatalogEditor';
import { CLASES_CATEGORIA, CLASES_PATRIMONIO, FRECUENCIAS, TIPOS_50_30_20, TIPOS_CUENTA, TIPOS_INSTITUCION } from '../../config/lists';
import type { Opcion } from '../../ui/kit';
import { Status, toast } from '../../ui/kit';
import { activarBiometria } from '../lock/LockScreens';
import { SeguridadCard } from './Seguridad';
import { tieneEnvolturaBiometrica } from '../../auth/vault';
import { dinero } from '../../domain/format';
import { toIsoDate } from '../../domain/dates';

const op = (xs: string[]): Opcion[] => xs.map((x) => ({ value: x, label: x.charAt(0) + x.slice(1).toLowerCase() }));
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Módulo Administrador: catálogos, datos y opciones de este dispositivo. */
export function AdminScreen({ onSignOut, onChangeSheet, onExit, onWipe, seccionInicial }: { onSignOut: () => void; onChangeSheet: () => void; onExit: () => void; onWipe: () => void; seccionInicial?: string | null }) {
  const [bioVer, setBioVer] = useState(0);
  const st = useMemo(() => loadSettings(), [bioVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useData();
  const store = useStore();
  const [abierto, setAbierto] = useState<CatalogSpec | null>(null);
  const [cerroInicial, setCerroInicial] = useState(false);

  const specs = useMemo(() => {
    const inst = () => d.instituciones.filter((i) => i.activo).map((i) => ({ value: i.id, label: i.nombre }));
    const monedas = () => d.monedas.filter((m) => m.activo).map((m) => ({ value: m.id, label: `${m.id} · ${m.nombre}` }));
    const cuentas = () => d.cuentas.filter((c) => c.activa).map((c) => ({ value: c.id, label: c.nombre }));
    const grupos = () => d.categorias.filter((c) => !c.padreId).map((c) => ({ value: c.id, label: c.nombre }));
    const cats = () => d.categorias.filter((c) => c.padreId && c.activa).map((c) => ({ value: c.id, label: c.nombre, group: d.nombres.categoria.get(c.padreId!) }));
    const centros = () => d.centros.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nombre }));
    const paises = () => (store.tables.PAISES ?? []).map((r) => ({ value: s(r.PAIS_ID), label: s(r.NOMBRE) }));
    const nombreInst = new Map(d.instituciones.map((i) => [i.id, i.nombre]));
    const list: CatalogSpec[] = [
      {
        table: 'INSTITUCIONES', titulo: 'Bancos e instituciones', activoCol: 'ACTIVA',
        campos: [{ key: 'NOMBRE', label: 'Nombre', type: 'text', required: true }, { key: 'TIPO', label: 'Tipo', type: 'select', options: op(TIPOS_INSTITUCION) },
          { key: 'EN_USO', label: '¿Lo usas actualmente?', type: 'yesno' }, { key: 'ACTIVA', label: 'Activa', type: 'yesno' }],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: `${s(r.TIPO).toLowerCase()}${String(r.EN_USO ?? '').startsWith('S') ? ' · en uso' : ''}` }),
        nuevoId: (r, ex) => slugId(s(r.NOMBRE), ex), defaults: { EN_USO: 'SÍ', TIPO: 'BANCO' },
      },
      {
        table: 'CUENTAS', titulo: 'Cuentas y tarjetas', activoCol: 'ACTIVA',
        campos: [
          { key: 'NOMBRE', label: 'Nombre', type: 'text', required: true, hint: 'Ej. BCP ahorro sueldo soles' },
          { key: 'INSTITUCION_ID', label: 'Banco o institución', type: 'select', options: inst, required: true },
          { key: 'TIPO_CUENTA', label: 'Tipo de cuenta', type: 'select', options: op(TIPOS_CUENTA), required: true },
          { key: 'MONEDA', label: 'Moneda', type: 'select', options: monedas, required: true, hint: 'Una moneda por cuenta. Una tarjeta en soles y dólares se registra como dos cuentas.' },
          { key: 'ULTIMOS_4', label: 'Últimos 4 dígitos', type: 'text', hint: 'Solo 4 dígitos, nunca el número completo.' },
          { key: 'SALDO_INICIAL', label: 'Saldo inicial', type: 'number', hint: 'Saldo al cierre de la fecha de abajo. En tarjetas: la deuda en negativo.' },
          { key: 'FECHA_SALDO_INICIAL', label: 'Fecha del saldo inicial', type: 'date' },
          { key: 'LIMITE_CREDITO', label: 'Límite de crédito (tarjetas)', type: 'number' },
          { key: 'DIA_CORTE', label: 'Día de corte (tarjetas)', type: 'number' },
          { key: 'DIA_PAGO', label: 'Día de pago (tarjetas)', type: 'number' },
          { key: 'CUENTA_PAGO_ID', label: 'Se paga desde (tarjetas)', type: 'select', options: cuentas },
          { key: 'CLASE_PATRIMONIO', label: 'Clase', type: 'select', options: op(CLASES_PATRIMONIO) },
          { key: 'ACTIVA', label: 'Activa', type: 'yesno' }, { key: 'FECHA_CIERRE', label: 'Fecha de cierre', type: 'date' },
          { key: 'NOTAS', label: 'Notas', type: 'text' },
        ],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: `${nombreInst.get(s(r.INSTITUCION_ID)) ?? s(r.INSTITUCION_ID)} · ${s(r.TIPO_CUENTA).toLowerCase()} · ${s(r.MONEDA)}${r.SALDO_INICIAL === null || r.SALDO_INICIAL === undefined || r.SALDO_INICIAL === '' ? ' · sin saldo inicial' : ''}` }),
        nuevoId: (r, ex) => slugId(`${s(r.INSTITUCION_ID)}-${s(r.TIPO_CUENTA).split(' ')[0].slice(0, 4)}-${s(r.MONEDA)}`, ex),
        defaults: { MONEDA: 'PEN', CLASE_PATRIMONIO: 'LÍQUIDO', INCLUIR_EN_PATRIMONIO: 'SÍ', PROVISIONAL: 'NO' },
      },
      {
        table: 'CATEGORIAS', titulo: 'Categorías', activoCol: 'ACTIVA',
        campos: [{ key: 'NOMBRE', label: 'Nombre', type: 'text', required: true }, { key: 'TIPO', label: 'Tipo', type: 'select', options: op(['EGRESO', 'INGRESO']), required: true },
          { key: 'CATEGORIA_PADRE_ID', label: 'Grupo', type: 'select', options: grupos, required: true }, { key: 'CLASE', label: 'Clase', type: 'select', options: op(CLASES_CATEGORIA) },
          { key: 'TIPO_50_30_20', label: 'Regla 50/30/20', type: 'select', options: op(TIPOS_50_30_20) }, { key: 'FIJO_VARIABLE', label: 'Fijo o variable', type: 'select', options: op(['FIJO', 'VARIABLE']) },
          { key: 'ESENCIAL', label: 'Esencial', type: 'yesno' }, { key: 'ACTIVA', label: 'Activa', type: 'yesno' }],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: r.CATEGORIA_PADRE_ID ? `${d.nombres.categoria.get(s(r.CATEGORIA_PADRE_ID)) ?? ''} · ${s(r.TIPO).toLowerCase()}` : 'Grupo' }),
        nuevoId: (r, ex) => slugId(s(r.NOMBRE), ex), defaults: { TIPO: 'EGRESO', CLASE: 'CONSUMO', FIJO_VARIABLE: 'VARIABLE' },
      },
      {
        table: 'CENTROS', titulo: 'Centros (para quién)', activoCol: 'ACTIVO',
        campos: [{ key: 'NOMBRE', label: 'Nombre', type: 'text', required: true }, { key: 'DESCRIPCION', label: 'Descripción', type: 'text' }, { key: 'ACTIVO', label: 'Activo', type: 'yesno' }],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: s(r.DESCRIPCION) }), nuevoId: (r, ex) => slugId(s(r.NOMBRE), ex),
      },
      {
        table: 'LUGARES', titulo: 'Lugares', activoCol: 'ACTIVO',
        campos: [{ key: 'NOMBRE', label: 'Nombre', type: 'text', required: true }, { key: 'TIPO', label: 'Tipo', type: 'select', options: op(['DISTRITO', 'CIUDAD']) },
          { key: 'PROVINCIA_O_CIUDAD', label: 'Provincia o ciudad', type: 'text' }, { key: 'PAIS_ID', label: 'País', type: 'select', options: paises, required: true }, { key: 'ACTIVO', label: 'Activo', type: 'yesno' }],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: `${s(r.PROVINCIA_O_CIUDAD)} · ${s(r.PAIS_ID)}` }), nuevoId: (r, ex) => `L-${slugId(s(r.NOMBRE), new Set([...ex].map((x) => x.replace(/^L-/, ''))))}`,
        defaults: { TIPO: 'CIUDAD', PAIS_ID: 'PE' },
      },
      {
        table: 'RECURRENTES', titulo: 'Pagos fijos', activoCol: 'ACTIVO',
        campos: [
          { key: 'DESCRIPCION', label: 'Descripción', type: 'text', required: true }, { key: 'TIPO', label: 'Tipo', type: 'select', options: op(['EGRESO', 'INGRESO', 'TRANSFERENCIA']) },
          { key: 'MONTO_ESTIMADO', label: 'Monto estimado', type: 'number' }, { key: 'MONEDA', label: 'Moneda', type: 'select', options: monedas },
          { key: 'CUENTA_ID', label: 'Se paga con', type: 'select', options: cuentas }, { key: 'CUENTA_DESTINO_ID', label: 'Cuenta destino (transferencias)', type: 'select', options: cuentas },
          { key: 'CATEGORIA_ID', label: 'Categoría', type: 'select', options: cats }, { key: 'CENTRO_ID', label: 'Centro', type: 'select', options: centros },
          { key: 'FRECUENCIA', label: 'Frecuencia', type: 'select', options: op(FRECUENCIAS), required: true }, { key: 'DIA', label: 'Día del mes', type: 'number' },
          { key: 'FECHA_INICIO', label: 'Desde', type: 'date' }, { key: 'FECHA_FIN', label: 'Hasta (opcional)', type: 'date' },
          { key: 'AVISAR_DIAS_ANTES', label: 'Avisar días antes', type: 'number' }, { key: 'ACTIVO', label: '¿Lo sigues pagando?', type: 'yesno' },
        ],
        resumen: (r) => ({ titulo: s(r.DESCRIPCION), detalle: `${s(r.FRECUENCIA).toLowerCase()} · día ${s(r.DIA) || '—'}${r.MONTO_ESTIMADO ? ` · ${dinero(Number(r.MONTO_ESTIMADO), s(r.MONEDA) || 'PEN')}` : ''}` }),
        nuevoId: secuenciaId('REC'), defaults: { TIPO: 'EGRESO', MONEDA: 'PEN', FRECUENCIA: 'MENSUAL', AVISAR_DIAS_ANTES: 3, MONTO_FIJO: 'NO', AUTO_REGISTRAR: 'NO' },
      },
      {
        table: 'REGLAS_CATEGORIZACION', titulo: 'Reglas automáticas', activoCol: 'ACTIVA',
        campos: [{ key: 'PATRON', label: 'Si la descripción contiene…', type: 'text', required: true, hint: 'Ej. taxi, wong, farmacia' },
          { key: 'CATEGORIA_ID', label: '…usar la categoría', type: 'select', options: cats, required: true }, { key: 'CENTRO_ID', label: '…y el centro (opcional)', type: 'select', options: centros },
          { key: 'PRIORIDAD', label: 'Prioridad (1 = primero)', type: 'number' }, { key: 'ACTIVA', label: 'Activa', type: 'yesno' }],
        resumen: (r) => ({ titulo: `"${s(r.PATRON)}" → ${d.nombres.categoria.get(s(r.CATEGORIA_ID)) ?? s(r.CATEGORIA_ID)}` }), nuevoId: secuenciaId('REG'), defaults: { ORIGEN: 'USUARIO', PRIORIDAD: 50 },
      },
      {
        table: 'PRESUPUESTOS', titulo: 'Presupuestos', ayuda: 'Límite de gasto mensual por grupo o categoría. Deja el mes vacío para que valga todos los meses; pon un mes (AAAA-MM) para cambiarlo solo ese mes. Monto 0 = sin presupuesto.',
        campos: [
          { key: 'CATEGORIA_ID', label: 'Grupo o categoría', type: 'select', options: () => [...grupos().map((g) => ({ ...g, group: 'Grupos (incluye todas sus categorías)' })), ...cats()], required: true },
          { key: 'MONTO', label: 'Límite mensual', type: 'number', required: true }, { key: 'MONEDA', label: 'Moneda', type: 'select', options: monedas },
          { key: 'MES', label: 'Solo para el mes (opcional)', type: 'text', hint: 'Ej. 2026-12. Vacío = todos los meses.' },
          { key: 'CENTRO_ID', label: 'Solo para el centro (opcional)', type: 'select', options: centros },
        ],
        resumen: (r) => ({ titulo: d.nombres.categoria.get(s(r.CATEGORIA_ID)) ?? s(r.CATEGORIA_ID), detalle: `${dinero(Number(r.MONTO) || 0, s(r.MONEDA) || 'PEN')} al mes · ${s(r.MES) ? `solo ${s(r.MES).slice(0, 7)}` : 'todos los meses'}${r.CENTRO_ID ? ` · ${d.nombres.centro.get(s(r.CENTRO_ID)) ?? s(r.CENTRO_ID)}` : ''}` }),
        nuevoId: secuenciaId('PRE'), defaults: { MONEDA: 'PEN' },
      },
      {
        table: 'METAS', titulo: 'Metas de ahorro', esActivo: (r) => !['LOGRADA', 'CANCELADA', 'PAUSADA'].includes(s(r.ESTADO).toUpperCase()),
        ayuda: 'Vincula la cuenta donde guardas ese ahorro: el avance se calcula solo con su saldo.',
        campos: [
          { key: 'NOMBRE', label: 'Nombre', type: 'text', required: true, hint: 'Ej. Viaje a Grecia, Fondo de emergencia' },
          { key: 'TIPO', label: 'Tipo', type: 'select', options: op(['AHORRO', 'FONDO DE EMERGENCIA', 'VIAJE', 'COMPRA', 'INVERSIÓN', 'PAGAR DEUDA', 'OTRO']) },
          { key: 'MONTO_OBJETIVO', label: 'Monto objetivo', type: 'number', required: true }, { key: 'MONEDA', label: 'Moneda', type: 'select', options: monedas, required: true },
          { key: 'FECHA_OBJETIVO', label: 'Fecha objetivo', type: 'date' }, { key: 'CUENTA_ID', label: 'Cuenta donde ahorras', type: 'select', options: cuentas },
          { key: 'APORTE_MENSUAL', label: 'Aporte mensual planeado', type: 'number' }, { key: 'PRIORIDAD', label: 'Prioridad (1 = primero)', type: 'number' },
          { key: 'ESTADO', label: 'Estado', type: 'select', options: op(['ACTIVA', 'PAUSADA', 'LOGRADA', 'CANCELADA']) }, { key: 'NOTAS', label: 'Notas', type: 'text' },
        ],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: `${dinero(Number(r.MONTO_OBJETIVO) || 0, s(r.MONEDA) || 'PEN')}${r.FECHA_OBJETIVO ? ` · para ${toIsoDate(r.FECHA_OBJETIVO) ?? ''}` : ''} · ${s(r.ESTADO).toLowerCase() || 'activa'}` }),
        nuevoId: secuenciaId('META'), defaults: { MONEDA: 'PEN', ESTADO: 'ACTIVA', PRIORIDAD: 1, TIPO: 'AHORRO' },
      },
      {
        table: 'ACTIVOS', titulo: 'Bienes (casa, autos…)', activoCol: 'ACTIVO',
        ayuda: 'Suman a tu patrimonio neto con su valor estimado. Si un bien tiene una deuda (préstamo), vincúlala.',
        campos: [
          { key: 'NOMBRE', label: 'Nombre', type: 'text', required: true, hint: 'Ej. Departamento, Peugeot, Renault' },
          { key: 'TIPO', label: 'Tipo', type: 'select', options: op(['INMUEBLE', 'VEHÍCULO', 'INVERSIÓN', 'OTRO']) },
          { key: 'CENTRO_ID', label: 'Centro', type: 'select', options: centros },
          { key: 'FECHA_ADQUISICION', label: 'Fecha de compra', type: 'date' }, { key: 'COSTO_ADQUISICION', label: 'Costo de compra', type: 'number' },
          { key: 'MONEDA', label: 'Moneda', type: 'select', options: monedas, required: true },
          { key: 'VALOR_ESTIMADO', label: 'Valor estimado hoy', type: 'number' }, { key: 'FECHA_VALORACION', label: 'Fecha del valor estimado', type: 'date' },
          { key: 'CUENTA_DEUDA_ID', label: 'Deuda asociada (opcional)', type: 'select', options: cuentas },
          { key: 'ACTIVO', label: '¿Lo tienes todavía?', type: 'yesno' }, { key: 'NOTAS', label: 'Notas', type: 'text' },
        ],
        resumen: (r) => ({ titulo: s(r.NOMBRE), detalle: `${s(r.TIPO).toLowerCase()}${r.VALOR_ESTIMADO ? ` · ${dinero(Number(r.VALOR_ESTIMADO), s(r.MONEDA) || 'PEN', false)}` : ''}` }),
        nuevoId: secuenciaId('ACT'), defaults: { MONEDA: 'PEN', TIPO: 'INMUEBLE' },
      },
    ];
    return list;
  }, [d, store.tables.PAISES]);

  const inicial = !abierto && seccionInicial && !cerroInicial ? specs.find((sp) => sp.table === seccionInicial) : null;
  if (abierto || inicial) return <CatalogEditor spec={(abierto ?? inicial)!} onBack={() => { setAbierto(null); setCerroInicial(true); }} />;

  const sheetUrl = st.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${st.spreadsheetId}/edit` : null;
  const ultimoTc = d.tiposCambio.filter((t) => t.moneda === 'USD').slice(-1)[0];

  return (
    <main className="screen">
      <div className="row"><h1>Configuración</h1><button className="btn link" onClick={onExit}>Cerrar</button></div>
      <section className="card">
        <ul className="plain">
          {specs.map((sp) => (
            <li key={sp.table}><button type="button" className="mov" onClick={() => setAbierto(sp)}><span className="mov-desc">{sp.titulo}</span><span className="muted">›</span></button></li>
          ))}
        </ul>
      </section>
      <section className="card stack">
        <h2>Monedas y tipo de cambio</h2>
        <p className="muted">Último tipo de cambio guardado (USD): {ultimoTc ? `${ultimoTc.venta} del ${ultimoTc.fecha}` : 'ninguno'}. Se registra al anotar un gasto en dólares.</p>
      </section>
      <section className="card stack">
        <h2>Datos</h2>
        <p className="muted">Última sincronización: {store.lastSync ?? '—'} · cambios sin enviar: {store.pending}</p>
        {store.error && <Status kind="warn">{store.error}</Status>}
        <button className="btn secondary" onClick={() => void sync()} disabled={store.syncing}>{store.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
        {sheetUrl && <a className="btn secondary" href={sheetUrl} target="_blank" rel="noopener noreferrer">Abrir mi hoja en Google Sheets (bitácora y respaldo)</a>}
      </section>
      <SeguridadCard />
      <section className="card stack">
        <h2>Este dispositivo</h2>
        <p className="muted">Bloqueo: {st.webauthnCredentialId ? (tieneEnvolturaBiometrica() ? 'Face ID / huella abre la app sin PIN (PIN de respaldo)' : 'Al abrir la app: PIN (este dispositivo no entrega a la web la llave de Face ID). Al volver a la app abierta: Face ID') : 'Solo PIN'}</p>
        {(!st.webauthnCredentialId || !tieneEnvolturaBiometrica()) && (
          <button className="btn" onClick={async () => {
            try {
              const r = await activarBiometria();
              toast(r === 'prf' ? 'Listo: la próxima vez bastará Face ID.' : 'Face ID activado. Este dispositivo pedirá además el PIN al abrir la app.');
              setBioVer((v) => v + 1);
            } catch { toast('No se pudo activar Face ID / huella.'); }
          }}>{st.webauthnCredentialId ? 'Volver a activar Face ID / huella' : 'Activar Face ID / huella'}</button>
        )}
        <div className="stack">
          <span className="muted">Pedir Face ID / PIN al volver a la app después de:</span>
          <div className="fourier-n lock-min" role="radiogroup" aria-label="Minutos antes de bloquear">
            {[1, 2, 5, 15].map((m) => {
              const actual = st.lockAfterMinutes ?? 2;
              return <button key={m} type="button" role="radio" aria-checked={actual === m} className={actual === m ? 'on' : ''}
                onClick={() => { saveSettings({ lockAfterMinutes: m }); setBioVer((v) => v + 1); }}>{m} min</button>;
            })}
          </div>
          <span className="muted small">Si el iPhone cierra la app por completo, siempre se pedirá al abrirla.</span>
        </div>
        <p className="muted">Cuenta vinculada: {st.ownerEmail ?? '—'}</p>
        <button className="btn secondary" onClick={onChangeSheet}>Cambiar hoja de cálculo</button>
        <button className="btn secondary" onClick={onSignOut}>Cerrar sesión de Google</button>
        <button className="btn secondary danger" onClick={() => { if (confirm('Se borrarán de este dispositivo la sesión, el bloqueo y la copia local de tus datos. Tu base de datos en Drive no se toca. ¿Continuar?')) onWipe(); }}>
          Borrar todo de este dispositivo
        </button>
      </section>
    </main>
  );
}
