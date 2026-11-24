import { useMemo } from 'react';
import { useData } from '../../data/useData';
import { useStore } from '../../data/store';
import { calcularSaldos, totales } from '../../domain/balances';
import { acumuladoDiario, resumenMes, ultimoMesConDatos } from '../../domain/reports';
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
    return { t, sinSaldoInicial, actual, acumAct, acumAnt, antHastaHoy, pagos: porAtender(d.recurrentes, d.movs, hoy), ultimo: ultimoMesConDatos(d.movs) };
  }, [d, mes, anterior, dia, hoy]);

  const delta = v.antHastaHoy > 0 ? (v.actual.egresos - v.antHastaHoy) / v.antHastaHoy : null;

  return (
    <main className="screen">
      <Header />

      <section className="card stack hero" onClick={onVerCuentas} role="button" tabIndex={0}>
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

function Header() {
  const s = useStore();
  return (
    <div className="row">
      <h1>Inicio</h1>
      <SyncBadge pending={s.pending} syncing={s.syncing} error={s.error} />
    </div>
  );
}

export function SyncBadge({ pending, syncing, error }: { pending: number; syncing: boolean; error: string | null }) {
  if (syncing) return <span className="muted small">Sincronizando…</span>;
  if (error) return <Status kind="warn">{pending > 0 ? `${pending} sin enviar` : 'Sin conexión'}</Status>;
  if (pending > 0) return <Status kind="warn">{pending} sin enviar</Status>;
  return <Status kind="ok">Al día</Status>;
}
