import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import {
  calorCentro, calorGrupoMes, gastoDiario, gastoPor, gastoPorAtributo, gastoPorDiaSemana, gastoPorPeriodo, promedioMovil,
  regla503020, resumenMes, resumenPorAnio, topGastos, ultimoMesConDatos, ultimosMeses,
  cascada, comparar, flujoGasto, gastoPorDia, gastosPorCategoria, hojasCategoria,
} from '../../domain/reports';
import { dayLabel, daysInMonth, monthKey, monthLong, monthShort, todayIso } from '../../domain/dates';
import { dinero } from '../../domain/format';
import { enSoles } from '../../domain/model';
import { BarList, ChartCard, ColumnChart, Heatmap, MonthBars, SegmentedBar, Sparks, StackedColumns } from '../../ui/charts';
import { Beeswarm, BumpChart, CalendarHeatmap, Dumbbell, Sankey, Treemap, Waterfall } from '../../ui/advanced';
import { addMonths } from '../../domain/dates';
import { Segmented, Select, Status } from '../../ui/kit';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CLASES: { k: string; label: string; className: string }[] = [
  { k: 'CONSUMO', label: 'Consumo', className: 'series-1' }, { k: 'INVERSIÓN', label: 'Inversión / patrimonio', className: 'series-2' },
  { k: 'IMPUESTO', label: 'Impuestos', className: 'series-3' }, { k: 'OTRO', label: 'Otros', className: 'muted-series' },
];
const anio = (f: string) => f.slice(0, 4);

/** Dashboards: gasto del mes (D2), 12 meses (D3) y todo el historial por año. */
export function ReportsScreen({ onVerMovimientos }: { onVerMovimientos: (f: { mes?: string; categoriaId?: string; centroId?: string }) => void }) {
  const d = useData();
  const hoy = todayIso();
  const [vista, setVista] = useState<'mes' | 'tendencias' | 'anios'>('mes');
  // Arranca en el mes actual si tiene datos; si no, en el último mes con datos.
  // Meses con al menos 5 gastos: así un mes recién empezado (o con un solo gasto de prueba) no deja el dashboard vacío.
  const mesesConDatos = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of d.movs) if (m.estado === 'PAGADO' && !m.eliminado && m.tipo === 'EGRESO') n.set(monthKey(m.fecha), (n.get(monthKey(m.fecha)) ?? 0) + 1);
    return [...n.entries()].filter(([, c]) => c >= 5).map(([k]) => k).sort();
  }, [d.movs]);
  const ultimo = mesesConDatos[mesesConDatos.length - 1] ?? ultimoMesConDatos(d.movs);
  const base = !ultimo || ultimo >= monthKey(hoy) ? monthKey(hoy) : ultimo;
  const [mesElegido, setMes] = useState<string | null>(null);
  const mes = mesElegido ?? base;
  const [centroId, setCentroId] = useState('');
  const f = { centroId: centroId || null };
  const fmt = (v: number) => dinero(v, 'PEN', false);
  const clase = (c?: { clase: string }) => (c && ['CONSUMO', 'INVERSIÓN', 'IMPUESTO'].includes(c.clase) ? c.clase : 'OTRO');

  const meses = useMemo(() => {
    const set = new Set(d.movs.map((m) => monthKey(m.fecha)));
    set.add(monthKey(hoy));
    return [...set].sort().reverse();
  }, [d.movs, hoy]);

  const M = useMemo(() => {
    const diario = gastoDiario(d.movs, mes, f);
    return {
      resumen: resumenMes(d.movs, mes, f),
      porCategoria: gastoPor(d.movs, mes, 'categoriaId', d.nombres.categoria, 8, f),
      porCentro: gastoPor(d.movs, mes, 'centroId', d.nombres.centro, 8, f),
      porCuenta: gastoPor(d.movs, mes, 'cuentaId', d.nombres.cuenta, 8, f),
      porLugar: gastoPor(d.movs, mes, 'lugarId', d.nombres.lugar, 8, f).filter((p) => p.id !== 'SIN'),
      r503020: regla503020(d.movs, mes, d.categoriasById, f),
      diario, maxDia: diario.indexOf(Math.max(...diario)),
      semana: gastoPorDiaSemana(d.movs, [mes], f),
      top: topGastos(d.movs, mes, 8, f),
      flujo: flujoGasto(d.movs, (x) => x.startsWith(mes), d.categoriasById, d.nombres.centro, f),
      hojas: hojasCategoria(d.movs, (x) => x.startsWith(mes), d.categoriasById, f),
      cascada: cascada(d.movs, (x) => x.startsWith(mes), d.categoriasById, f),
      vsAnterior: comparar(d.movs, (x) => x.startsWith(addMonths(mes, -1)), (x) => x.startsWith(mes), d.categoriasById, 'categoria', f, 10),
      enjambre: gastosPorCategoria(d.movs, (x) => x.startsWith(mes), d.categoriasById, f, 6),
    };
  }, [d, mes, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const T = useMemo(() => {
    const ms = mesesConDatos.length >= 2 ? mesesConDatos.slice(-12) : ultimosMeses(base, 12);
    const res = ms.map((m) => resumenMes(d.movs, m, f));
    const gasto = gastoPorPeriodo(d.movs, ms, monthKey, f);
    const fv = gastoPorAtributo(d.movs, ms, d.categoriasById, (c) => (c?.fijoVariable === 'FIJO' ? 'FIJO' : 'VARIABLE'), monthKey, f);
    const calor = calorGrupoMes(d.movs, ms, d.categoriasById, f);
    return {
      ms, res, gasto, prom: promedioMovil(gasto, 3), fv, calor: calor.slice(0, 10), sparks: calor.slice(0, 9),
      centros: calorCentro(d.movs, ms, d.nombres.centro, monthKey, f).slice(0, 8), semana: gastoPorDiaSemana(d.movs, ms, f),
      bump: calor.slice(0, 7).map((x) => ({ id: x.id, nombre: x.nombre, valores: x.valores })),
      flujo: flujoGasto(d.movs, (x) => ms.includes(x.slice(0, 7)), d.categoriasById, d.nombres.centro, f),
      dias: gastoPorDia(d.movs, (x) => ms.includes(x.slice(0, 7)), f),
    };
  }, [d, base, mesesConDatos, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const A = useMemo(() => {
    const res = resumenPorAnio(d.movs, f);
    const anios = res.map((r) => r.anio);
    const porClase = gastoPorAtributo(d.movs, anios, d.categoriasById, clase, anio, f);
    const calor = calorGrupoMes(d.movs, anios, d.categoriasById, f, anio);
    return {
      res, anios, porClase, calor: calor.slice(0, 12), sparks: calor.slice(0, 9),
      promMensual: res.map((r) => Math.round(r.egresos / Math.max(1, r.meses))),
      centros: calorCentro(d.movs, anios, d.nombres.centro, anio, f).slice(0, 8),
    };
  }, [d, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [anioSel, setAnioSel] = useState<string | null>(null);
  // Por defecto, el año del último mes con datos suficientes (no un año con un solo gasto de prueba).
  const anioActivo = anioSel ?? (ultimo ?? A.anios[A.anios.length - 1] ?? hoy).slice(0, 4);
  const Y = useMemo(() => {
    const ant = String(+anioActivo - 1);
    return {
      dias: gastoPorDia(d.movs, (x) => x.startsWith(anioActivo), f),
      vs: comparar(d.movs, (x) => x.startsWith(ant), (x) => x.startsWith(anioActivo), d.categoriasById, 'grupo', f, 12),
      hojas: hojasCategoria(d.movs, (x) => x.startsWith(anioActivo), d.categoriasById, f),
      flujo: flujoGasto(d.movs, (x) => x.startsWith(anioActivo), d.categoriasById, d.nombres.centro, f),
      cascada: cascada(d.movs, (x) => x.startsWith(anioActivo), d.categoriasById, f),
      ant,
    };
  }, [d, anioActivo, centroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const incompleto = (m: string) => { const c = d.cobertura.get(m); return !!c && c !== 'COMPLETO'; };

  return (
    <main className="screen dash">
      <h1>Dashboards</h1>
      <div className="card stack">
        <Segmented value={vista} onChange={setVista} options={[{ value: 'mes', label: 'Mes' }, { value: 'tendencias', label: '12 meses' }, { value: 'anios', label: 'Por año' }]} />
        <div className="filters">
          {vista === 'mes' && <Select value={mes} onChange={(v) => setMes(v || null)} placeholder={monthLong(base)} options={meses.map((m) => ({ value: m, label: monthLong(m) }))} />}
          {vista === 'anios' && <Select value={anioActivo} onChange={(v) => setAnioSel(v || null)} placeholder={anioActivo} options={[...A.anios].reverse().map((y) => ({ value: y, label: y }))} />}
          <Select value={centroId} onChange={setCentroId} placeholder="Todos los centros" options={d.centros.map((c) => ({ value: c.id, label: c.nombre }))} />
        </div>
      </div>
      {base !== monthKey(hoy) && vista === 'mes' && !mesElegido && (
        <Status kind="info">{monthLong(monthKey(hoy))} aún tiene pocos movimientos. Se muestra el último mes con datos: {monthLong(base)}. Puedes elegir otro mes arriba.</Status>
      )}

      {vista === 'mes' && (
        <>
          <div className="kpis">
            <div className="card kpi"><span className="muted small">Gastos</span><strong>{fmt(M.resumen.egresos)}</strong></div>
            <div className="card kpi"><span className="muted small">Ingresos</span><strong>{fmt(M.resumen.ingresos)}</strong></div>
            <div className="card kpi"><span className="muted small">Balance</span><strong className={M.resumen.ingresos - M.resumen.egresos < 0 ? 'neg' : ''}>{fmt(M.resumen.ingresos - M.resumen.egresos)}</strong></div>
            <div className="card kpi"><span className="muted small">Promedio por día</span><strong>{fmt(M.resumen.egresos / daysInMonth(mes))}</strong></div>
          </div>
          {incompleto(mes) && <Status kind="warn">Este mes tiene registro incompleto en tu historial: los totales pueden ser menores a lo real.</Status>}
          <div className="dash-grid">
            <div className="wide">
              <ChartCard title="Flujo del dinero" subtitle={`Para quién → grupo → categoría · ${monthLong(mes)}. Toca un bloque para resaltar su flujo.`}
                table={{ headers: ['De', 'A', 'Monto (S/)'], rows: M.flujo.enlaces.map((e) => [M.flujo.nodos.find((n) => n.id === e.de)?.nombre ?? '', M.flujo.nodos.find((n) => n.id === e.a)?.nombre ?? '', Math.round(e.valor)]) }}>
                <Sankey flujo={M.flujo} format={fmt} />
              </ChartCard>
            </div>
            <ChartCard title="Ingresos → gastos → resultado" subtitle="Cascada: cuánto entró, qué se llevó cada grupo y qué quedó"
              table={{ headers: ['Paso', 'Monto (S/)'], rows: [['Ingresos', M.cascada.ingresos], ...M.cascada.gastos.map((g) => [g.nombre, -g.v] as [string, number]), ['Resultado', M.cascada.resultado]] }}>
              <Waterfall ingresos={M.cascada.ingresos} gastos={M.cascada.gastos} resultado={M.cascada.resultado} format={fmt} />
            </ChartCard>
            <ChartCard title="Mapa del gasto" subtitle="Cada rectángulo es una categoría; el tamaño es lo que gastaste. El color es su grupo."
              table={{ headers: ['Categoría', 'Grupo', 'Monto (S/)'], rows: M.hojas.map((h2) => [h2.nombre, h2.grupoNombre, Math.round(h2.valor)]) }}>
              <Treemap hojas={M.hojas} format={fmt} onSelect={(id) => id !== 'SIN' && onVerMovimientos({ mes, categoriaId: id })} />
            </ChartCard>
            <ChartCard title={`¿Subió o bajó? · vs. ${monthLong(addMonths(mes, -1))}`} subtitle="Punto gris: mes anterior. Punto azul: este mes."
              legend={[{ label: monthLong(addMonths(mes, -1)), className: 'muted-series' }, { label: monthLong(mes), className: 'series-1' }]}
              table={{ headers: ['Categoría', 'Mes anterior', 'Este mes'], rows: M.vsAnterior.map((r) => [r.nombre, r.antes, r.ahora]) }}>
              <Dumbbell filas={M.vsAnterior} etiquetaAntes="mes anterior" etiquetaAhora="este mes" format={fmt} />
            </ChartCard>
            <ChartCard title="¿Muchos gastos chicos o pocos grandes?" subtitle="Cada punto es un gasto (escala logarítmica). La raya es el gasto típico (mediana)."
              table={{ headers: ['Categoría', 'Gastos', 'Total (S/)'], rows: M.enjambre.map((r) => [r.nombre, r.montos.length, Math.round(r.total)]) }}>
              <Beeswarm filas={M.enjambre} format={fmt} />
            </ChartCard>
            <ChartCard title="¿En qué se fue la plata?" subtitle={`Por categoría · ${monthLong(mes)}. Toca una barra para ver sus movimientos.`}
              table={{ headers: ['Categoría', 'Monto (S/)', 'Movimientos'], rows: M.porCategoria.map((p) => [p.nombre, p.valor, p.movimientos]) }}
              footnote={M.resumen.sinTipoCambio > 0 ? `${M.resumen.sinTipoCambio === 1 ? '1 movimiento' : `${M.resumen.sinTipoCambio} movimientos`} en otra moneda sin tipo de cambio no ${M.resumen.sinTipoCambio === 1 ? 'está incluido' : 'están incluidos'}.` : undefined}>
              {M.porCategoria.length === 0 ? <p className="muted">Sin gastos este mes.</p> : (
                <BarList items={M.porCategoria.map((p) => ({ id: p.id, label: p.nombre, value: p.valor, note: `${p.movimientos}` }))} format={fmt}
                  onSelect={(id) => id !== 'OTROS' && onVerMovimientos({ mes, categoriaId: id === 'SIN' ? undefined : id, centroId: centroId || undefined })} />
              )}
            </ChartCard>
            <ChartCard title="Gasto por día" subtitle={M.maxDia >= 0 && M.diario[M.maxDia] > 0 ? `El día de más gasto fue el ${M.maxDia + 1} (${fmt(M.diario[M.maxDia])}), en naranja.` : 'Sin gastos este mes.'}
              table={{ headers: ['Día', 'Gasto (S/)'], rows: M.diario.map((v, i) => [i + 1, v]) }}>
              <ColumnChart etiquetas={M.diario.map((_, i) => String(i + 1))} valores={M.diario} format={fmt} etiquetaCada={5} resaltar={M.maxDia} />
            </ChartCard>
            <ChartCard title="¿Para quién?" subtitle="Por centro (personas y proyectos)"
              table={{ headers: ['Centro', 'Monto (S/)', 'Movimientos'], rows: M.porCentro.map((p) => [p.nombre, p.valor, p.movimientos]) }}>
              {M.porCentro.length === 0 ? <p className="muted">Sin gastos este mes.</p> : (
                <BarList items={M.porCentro.map((p) => ({ id: p.id, label: p.nombre, value: p.valor }))} format={fmt}
                  onSelect={(id) => id !== 'OTROS' && onVerMovimientos({ mes, centroId: id === 'SIN' ? undefined : id })} />
              )}
            </ChartCard>
            <ChartCard title="Regla 50/30/20" subtitle="Necesidades · deseos · ahorro y deudas"
              table={{ headers: ['Tipo', 'Monto (S/)'], rows: Object.entries(M.r503020).map(([k, v]) => [k, Math.round(v)]) }}>
              <SegmentedBar parts={[
                { label: 'Necesidad', value: M.r503020.NECESIDAD, className: 'series-1' },
                { label: 'Deseo', value: M.r503020.DESEO, className: 'series-2' },
                { label: 'Ahorro / deuda', value: M.r503020['AHORRO / DEUDA'], className: 'series-3' },
                { label: 'Sin clasificar', value: M.r503020['SIN CLASIFICAR'], className: 'muted-series' },
              ]} />
            </ChartCard>
            <ChartCard title="¿Con qué pagaste?" subtitle="Gasto por cuenta o tarjeta"
              table={{ headers: ['Cuenta', 'Monto (S/)'], rows: M.porCuenta.map((p) => [p.nombre, p.valor]) }}>
              {M.porCuenta.length === 0 ? <p className="muted">Sin gastos este mes.</p> : <BarList items={M.porCuenta.map((p) => ({ id: p.id, label: p.nombre, value: p.valor }))} format={fmt} />}
            </ChartCard>
            <ChartCard title="Gasto por día de la semana" subtitle="Promedio de cada día de la semana en el mes"
              table={{ headers: ['Día', 'Promedio (S/)'], rows: M.semana.map((v, i) => [DIAS[i], v]) }}>
              <ColumnChart etiquetas={DIAS} valores={M.semana} format={fmt} resaltar={M.semana.indexOf(Math.max(...M.semana))} />
            </ChartCard>
            <ChartCard title="Gastos más grandes" subtitle={`Los ${M.top.length} mayores de ${monthLong(mes)}`}
              table={{ headers: ['Fecha', 'Descripción', 'Monto (S/)'], rows: M.top.map((m) => [m.fecha, m.descripcion, enSoles(m) ?? 0]) }}>
              {M.top.length === 0 ? <p className="muted">Sin gastos este mes.</p> : (
                <BarList items={M.top.map((m) => ({ id: m.id, label: m.descripcion || '(sin descripción)', value: enSoles(m) ?? 0, note: `${dayLabel(m.fecha)} · ${d.nombres.categoria.get(m.categoriaId ?? '') ?? ''}` }))} format={fmt} />
              )}
            </ChartCard>
            {M.porLugar.length > 0 && (
              <ChartCard title="¿Dónde?" subtitle="Gasto por lugar"
                table={{ headers: ['Lugar', 'Monto (S/)'], rows: M.porLugar.map((p) => [p.nombre, p.valor]) }}>
                <BarList items={M.porLugar.map((p) => ({ id: p.id, label: p.nombre, value: p.valor }))} format={fmt} />
              </ChartCard>
            )}
          </div>
        </>
      )}

      {vista === 'tendencias' && (
        <div className="dash-grid">
          <div className="wide">
            <ChartCard title="Ingresos y egresos" subtitle={`Los últimos ${T.ms.length} meses con movimientos (${monthLong(T.ms[0])} a ${monthLong(T.ms[T.ms.length - 1])}), en soles. Toca un mes para ver su detalle.`}
              legend={[{ label: 'Ingresos', className: 'series-1' }, { label: 'Egresos', className: 'series-2' }]}
              table={{ headers: ['Mes', 'Ingresos', 'Egresos', 'Registro'], rows: T.ms.map((m, i) => [monthLong(m), T.res[i].ingresos, T.res[i].egresos, incompleto(m) ? 'Incompleto' : '']) }}
              footnote={T.ms.some(incompleto) ? '! Meses con registro incompleto (textura): sus totales no son comparables.' : undefined}>
              <MonthBars meses={T.ms} etiquetas={T.ms.map(monthShort)} ingresos={T.res.map((r) => r.ingresos)} egresos={T.res.map((r) => r.egresos)}
                incompletos={new Set(T.ms.filter(incompleto))} format={fmt} onSelect={(m) => { setMes(m); setVista('mes'); }} />
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Ranking de grupos mes a mes" subtitle="Puesto de cada grupo de gasto en cada mes (1 = el que más gastó). Toca una línea para resaltarla."
              table={{ headers: ['Grupo', ...T.ms.map(monthShort)], rows: T.bump.map((x) => [x.nombre, ...x.valores]) }}>
              <BumpChart periodos={T.ms.map(monthShort)} series={T.bump} format={fmt} />
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Flujo del dinero en 12 meses" subtitle="Para quién → grupo → categoría"
              table={{ headers: ['De', 'A', 'Monto (S/)'], rows: T.flujo.enlaces.map((e) => [T.flujo.nodos.find((n) => n.id === e.de)?.nombre ?? '', T.flujo.nodos.find((n) => n.id === e.a)?.nombre ?? '', Math.round(e.valor)]) }}>
              <Sankey flujo={T.flujo} format={fmt} />
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title={`Calendario de gasto ${T.ms[T.ms.length - 1]?.slice(0, 4) ?? ''}`} subtitle="Cada cuadrito es un día; más oscuro = más gasto. Toca un día para ver el monto."
              table={{ headers: ['Día', 'Gasto (S/)'], rows: [...T.dias.entries()].sort().map(([k, v]) => [k, Math.round(v)]) }}>
              <CalendarHeatmap anio={+(T.ms[T.ms.length - 1] ?? hoy).slice(0, 4)} dias={T.dias} format={fmt} />
            </ChartCard>
          </div>
          <ChartCard title="Gasto mensual y tendencia" subtitle="Columnas: gasto de cada mes. Línea gris: promedio de los últimos 3 meses."
            legend={[{ label: 'Gasto del mes', className: 'series-1' }, { label: 'Promedio 3 meses', className: 'muted-series' }]}
            table={{ headers: ['Mes', 'Gasto', 'Promedio 3 meses'], rows: T.ms.map((m, i) => [monthLong(m), T.gasto[i], T.prom[i]]) }}>
            <ColumnChart etiquetas={T.ms.map(monthShort)} valores={T.gasto} promedio={T.prom} format={fmt} etiquetaCada={2} />
          </ChartCard>
          <ChartCard title="Gastos fijos y variables" subtitle="Fijos: servicios, cuotas, pensiones. Variables: el resto."
            legend={[{ label: 'Fijos', className: 'series-1' }, { label: 'Variables', className: 'series-2' }]}
            table={{ headers: ['Mes', 'Fijos', 'Variables'], rows: T.ms.map((m, i) => [monthLong(m), T.fv.get('FIJO')?.[i] ?? 0, T.fv.get('VARIABLE')?.[i] ?? 0]) }}>
            <StackedColumns etiquetas={T.ms.map(monthShort)} format={fmt} series={[
              { label: 'Fijos', className: 'series-1', valores: T.fv.get('FIJO') ?? [] }, { label: 'Variables', className: 'series-2', valores: T.fv.get('VARIABLE') ?? [] },
            ]} />
          </ChartCard>
          <div className="wide">
            <ChartCard title="Tendencia por grupo" subtitle="Un minigráfico por grupo de categorías (misma línea de tiempo: 12 meses)."
              table={{ headers: ['Grupo', ...T.ms.map(monthShort)], rows: T.sparks.map((x) => [x.nombre, ...x.valores]) }}>
              {T.sparks.length === 0 ? <p className="muted">Sin datos.</p> : <Sparks filas={T.sparks} etiquetas={T.ms.map(monthShort)} format={fmt} />}
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Gasto por grupo y mes" subtitle="Más oscuro = más gasto. Toca una celda para ver el monto."
              table={{ headers: ['Grupo', ...T.ms.map(monthShort)], rows: T.calor.map((x) => [x.nombre, ...x.valores]) }}>
              {T.calor.length === 0 ? <p className="muted">Sin datos.</p> : <Heatmap filas={T.calor} columnas={T.ms.map(monthShort)} format={fmt} />}
            </ChartCard>
          </div>
          <ChartCard title="Gasto por persona / proyecto" subtitle="Centros en los 12 meses"
            table={{ headers: ['Centro', ...T.ms.map(monthShort)], rows: T.centros.map((x) => [x.nombre, ...x.valores]) }}>
            {T.centros.length === 0 ? <p className="muted">Sin datos.</p> : <Heatmap filas={T.centros} columnas={T.ms.map(monthShort)} format={fmt} />}
          </ChartCard>
          <ChartCard title="Día de la semana" subtitle="Gasto promedio por día de la semana en los 12 meses"
            table={{ headers: ['Día', 'Promedio (S/)'], rows: T.semana.map((v, i) => [DIAS[i], v]) }}>
            <ColumnChart etiquetas={DIAS} valores={T.semana} format={fmt} resaltar={T.semana.indexOf(Math.max(...T.semana))} />
          </ChartCard>
        </div>
      )}

      {vista === 'anios' && (
        <div className="dash-grid">
          <div className="wide">
            <ChartCard title={`Calendario de gasto ${anioActivo}`} subtitle="Cada cuadrito es un día; más oscuro = más gasto. Elige el año arriba."
              table={{ headers: ['Día', 'Gasto (S/)'], rows: [...Y.dias.entries()].sort().map(([k, v]) => [k, Math.round(v)]) }}>
              <CalendarHeatmap anio={+anioActivo} dias={Y.dias} format={fmt} />
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title={`Flujo del dinero ${anioActivo}`} subtitle="Para quién → grupo → categoría"
              table={{ headers: ['De', 'A', 'Monto (S/)'], rows: Y.flujo.enlaces.map((e) => [Y.flujo.nodos.find((n) => n.id === e.de)?.nombre ?? '', Y.flujo.nodos.find((n) => n.id === e.a)?.nombre ?? '', Math.round(e.valor)]) }}>
              <Sankey flujo={Y.flujo} format={fmt} />
            </ChartCard>
          </div>
          <ChartCard title={`${Y.ant} vs. ${anioActivo} por grupo`} subtitle="Punto gris: año anterior. Punto azul: año elegido."
            legend={[{ label: Y.ant, className: 'muted-series' }, { label: anioActivo, className: 'series-1' }]}
            table={{ headers: ['Grupo', Y.ant, anioActivo], rows: Y.vs.map((r) => [r.nombre, r.antes, r.ahora]) }}>
            <Dumbbell filas={Y.vs} etiquetaAntes={Y.ant} etiquetaAhora={anioActivo} format={fmt} />
          </ChartCard>
          <ChartCard title={`Mapa del gasto ${anioActivo}`} subtitle="Cada rectángulo es una categoría; el color es su grupo."
            table={{ headers: ['Categoría', 'Grupo', 'Monto (S/)'], rows: Y.hojas.map((h2) => [h2.nombre, h2.grupoNombre, Math.round(h2.valor)]) }}>
            <Treemap hojas={Y.hojas} format={fmt} />
          </ChartCard>
          <div className="wide">
            <ChartCard title={`Ingresos → gastos → resultado ${anioActivo}`} subtitle="Cascada del año"
              table={{ headers: ['Paso', 'Monto (S/)'], rows: [['Ingresos', Y.cascada.ingresos], ...Y.cascada.gastos.map((g) => [g.nombre, -g.v] as [string, number]), ['Resultado', Y.cascada.resultado]] }}>
              <Waterfall ingresos={Y.cascada.ingresos} gastos={Y.cascada.gastos} resultado={Y.cascada.resultado} format={fmt} />
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Ingresos y egresos por año" subtitle="Todo tu historial, en soles."
              legend={[{ label: 'Ingresos', className: 'series-1' }, { label: 'Egresos', className: 'series-2' }]}
              table={{ headers: ['Año', 'Ingresos', 'Egresos', 'Meses con datos'], rows: A.res.map((r) => [r.anio, r.ingresos, r.egresos, r.meses]) }}
              footnote="! Años con menos de 12 meses registrados (textura): sus totales no son comparables.">
              <MonthBars meses={A.anios} etiquetas={A.anios} ingresos={A.res.map((r) => r.ingresos)} egresos={A.res.map((r) => r.egresos)}
                incompletos={new Set(A.res.filter((r) => r.meses < 12).map((r) => r.anio))} format={fmt} />
            </ChartCard>
          </div>
          <ChartCard title="¿En qué tipo de gasto?" subtitle="Consumo, inversión / patrimonio (como la compra del depto.) e impuestos, por año"
            legend={CLASES.map((c) => ({ label: c.label, className: c.className }))}
            table={{ headers: ['Año', ...CLASES.map((c) => c.label)], rows: A.anios.map((y, i) => [y, ...CLASES.map((c) => A.porClase.get(c.k)?.[i] ?? 0)]) }}>
            <StackedColumns etiquetas={A.anios} format={fmt} series={CLASES.map((c) => ({ label: c.label, className: c.className, valores: A.porClase.get(c.k) ?? [] }))} />
          </ChartCard>
          <ChartCard title="Gasto promedio por mes registrado" subtitle="Egresos del año ÷ meses con datos: compara años aunque estén incompletos."
            table={{ headers: ['Año', 'Promedio mensual (S/)', 'Meses con datos'], rows: A.anios.map((y, i) => [y, A.promMensual[i], A.res[i].meses]) }}>
            <ColumnChart etiquetas={A.anios} valores={A.promMensual} format={fmt} />
          </ChartCard>
          <div className="wide">
            <ChartCard title="Tendencia por grupo" subtitle="Un minigráfico por grupo de categorías, año a año."
              table={{ headers: ['Grupo', ...A.anios], rows: A.sparks.map((x) => [x.nombre, ...x.valores]) }}>
              {A.sparks.length === 0 ? <p className="muted">Sin datos.</p> : <Sparks filas={A.sparks} etiquetas={A.anios} format={fmt} />}
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Gasto por grupo y año" subtitle="Más oscuro = más gasto. Toca una celda para ver el monto."
              table={{ headers: ['Grupo', ...A.anios], rows: A.calor.map((x) => [x.nombre, ...x.valores]) }}>
              {A.calor.length === 0 ? <p className="muted">Sin datos.</p> : <Heatmap filas={A.calor} columnas={A.anios} format={fmt} />}
            </ChartCard>
          </div>
          <div className="wide">
            <ChartCard title="Gasto por persona / proyecto y año" subtitle="Centros: personal, familia, inmuebles, carros…"
              table={{ headers: ['Centro', ...A.anios], rows: A.centros.map((x) => [x.nombre, ...x.valores]) }}>
              {A.centros.length === 0 ? <p className="muted">Sin datos.</p> : <Heatmap filas={A.centros} columnas={A.anios} format={fmt} />}
            </ChartCard>
          </div>
        </div>
      )}
    </main>
  );
}
