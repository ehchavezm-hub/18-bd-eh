import { useMemo, useState } from 'react';
import { notificationsEnabled } from '../pagos/notify';
import { useData } from '../../data/useData';
import { useStore } from '../../data/store';
import { calcularSaldos, totales } from '../../domain/balances';
import { acumuladoDiario, gastoPorPeriodo, resumenMes, ultimoMesConDatos } from '../../domain/reports';
import { FourierArt } from '../../ui/FourierArt';
import { porAtender } from '../../domain/recurring';
import { addMonths, dayLabel, daysInMonth, monthKey, monthLong, todayIso } from '../../domain/dates';
import { dinero } from '../../domain/format';
import { ChartCard, LineCompare } from '../../ui/charts';
import { Empty, Status } from '../../ui/kit';
import type { Prefill } from '../anotar/MovementForm';
import type { Ocurrencia } from '../../domain/recurring';

/** D1 · Inicio: ¿cómo voy hoy? */
export function HomeScreen({ onPagar, onVerPagos, onVerCuentas, onVerDashboards }: { onPagar: (p: Prefill) => void; onVerPagos: () => void; onVerCuentas: () => void; onVerDashboards: () => void }) {
  const d = useData();
  const hoy = todayIso();
  const mes = monthKey(hoy);
  const anterior = addMonths(mes, -1);
  const dia = +hoy.slice(8, 10);

  const v = useMemo(() => {
    const saldos = calcularSaldos(d.cuentas, d.movs);
    const t = totales(saldos.values());
    const sinSaldoInicial = [...saldos.values()].filter((s) => s.cuenta.activa && !s.confiable && s.movimientos > 0).length;
    const actual = resumenMes(d.movs, mes);
    const acumAct = acumuladoDiario(d.movs, mes, dia);
    const acumAnt = acumuladoDiario(d.movs, anterior, daysInMonth(anterior));
    const antHastaHoy = acumAnt[Math.min(dia, acumAnt.length) - 1] ?? 0;
    // Gasto de los últimos 12 meses con datos: es la figura que dibuja el arte de Fourier.
    const conDatos = [...new Set(d.movs.filter((m) => m.tipo === 'EGRESO' && m.estado === 'PAGADO').map((m) => m.fecha.slice(0, 7)))].sort().slice(-12);
    const forma = gastoPorPeriodo(d.movs, conDatos);
    return { t, sinSaldoInicial, actual, acumAct, acumAnt, antHastaHoy, pagos: porAtender(d.recurrentes, d.movs, hoy), ultimo: ultimoMesConDatos(d.movs), forma };
  }, [d, mes, anterior, dia, hoy]);

  const delta = v.antHastaHoy > 0 ? (v.actual.egresos - v.antHastaHoy) / v.antHastaHoy : null;

  return (
    <main className="screen">
      <Header />

      <PrimerosPasos onVerCuentas={onVerCuentas} onVerPagos={onVerPagos} />

      <section className="card stack hero" onClick={onVerCuentas} role="button" tabIndex={0}>
        <FourierArt valores={v.forma} className="hero-art" />
        <span className="hero-caption" title="La figura es tu gasto de los últimos 12 meses con datos, trazado con una serie de Fourier (círculos que giran sobre círculos).">∿ Tu gasto de 12 meses en series de Fourier</span>
        <p className="muted">Disponible</p>
        {Object.keys(v.t.disponible).length === 0 ? <p className="muted">Configura el saldo inicial de tus cuentas.</p> : (
          <div className="hero-figures">
            {Object.entries(v.t.disponible).map(([mon, val]) => <strong key={mon} className="hero-num">{dinero(val, mon)}</strong>)}
          </div>
        )}
        {v.sinSaldoInicial > 0 && <Status kind="warn">{v.sinSaldoInicial === 1 ? '1 cuenta sin saldo inicial' : `${v.sinSaldoInicial} cuentas sin saldo inicial`}: el disponible es aproximado</Status>}
      </section>

      {v.ultimo && v.ultimo < mes && (
        <section className="card stack">
          <Status kind="info">Aún no registras movimientos en {monthLong(mes)}. Tu último mes con datos es {monthLong(v.ultimo)}.</Status>
          <button className="btn secondary" onClick={onVerDashboards}>Ver dashboards de tu historial</button>
        </section>
      )}

      <div className="kpis">
        <div className="card kpi">
          <span className="muted small">Gasto de {monthLong(mes).split(' ')[0]}</span>
          <strong>{dinero(v.actual.egresos, 'PEN', false)}</strong>
          {delta !== null && (
            <span className={`small ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))} % vs. mismo día del mes anterior</span>
          )}
        </div>
        <div className="card kpi">
          <span className="muted small">Ingresos del mes</span>
          <strong>{dinero(v.actual.ingresos, 'PEN', false)}</strong>
        </div>
        <div className="card kpi">
          <span className="muted small">Deuda de tarjetas</span>
          {Object.keys(v.t.deudaTarjetas).length === 0 ? <strong>—</strong> : Object.entries(v.t.deudaTarjetas).map(([mon, val]) => <strong key={mon}>{dinero(val, mon, false)}</strong>)}
        </div>
      </div>

      <ChartCard
        title="Gasto acumulado del mes"
        subtitle={`${monthLong(mes)} frente a ${monthLong(anterior)}`}
        legend={[{ label: 'Este mes', className: 'series-1' }, { label: 'Mes anterior', className: 'muted-series' }]}
        table={{ headers: ['Día', 'Este mes', 'Mes anterior'], rows: v.acumAnt.map((a, i) => [i + 1, v.acumAct[i] ?? '', a]) }}
        footnote={v.actual.sinTipoCambio > 0 ? `${v.actual.sinTipoCambio === 1 ? '1 gasto' : `${v.actual.sinTipoCambio} gastos`} en otra moneda sin tipo de cambio no ${v.actual.sinTipoCambio === 1 ? 'está incluido' : 'están incluidos'}.` : undefined}
      >
        <LineCompare actual={v.acumAct} anterior={v.acumAnt} dias={Math.max(daysInMonth(mes), v.acumAnt.length)} format={(x) => dinero(x)} />
      </ChartCard>

      <section className="card stack">
        <div className="row"><h2>Pagos por atender</h2><button className="btn link small" onClick={onVerPagos}>Ver todos</button></div>
        {v.pagos.length === 0 ? <Empty>No hay pagos fijos próximos ni vencidos.</Empty> : <PagosLista items={v.pagos.slice(0, 5)} onPagar={onPagar} />}
      </section>
    </main>
  );
}

export function PagosLista({ items, onPagar, onOmitir }: { items: Ocurrencia[]; onPagar: (p: Prefill) => void; onOmitir?: (o: Ocurrencia) => void }) {
  return (
    <ul className="plain">
      {items.map((o) => (
        <li key={o.recurrente.id + o.fecha} className="pay">
          <div className="pay-main">
            <span>{o.recurrente.descripcion}</span>
            <span className="muted small">{dayLabel(o.fecha)} · {o.recurrente.montoEstimado ? dinero(o.recurrente.montoEstimado, o.recurrente.moneda) : 'monto variable'}</span>
          </div>
          <EstadoPago o={o} />
          {(o.estado === 'VENCIDO' || o.estado === 'PRÓXIMO' || o.estado === 'PENDIENTE') && (
            <div className="pay-actions">
              <button className="btn small" onClick={() => onPagar({
                tipo: o.recurrente.tipo, descripcion: o.recurrente.descripcion, monto: o.recurrente.montoEstimado, cuentaId: o.recurrente.cuentaId,
                cuentaDestinoId: o.recurrente.cuentaDestinoId, categoriaId: o.recurrente.categoriaId, centroId: o.recurrente.centroId, recurrenteId: o.recurrente.id,
              })}>Pagar</button>
              {onOmitir && <button className="btn small secondary" onClick={() => onOmitir(o)}>Omitir</button>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EstadoPago({ o }: { o: Ocurrencia }) {
  switch (o.estado) {
    case 'PAGADO': return <Status kind="ok">Pagado</Status>;
    case 'OMITIDO': return <Status kind="info">Omitido</Status>;
    case 'VENCIDO': return <Status kind="error">Vencido hace {-o.diasPara} d</Status>;
    case 'PRÓXIMO': return <Status kind="warn">{o.diasPara === 0 ? 'Vence hoy' : `En ${o.diasPara} d`}</Status>;
    default: return <Status kind="info">Pendiente</Status>;
  }
}

const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function Header() {
  const s = useStore();
  const ahora = new Date();
  const h = ahora.getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <div className="row">
      <div>
        <h1>{saludo}</h1>
        <p className="muted small">{DIAS_SEM[ahora.getDay()]} {ahora.getDate()} de {MESES_L[ahora.getMonth()]}</p>
      </div>
      <SyncBadge pending={s.pending} syncing={s.syncing} error={s.error} />
    </div>
  );
}

const OCULTAR = 'finanzas.primeros-pasos.oculto';

/** Primeros pasos: lo que falta para que los números sean reales (se oculta al completar). */
function PrimerosPasos({ onVerCuentas, onVerPagos }: { onVerCuentas: () => void; onVerPagos: () => void }) {
  const d = useData();
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem(OCULTAR) === '1'; } catch { return false; } });
  const usadas = d.cuentas.filter((c) => c.activa && c.tipo !== 'POR CONFIRMAR' && c.clasePatrimonio !== 'POR COBRAR');
  const conSaldo = usadas.filter((c) => c.saldoInicial !== null).length;
  const pagosActivos = d.recurrentes.some((r) => r.activo);
  const instalada = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const avisos = notificationsEnabled();
  const pasos = [
    { ok: conSaldo > 0 && conSaldo === usadas.length, titulo: 'Fija el saldo de tus cuentas', detalle: `${conSaldo} de ${usadas.length} cuentas listas`, accion: onVerCuentas },
    { ok: pagosActivos, titulo: 'Activa tus pagos fijos', detalle: 'Luz, teléfono, internet, pensión…', accion: onVerPagos },
    { ok: avisos, titulo: 'Activa los avisos', detalle: 'Te recuerda los pagos próximos', accion: onVerPagos },
    { ok: instalada, titulo: 'Instala la app', detalle: 'iPhone: Compartir → Añadir a inicio · PC: ícono de instalar', accion: undefined },
  ];
  const hechos = pasos.filter((p) => p.ok).length;
  if (oculto || hechos === pasos.length) return null;
  return (
    <section className="card stack onboarding">
      <div className="row">
        <div><h2>Primeros pasos</h2><p className="muted small">{hechos} de {pasos.length} listos</p></div>
        <button className="btn link small" onClick={() => { setOculto(true); try { localStorage.setItem(OCULTAR, '1'); } catch { /* nada */ } }}>Ocultar</button>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={hechos} aria-valuemin={0} aria-valuemax={pasos.length}><span style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
      <ul className="plain steps">
        {pasos.map((p) => (
          <li key={p.titulo}>
            <button type="button" className={`step${p.ok ? ' done' : ''}`} onClick={p.accion} disabled={!p.accion || p.ok}>
              <span className="step-check" aria-hidden="true">{p.ok ? '✓' : ''}</span>
              <span className="mov-main"><span>{p.titulo}</span><span className="muted small">{p.ok ? 'Listo' : p.detalle}</span></span>
              {!p.ok && p.accion && <span className="muted" aria-hidden="true">›</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SyncBadge({ pending, syncing, error }: { pending: number; syncing: boolean; error: string | null }) {
  if (syncing) return <span className="muted small">Sincronizando…</span>;
  if (error) return <Status kind="warn">{pending > 0 ? `${pending} sin enviar` : 'Sin conexión'}</Status>;
  if (pending > 0) return <Status kind="warn">{pending} sin enviar</Status>;
  return <Status kind="ok">Al día</Status>;
}
