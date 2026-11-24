import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import { calorGrupoMes, gastoPor, regla503020, resumenMes, ultimosMeses } from '../../domain/reports';
import { addMonths, monthKey, monthLong, monthShort, todayIso } from '../../domain/dates';
import { dinero } from '../../domain/format';
import { BarList, ChartCard, Heatmap, MonthBars, SegmentedBar } from '../../ui/charts';
import { Segmented, Select, Status } from '../../ui/kit';

/** D2 · Gasto del mes y D3 · Tendencias. */
export function ReportsScreen({ onVerMovimientos }: { onVerMovimientos: (f: { mes?: string; categoriaId?: string; centroId?: string }) => void }) {
  const d = useData();
  const hoy = todayIso();
  const [vista, setVista] = useState<'mes' | 'tendencias'>('mes');
  const [mes, setMes] = useState(monthKey(hoy));
  const [centroId, setCentroId] = useState('');
  const f = { centroId: centroId || null };

  const meses = useMemo(() => {
    const set = new Set(d.movs.map((m) => monthKey(m.fecha)));
    set.add(monthKey(hoy));
    return [...set].sort().reverse();
  }, [d.movs, hoy]);

  const mesData = useMemo(() => ({
    resumen: resumenMes(d.movs, mes, f),
    porCategoria: gastoPor(d.movs, mes, 'categoriaId', d.nombres.categoria, 8, f),
    porCentro: gastoPor(d.movs, mes, 'centroId', d.nombres.centro, 8, f),
    r503020: regla503020(d.movs, mes, d.categoriasById, f),
  }), [d, mes, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tendencia = useMemo(() => {
    const ms = ultimosMeses(monthKey(hoy), 12);
    const res = ms.map((m) => resumenMes(d.movs, m, f));
    return { ms, res, calor: calorGrupoMes(d.movs, ms, d.categoriasById, f).slice(0, 10) };
  }, [d, hoy, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const incompleto = (m: string) => { const c = d.cobertura.get(m); return !!c && c !== 'COMPLETO'; };
  const fmt = (v: number) => dinero(v, 'PEN', false);

  return (
    <main className="screen">
      <h1>Reportes</h1>
      <div className="card stack">
        <Segmented value={vista} onChange={setVista} options={[{ value: 'mes', label: 'Gasto del mes' }, { value: 'tendencias', label: 'Tendencias' }]} />
        <div className="filters">
          {vista === 'mes' && <Select value={mes} onChange={setMes} placeholder={monthLong(monthKey(hoy))} options={meses.map((m) => ({ value: m, label: monthLong(m) }))} />}
          <Select value={centroId} onChange={setCentroId} placeholder="Todos los centros" options={d.centros.map((c) => ({ value: c.id, label: c.nombre }))} />
        </div>
      </div>

      {vista === 'mes' ? (
        <>
          <div className="kpis">
            <div className="card kpi"><span className="muted small">Gastos</span><strong>{fmt(mesData.resumen.egresos)}</strong></div>
            <div className="card kpi"><span className="muted small">Ingresos</span><strong>{fmt(mesData.resumen.ingresos)}</strong></div>
            <div className="card kpi"><span className="muted small">Balance</span><strong className={mesData.resumen.ingresos - mesData.resumen.egresos < 0 ? 'neg' : ''}>{fmt(mesData.resumen.ingresos - mesData.resumen.egresos)}</strong></div>
          </div>
          {incompleto(mes) && <Status kind="warn">Este mes tiene registro incompleto en tu historial: los totales pueden ser menores a lo real.</Status>}

          <ChartCard title="¿En qué se fue la plata?" subtitle={`Gasto por categoría · ${monthLong(mes)}. Toca una barra para ver sus movimientos.`}
            table={{ headers: ['Categoría', 'Monto (S/)', 'Movimientos'], rows: mesData.porCategoria.map((p) => [p.nombre, p.valor, p.movimientos]) }}
            footnote={mesData.resumen.sinTipoCambio > 0 ? `${mesData.resumen.sinTipoCambio === 1 ? '1 movimiento' : `${mesData.resumen.sinTipoCambio} movimientos`} en otra moneda sin tipo de cambio no ${mesData.resumen.sinTipoCambio === 1 ? 'está incluido' : 'están incluidos'}.` : undefined}>
            {mesData.porCategoria.length === 0 ? <p className="muted">Sin gastos este mes.</p> : (
              <BarList items={mesData.porCategoria.map((p) => ({ id: p.id, label: p.nombre, value: p.valor, note: `${p.movimientos}` }))} format={fmt}
                onSelect={(id) => id !== 'OTROS' && onVerMovimientos({ mes, categoriaId: id === 'SIN' ? undefined : id, centroId: centroId || undefined })} />
            )}
          </ChartCard>

          <ChartCard title="¿Para quién?" subtitle="Gasto por centro (personas y proyectos)"
            table={{ headers: ['Centro', 'Monto (S/)', 'Movimientos'], rows: mesData.porCentro.map((p) => [p.nombre, p.valor, p.movimientos]) }}>
            {mesData.porCentro.length === 0 ? <p className="muted">Sin gastos este mes.</p> : (
              <BarList items={mesData.porCentro.map((p) => ({ id: p.id, label: p.nombre, value: p.valor }))} format={fmt}
                onSelect={(id) => id !== 'OTROS' && onVerMovimientos({ mes, centroId: id === 'SIN' ? undefined : id })} />
            )}
          </ChartCard>

          <ChartCard title="Regla 50/30/20" subtitle="Necesidades · deseos · ahorro y deudas"
            table={{ headers: ['Tipo', 'Monto (S/)'], rows: Object.entries(mesData.r503020).map(([k, v]) => [k, Math.round(v * 100) / 100]) }}>
            <SegmentedBar parts={[
              { label: 'Necesidad', value: mesData.r503020.NECESIDAD, className: 'series-1' },
              { label: 'Deseo', value: mesData.r503020.DESEO, className: 'series-2' },
              { label: 'Ahorro / deuda', value: mesData.r503020['AHORRO / DEUDA'], className: 'series-3' },
              { label: 'Sin clasificar', value: mesData.r503020['SIN CLASIFICAR'], className: 'muted-series' },
            ]} />
          </ChartCard>
        </>
      ) : (
        <>
          <ChartCard title="Ingresos y egresos" subtitle="Últimos 12 meses, en soles. Toca un mes para ver su detalle."
            legend={[{ label: 'Ingresos', className: 'series-1' }, { label: 'Egresos', className: 'series-2' }]}
            table={{ headers: ['Mes', 'Ingresos', 'Egresos', 'Registro'], rows: tendencia.ms.map((m, i) => [monthLong(m), tendencia.res[i].ingresos, tendencia.res[i].egresos, incompleto(m) ? 'Incompleto' : '']) }}
            footnote={tendencia.ms.some(incompleto) ? '! Meses con registro incompleto (textura): sus totales no son comparables.' : undefined}>
            <MonthBars meses={tendencia.ms} etiquetas={tendencia.ms.map(monthShort)} ingresos={tendencia.res.map((r) => r.ingresos)} egresos={tendencia.res.map((r) => r.egresos)}
              incompletos={new Set(tendencia.ms.filter(incompleto))} format={fmt} onSelect={(m) => { setMes(m); setVista('mes'); }} />
          </ChartCard>

          <ChartCard title="Gasto por grupo y mes" subtitle="Más oscuro = más gasto. Toca una celda para ver el monto."
            table={{ headers: ['Grupo', ...tendencia.ms.map(monthShort)], rows: tendencia.calor.map((f2) => [f2.nombre, ...f2.valores]) }}>
            {tendencia.calor.length === 0 ? <p className="muted">Sin datos en los últimos 12 meses.</p> : (
              <Heatmap filas={tendencia.calor} columnas={tendencia.ms.map(monthShort)} format={fmt} />
            )}
          </ChartCard>
          <p className="muted small">Comparación año contra año: {monthLong(addMonths(monthKey(hoy), -12))} → {monthLong(monthKey(hoy))}.</p>
        </>
      )}
    </main>
  );
}
