/**
 * Control y metas: presupuesto del mes, cierre de mes, patrimonio neto y metas de ahorro.
 */
import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import { save, log, useStore } from '../../data/store';
import { secuenciaId } from '../admin/CatalogEditor';
import { avancePresupuestos, avanceMetas, cierreMes, patrimonioMensual, sugerirPresupuestos, type AvancePresupuesto } from '../../domain/plan';
import { addMonths, monthKey, monthLong, monthShort, todayIso } from '../../domain/dates';
import { dinero, pct } from '../../domain/format';
import { ChartCard, ColumnChart } from '../../ui/charts';
import { Select, Status, toast } from '../../ui/kit';

const fmt = (v: number) => dinero(v, 'PEN', false);
const signo = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

/** Barra de presupuesto: relleno = gastado; marca = proyección al cierre del mes. */
export function BarraPresupuesto({ a }: { a: AvancePresupuesto }) {
  const r = Math.min(1, a.pct);
  const proy = a.proyeccion !== null && a.limite > 0 ? Math.min(1.15, a.proyeccion / a.limite) : null;
  return (
    <div className="budget">
      <div className="budget-head">
        <span className="budget-name">{a.nombre}</span>
        <span className={`budget-pct ${a.estado}`}>{Math.round(a.pct * 100)} %</span>
      </div>
      <div className={`budget-bar ${a.estado}`} role="meter" aria-valuenow={Math.round(a.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.nombre}: ${Math.round(a.pct * 100)} % del presupuesto`}>
        <span style={{ width: `${r * 100}%` }} />
        {proy !== null && proy > r && <i className="budget-proj" style={{ left: `${Math.min(100, proy * 100)}%` }} title="Proyección al cierre del mes" />}
      </div>
      <div className="budget-foot muted small">
        <span>{fmt(a.gastado)} de {fmt(a.limite)}</span>
        <span>
          {a.estado === 'excedido' ? `Te pasaste por ${fmt(a.gastado - a.limite)}` : `Quedan ${fmt(a.limite - a.gastado)}`}
          {a.proyeccion !== null && a.proyeccion > a.limite && a.estado !== 'excedido' ? ` · a este ritmo cerrarás en ${fmt(a.proyeccion)}` : ''}
        </span>
      </div>
    </div>
  );
}

export function PlanView({ onConfigurar, onVerMovimientos }: { onConfigurar: (seccion: string) => void; onVerMovimientos: (f: { mes?: string; categoriaId?: string }) => void }) {
  const d = useData();
  const hoy = todayIso();
  const mesActual = monthKey(hoy);

  // ---------- Presupuesto del mes
  const avance = useMemo(() => avancePresupuestos(d.presupuestos, d.movs, d.categoriasById, mesActual, hoy), [d, mesActual, hoy]);
  const sugeridos = useMemo(() => (d.presupuestos.length ? [] : sugerirPresupuestos(d.movs, d.categoriasById, ultimoMesConGasto(d.movs) ?? mesActual)), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [creando, setCreando] = useState(false);
  const { tables } = useStore();
  async function crearSugeridos() {
    setCreando(true);
    try {
      const existentes = new Set((tables.PRESUPUESTOS ?? []).map((r) => String(r.PRESUPUESTO_ID)));
      for (const s of sugeridos) {
        const id = secuenciaId('PRE')({}, existentes);
        existentes.add(id);
        await save('PRESUPUESTOS', { PRESUPUESTO_ID: id, MES: '', CATEGORIA_ID: s.categoriaId, CENTRO_ID: '', MONTO: s.monto, MONEDA: 'PEN' }, 'append');
        await log('PRESUPUESTOS', id, '*', '', 'creado (sugerido)', 'Plan');
      }
      toast(`${sugeridos.length} presupuestos creados. Puedes ajustarlos en Configuración.`);
    } finally { setCreando(false); }
  }
  const totalLimite = avance.reduce((s, a) => s + a.limite, 0), totalGastado = avance.reduce((s, a) => s + a.gastado, 0);

  // ---------- Cierre de mes
  const meses = useMemo(() => [...new Set(d.movs.map((m) => monthKey(m.fecha)))].sort().reverse(), [d.movs]);
  const mesCierreDefecto = meses.find((m) => m < mesActual) ?? addMonths(mesActual, -1);
  const [mesCierre, setMesCierre] = useState<string | null>(null);
  const mc = mesCierre ?? mesCierreDefecto;
  const C = useMemo(() => cierreMes(d.movs, d.categoriasById, d.recurrentes, mc), [d, mc]);
  const excedidosCierre = useMemo(() => avancePresupuestos(d.presupuestos, d.movs, d.categoriasById, mc, hoy).filter((a) => a.estado === 'excedido'), [d, mc, hoy]);

  // ---------- Patrimonio
  const P = useMemo(() => {
    const ultimos = Array.from({ length: 24 }, (_, i) => addMonths(mesActual, i - 23)).filter((k) => !meses.length || k >= meses[meses.length - 1]);
    return patrimonioMensual(d.cuentas, d.movs, d.activos, ultimos);
  }, [d, mesActual, meses]);
  const ult = P.puntos[P.puntos.length - 1];
  const hace12 = P.puntos.length > 12 ? P.puntos[P.puntos.length - 13] : P.puntos[0];

  // ---------- Metas
  const M = useMemo(() => avanceMetas(d.metas, d.cuentas, d.movs, hoy), [d, hoy]);

  return (
    <>
      {/* PRESUPUESTO */}
      <section className="card stack">
        <div className="row">
          <div><h2>Presupuesto de {monthLong(mesActual)}</h2>
            {avance.length > 0 && <p className="muted">{fmt(totalGastado)} de {fmt(totalLimite)} ({pct(totalLimite ? totalGastado / totalLimite : 0)}) · día {+hoy.slice(8, 10)}</p>}</div>
          <button className="btn link small" onClick={() => onConfigurar('PRESUPUESTOS')}>Editar</button>
        </div>
        {avance.length > 0 ? (
          <div className="stack budgets">
            {avance.map((a) => (
              <button key={a.presupuesto.id} type="button" className="budget-btn" onClick={() => onVerMovimientos({ mes: mesActual, categoriaId: a.presupuesto.categoriaId })}>
                <BarraPresupuesto a={a} />
              </button>
            ))}
            <p className="muted small">Aviso al llegar al 80 % y al pasar el 100 %. La línea fina es la proyección al cierre del mes al ritmo actual.</p>
          </div>
        ) : sugeridos.length > 0 ? (
          <div className="stack">
            <p className="muted">Aún no tienes presupuestos. Te sugiero estos, según tu gasto promedio de los últimos 6 meses:</p>
            <ul className="plain sugeridos">{sugeridos.map((s) => <li key={s.categoriaId}><span>{s.nombre}</span><strong>{fmt(s.monto)}/mes</strong></li>)}</ul>
            <button className="btn" disabled={creando} onClick={() => void crearSugeridos()}>{creando ? 'Creando…' : `Crear estos ${sugeridos.length} presupuestos`}</button>
            <button className="btn link" onClick={() => onConfigurar('PRESUPUESTOS')}>Prefiero crearlos yo</button>
          </div>
        ) : (
          <button className="btn" onClick={() => onConfigurar('PRESUPUESTOS')}>Crear un presupuesto</button>
        )}
      </section>

      {/* CIERRE DE MES */}
      <section className="card stack">
        <div className="row">
          <h2>Cierre de mes</h2>
          <div className="cierre-mes"><Select value={mc} onChange={(v) => setMesCierre(v || null)} placeholder={monthLong(mesCierreDefecto)} options={meses.map((m) => ({ value: m, label: monthLong(m) }))} /></div>
        </div>
        <div className="kpis">
          <div className="kpi card"><span className="muted small">Ingresos</span><strong>{fmt(C.ingresos)}</strong></div>
          <div className="kpi card"><span className="muted small">Gastos</span><strong>{fmt(C.egresos)}</strong>
            <span className="muted small">{C.egresosAnterior ? `${signo(C.egresos - C.egresosAnterior)} vs ${monthShort(addMonths(mc, -1))}` : ''}</span></div>
          <div className="kpi card"><span className="muted small">Ahorro</span><strong className={C.ahorro < 0 ? 'neg' : ''}>{fmt(C.ahorro)}</strong>
            <span className="muted small">{C.tasaAhorro !== null ? `${pct(C.tasaAhorro)} de tus ingresos` : 'sin ingresos registrados'}</span></div>
        </div>
        <ul className="plain cierre">
          <li>{C.promedio6 ? (C.egresos > C.promedio6
            ? <>Gastaste <strong>{fmt(C.egresos - C.promedio6)} más</strong> que tu promedio de 6 meses ({fmt(C.promedio6)}).</>
            : <>Gastaste <strong>{fmt(C.promedio6 - C.egresos)} menos</strong> que tu promedio de 6 meses ({fmt(C.promedio6)}).</>) : 'Aún no hay 6 meses previos para comparar.'}</li>
          {C.subieron.length > 0 && <li><span className="muted">Lo que más subió vs el mes anterior:</span>
            <ul className="plain sub">{C.subieron.map((c) => <li key={c.id}><button type="button" className="link-row" onClick={() => onVerMovimientos({ mes: mc, categoriaId: c.id === 'SIN' ? undefined : c.id })}><span>{c.nombre}</span><strong className="neg">{signo(c.diferencia)}</strong></button></li>)}</ul></li>}
          {C.bajaron.length > 0 && <li><span className="muted">Lo que más bajó:</span>
            <ul className="plain sub">{C.bajaron.map((c) => <li key={c.id}><span>{c.nombre}</span><strong className="pos">{signo(c.diferencia)}</strong></li>)}</ul></li>}
          {C.pagosQueSubieron.length > 0 && <li><span className="muted">Pagos fijos que subieron:</span>
            <ul className="plain sub">{C.pagosQueSubieron.map((p) => <li key={p.id}><span>{p.nombre}</span><strong className="neg">{fmt(p.antes)} → {fmt(p.ahora)}</strong></li>)}</ul></li>}
          {excedidosCierre.length > 0 && <li><span className="muted">Presupuestos excedidos:</span>
            <ul className="plain sub">{excedidosCierre.map((a) => <li key={a.presupuesto.id}><span>{a.nombre}</span><strong className="neg">{fmt(a.gastado)} / {fmt(a.limite)}</strong></li>)}</ul></li>}
        </ul>
      </section>

      {/* PATRIMONIO */}
      {ult && (
        <ChartCard title="Patrimonio neto" subtitle={<>Al cierre de {monthLong(ult.mes)}: <strong>{fmt(ult.neto)}</strong>{hace12 && hace12 !== ult ? ` · ${signo(ult.neto - hace12.neto)} desde ${monthShort(hace12.mes)}` : ''}</>}
          table={{ headers: ['Mes', 'Dinero', 'Inversiones', 'Por cobrar', 'Bienes', 'Deudas', 'Neto'], rows: P.puntos.map((p) => [monthShort(p.mes), p.liquido, p.inversiones, p.porCobrar, p.bienes, -p.deudas, p.neto]) }}
          footnote={<>Dinero e inversiones de tus cuentas + bienes − deudas (tarjetas y préstamos), en soles al tipo de cambio de cada cierre.{P.sinTc ? ` ${P.sinTc} saldos en otra moneda sin tipo de cambio no se incluyeron.` : ''}</>}>
          <ColumnChart etiquetas={P.puntos.map((p) => monthShort(p.mes))} valores={P.puntos.map((p) => Math.max(0, p.neto))} format={fmt} etiquetaCada={Math.ceil(P.puntos.length / 6)} resaltar={P.puntos.length - 1} />
          <ul className="plain patrimonio">
            <li><span>Dinero</span><strong>{fmt(ult.liquido)}</strong></li>
            {ult.inversiones !== 0 && <li><span>Inversiones y retiro</span><strong>{fmt(ult.inversiones)}</strong></li>}
            {ult.porCobrar !== 0 && <li><span>Por cobrar</span><strong>{fmt(ult.porCobrar)}</strong></li>}
            <li><span>Bienes</span><strong>{ult.bienes ? fmt(ult.bienes) : <button className="btn link small" onClick={() => onConfigurar('ACTIVOS')}>Agregar casa, autos…</button>}</strong></li>
            <li><span>Deudas</span><strong className="neg">−{fmt(ult.deudas)}</strong></li>
          </ul>
          {P.sinSaldoInicial.length > 0 && (
            <Status kind="warn">{P.sinSaldoInicial.length} cuenta(s) sin saldo inicial ({P.sinSaldoInicial.slice(0, 3).map((c) => c.nombre).join(', ')}{P.sinSaldoInicial.length > 3 ? '…' : ''}): su saldo es solo la suma de movimientos y el patrimonio es aproximado.{' '}
              <button className="btn link small" onClick={() => onConfigurar('CUENTAS')}>Completar saldos</button></Status>
          )}
        </ChartCard>
      )}

      {/* METAS */}
      <section className="card stack">
        <div className="row"><h2>Metas de ahorro</h2><button className="btn link small" onClick={() => onConfigurar('METAS')}>{M.length ? 'Editar' : '+ Crear'}</button></div>
        {M.length === 0 && <p className="muted">Crea una meta (viaje, fondo de emergencia, compra) y vincúlala a la cuenta donde ahorras: el avance se calcula solo.</p>}
        {M.map((a) => (
          <div key={a.meta.id} className="meta">
            <div className="budget-head"><span className="budget-name">{a.meta.nombre}</span><span className={`budget-pct ${a.pct >= 1 ? 'ok' : ''}`}>{Math.round(a.pct * 100)} %</span></div>
            <div className="budget-bar meta-bar"><span style={{ width: `${a.pct * 100}%` }} /></div>
            <div className="budget-foot muted small">
              <span>{a.actual === null ? 'Vincula una cuenta para medir el avance' : `${dinero(a.actual, a.meta.moneda, false)} de ${dinero(a.meta.objetivo, a.meta.moneda, false)}`}</span>
              <span>{a.falta === 0 ? '¡Lograda!' : a.necesarioMes !== null
                ? `Necesitas ${dinero(a.necesarioMes, a.meta.moneda, false)}/mes${a.mesesRestantes ? ` por ${a.mesesRestantes} meses` : ''}`
                : `Faltan ${dinero(a.falta, a.meta.moneda, false)}`}</span>
            </div>
            {a.aTiempo === false && <Status kind="warn">Con tu aporte de {dinero(a.meta.aporteMensual ?? 0, a.meta.moneda, false)}/mes no llegas a tiempo.</Status>}
            {a.aTiempo === true && a.falta > 0 && <Status kind="ok">Vas a tiempo.</Status>}
          </div>
        ))}
      </section>
    </>
  );
}

function ultimoMesConGasto(movs: { fecha: string; tipo: string; estado: string; eliminado: boolean }[]): string | null {
  let max: string | null = null;
  for (const m of movs) if (m.tipo === 'EGRESO' && m.estado === 'PAGADO' && !m.eliminado && (!max || m.fecha > max)) max = m.fecha;
  return max ? addMonths(monthKey(max), 1) : null;
}
