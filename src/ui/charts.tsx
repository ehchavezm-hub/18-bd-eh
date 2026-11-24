/**
 * Gráficos en SVG/HTML siguiendo la skill dataviz:
 * un solo eje, marcas delgadas con extremos redondeados de 4px, tooltip al tocar o pasar el mouse,
 * leyenda + etiquetas directas, colores por rol (validados para daltonismo) y vista de tabla.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compacto } from '../domain/format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Tarjeta de gráfico con título, leyenda y botón "Ver como tabla". */
export function ChartCard({ title, subtitle, legend, table, children, footnote }: {
  title: string; subtitle?: ReactNode; legend?: { label: string; className: string }[];
  table?: { headers: string[]; rows: (string | number)[][] }; children: ReactNode; footnote?: ReactNode;
}) {
  const [tabla, setTabla] = useState(false);
  return (
    <section className="card stack viz-root">
      <div className="row">
        <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
        {table && <button className="btn link small" onClick={() => setTabla(!tabla)}>{tabla ? 'Ver gráfico' : 'Ver tabla'}</button>}
      </div>
      {legend && !tabla && (
        <div className="legend">{legend.map((l) => <span key={l.label}><i className={`swatch ${l.className}`} />{l.label}</span>)}</div>
      )}
      {tabla && table ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? c.toLocaleString('es-PE', { maximumFractionDigits: 2 }) : c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
      {footnote && <p className="muted small">{footnote}</p>}
    </section>
  );
}

/** Barras horizontales ordenadas (comparar partes). Un solo tono; tocar una barra la selecciona. */
export function BarList({ items, format, onSelect, selected }: {
  items: { id: string; label: string; value: number; note?: string }[]; format: (v: number) => string;
  onSelect?: (id: string) => void; selected?: string | null;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className={`barlist-item${selected === i.id ? ' sel' : ''}`} onClick={() => onSelect?.(i.id)} disabled={!onSelect}>
            <span className="barlist-label">{i.label}{i.note && <span className="muted small"> · {i.note}</span>}</span>
            <span className="barlist-value">{format(i.value)}</span>
            <span className="barlist-track"><span className="barlist-bar" style={{ width: `${Math.max(1, (i.value / max) * 100)}%` }} /></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Línea del mes actual vs. el mes anterior (énfasis: actual en color, anterior en gris). */
export function LineCompare({ actual, anterior, dias, format }: { actual: number[]; anterior: number[]; dias: number; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 180, pl = 44, pr = 12, pt = 10, pb = 22;
  const max = Math.max(1, ...actual, ...anterior);
  const x = (i: number) => pl + (i / Math.max(1, dias - 1)) * (w - pl - pr);
  const y = (v: number) => pt + (1 - v / max) * (h - pt - pb);
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, max / 2, max];
  const onMove = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - pl) / (w - pl - pr)) * (dias - 1));
    setHover(Math.min(dias - 1, Math.max(0, i)));
  };
  return (
    <div ref={ref} className="chart" onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Gasto acumulado del mes comparado con el mes anterior">
        {ticks.map((t) => (
          <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} className="axis" textAnchor="end">{compacto(t)}</text></g>
        ))}
        {[1, Math.ceil(dias / 2), dias].map((d) => <text key={d} x={x(d - 1)} y={h - 6} className="axis" textAnchor="middle">{d}</text>)}
        <path d={path(anterior)} className="line muted-series" />
        <path d={path(actual)} className="line series-1" />
        {actual.length > 0 && <circle cx={x(actual.length - 1)} cy={y(actual[actual.length - 1])} r={4} className="dot series-1" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={h - pb} className="crosshair" />}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(w - 150, Math.max(0, x(hover) - 70)) }}>
          <strong>Día {hover + 1}</strong>
          {hover < actual.length && <div><i className="swatch series-1" />Este mes: {format(actual[hover])}</div>}
          {hover < anterior.length && <div><i className="swatch muted-series" />Mes anterior: {format(anterior[hover])}</div>}
        </div>
      )}
    </div>
  );
}

/** Barras mensuales de ingresos y egresos (un eje). Meses con registro incompleto llevan textura y aviso. */
export function MonthBars({ meses, etiquetas, ingresos, egresos, incompletos, format, onSelect }: {
  meses: string[]; etiquetas: string[]; ingresos: number[]; egresos: number[]; incompletos: Set<string>; format: (v: number) => string; onSelect?: (mes: string) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 200, pl = 44, pr = 8, pt = 10, pb = 34;
  const max = Math.max(1, ...ingresos, ...egresos);
  const slot = (w - pl - pr) / meses.length;
  const bw = Math.max(3, Math.min(18, (slot - 6) / 2 - 1));
  const y = (v: number) => pt + (1 - v / max) * (h - pt - pb);
  const bar = (cx: number, v: number, cls: string, key: string) => {
    const top = y(v), bottom = h - pb, hh = Math.max(0, bottom - top), r = Math.min(4, hh, bw / 2);
    return <path key={key} className={cls} d={`M${cx},${bottom}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${bottom}Z`} />;
  };
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Ingresos y egresos por mes">
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" className="hatch" /></pattern>
        </defs>
        {[0, max / 2, max].map((t) => (
          <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} className="axis" textAnchor="end">{compacto(t)}</text></g>
        ))}
        {meses.map((m, i) => {
          const x0 = pl + i * slot + (slot - (2 * bw + 2)) / 2;
          const inc = incompletos.has(m);
          return (
            <g key={m} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onClick={() => onSelect?.(m)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={pl + i * slot} y={pt} width={slot} height={h - pt - pb} className={hover === i ? 'hover-band' : 'hit'} />
              {bar(x0, ingresos[i], 'bar series-1', 'i')}
              {bar(x0 + bw + 2, egresos[i], 'bar series-2', 'e')}
              {inc && <rect x={x0 - 1} y={pt} width={2 * bw + 4} height={h - pt - pb} fill="url(#hatch)" />}
              <text x={pl + i * slot + slot / 2} y={h - pb + 14} className="axis" textAnchor="middle">{etiquetas[i]}</text>
              {inc && <text x={pl + i * slot + slot / 2} y={h - pb + 27} className="axis warn-ink" textAnchor="middle">!</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(w - 170, Math.max(0, pl + hover * slot - 60)) }}>
          <strong>{etiquetas[hover]}</strong>
          <div><i className="swatch series-1" />Ingresos: {format(ingresos[hover])}</div>
          <div><i className="swatch series-2" />Egresos: {format(egresos[hover])}</div>
          {incompletos.has(meses[hover]) && <div className="warn-ink">! Mes con registro incompleto</div>}
        </div>
      )}
    </div>
  );
}

/** Mapa de calor (un tono, de claro a oscuro). */
export function Heatmap({ filas, columnas, format }: { filas: { nombre: string; valores: number[] }[]; columnas: string[]; format: (v: number) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1, ...filas.flatMap((f) => f.valores));
  const paso = (v: number) => (v <= 0 ? 0 : Math.min(7, 1 + Math.floor((v / max) * 6.999)));
  return (
    <div className="heat-wrap">
      <table className="heat">
        <thead><tr><th />{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre}>
              <th scope="row">{f.nombre}</th>
              {f.valores.map((v, i) => {
                const k = `${f.nombre}|${i}`;
                return (
                  <td key={i} className={`h${paso(v)}${sel === k ? ' sel' : ''}`} title={`${f.nombre} · ${columnas[i]}: ${format(v)}`} onClick={() => setSel(sel === k ? null : k)}>
                    {sel === k ? <span className="heat-val">{compacto(v)}</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="heat-scale muted small"><span>Menos</span>{[1, 2, 3, 4, 5, 6, 7].map((s) => <i key={s} className={`h${s}`} />)}<span>Más</span></div>
    </div>
  );
}

/** Barra segmentada alta (una parte por bloque, con su porcentaje) + leyenda. */
export function SegmentedBar({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <p className="muted">Sin datos este mes.</p>;
  return (
    <div className="stack">
      <div className="segbar">
        {parts.filter((p) => p.value > 0).map((p) => {
          const share = p.value / total;
          return <div key={p.label} className={`seg ${p.className}`} style={{ flexGrow: share }} title={`${p.label}: ${Math.round(share * 100)} %`}>{share >= 0.08 ? `${Math.round(share * 100)} %` : ''}</div>;
        })}
      </div>
      <div className="legend">{parts.map((p) => <span key={p.label}><i className={`swatch ${p.className}`} />{p.label} · {total ? Math.round((p.value / total) * 100) : 0} %</span>)}</div>
    </div>
  );
}

/** Medidor de uso (por ejemplo, uso del límite de una tarjeta). */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const r = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${r * 100}%` }} className={r >= 0.9 ? 'crit' : r >= 0.7 ? 'warn' : ''} />
    </div>
  );
}

/** Columnas de una serie (con línea opcional de promedio móvil). Un eje. */
export function ColumnChart({ etiquetas, valores, promedio, format, etiquetaCada = 1, resaltar }: {
  etiquetas: string[]; valores: number[]; promedio?: number[]; format: (v: number) => string; etiquetaCada?: number; resaltar?: number | null;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 190, pl = 44, pr = 8, pt = 10, pb = 26;
  const max = Math.max(1, ...valores, ...(promedio ?? []));
  const slot = (w - pl - pr) / Math.max(1, valores.length);
  const bw = Math.max(2, Math.min(28, slot - Math.max(2, slot * 0.25)));
  const y = (v: number) => pt + (1 - v / max) * (h - pt - pb);
  const cx = (i: number) => pl + i * slot + slot / 2;
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Gráfico de columnas">
        {[0, max / 2, max].map((t) => (
          <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} className="axis" textAnchor="end">{compacto(t)}</text></g>
        ))}
        {valores.map((v, i) => {
          const top = y(v), bottom = h - pb, hh = Math.max(0, bottom - top), r = Math.min(4, hh, bw / 2), x = cx(i) - bw / 2;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pl + i * slot} y={pt} width={slot} height={h - pt - pb} className={hover === i ? 'hover-band' : 'hit'} />
              {hh > 0 && <path className={`bar ${resaltar === i ? 'series-2' : 'series-1'}`} d={`M${x},${bottom}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${bottom}Z`} />}
              {i % etiquetaCada === 0 && <text x={cx(i)} y={h - 8} className="axis" textAnchor="middle">{etiquetas[i]}</text>}
            </g>
          );
        })}
        {promedio && <path className="line muted-series" d={promedio.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} />}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(w - 160, Math.max(0, cx(hover) - 70)) }}>
          <strong>{etiquetas[hover]}</strong>
          <div><i className="swatch series-1" />{format(valores[hover])}</div>
          {promedio && <div><i className="swatch muted-series" />Promedio: {format(promedio[hover])}</div>}
        </div>
      )}
    </div>
  );
}

/** Columnas apiladas (partes de un total por periodo), con 2px de separación entre partes. */
export function StackedColumns({ etiquetas, series, format }: {
  etiquetas: string[]; series: { label: string; className: string; valores: number[] }[]; format: (v: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 200, pl = 44, pr = 8, pt = 10, pb = 26;
  const tot = etiquetas.map((_, i) => series.reduce((s, se) => s + (se.valores[i] ?? 0), 0));
  const max = Math.max(1, ...tot);
  const slot = (w - pl - pr) / Math.max(1, etiquetas.length);
  const bw = Math.max(4, Math.min(30, slot * 0.7));
  const y = (v: number) => pt + (1 - v / max) * (h - pt - pb);
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Columnas apiladas">
        {[0, max / 2, max].map((t) => (
          <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} className="axis" textAnchor="end">{compacto(t)}</text></g>
        ))}
        {etiquetas.map((e, i) => {
          let acc = 0;
          const x = pl + i * slot + (slot - bw) / 2;
          return (
            <g key={e} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pl + i * slot} y={pt} width={slot} height={h - pt - pb} className={hover === i ? 'hover-band' : 'hit'} />
              {series.map((se) => {
                const v = se.valores[i] ?? 0; if (v <= 0) return null;
                const y1 = y(acc + v), y0 = y(acc); acc += v;
                return <rect key={se.label} x={x} y={y1} width={bw} height={Math.max(0, y0 - y1 - 2)} rx={2} className={`bar ${se.className}`} />;
              })}
              <text x={pl + i * slot + slot / 2} y={h - 8} className="axis" textAnchor="middle">{e}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(w - 180, Math.max(0, pl + hover * slot - 60)) }}>
          <strong>{etiquetas[hover]} · {format(tot[hover])}</strong>
          {series.map((se) => <div key={se.label}><i className={`swatch ${se.className}`} />{se.label}: {format(se.valores[hover] ?? 0)}</div>)}
        </div>
      )}
    </div>
  );
}

/** Minigráficos (uno por categoría) con la misma escala de tiempo: para ver la tendencia de cada una. */
export function Sparks({ filas, etiquetas, format }: { filas: { nombre: string; valores: number[] }[]; etiquetas: string[]; format: (v: number) => string }) {
  return (
    <div className="sparks">
      {filas.map((f) => {
        const max = Math.max(1, ...f.valores);
        const w = 120, h = 36;
        const pts = f.valores.map((v, i) => `${(i / Math.max(1, f.valores.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
        const ultimo = f.valores[f.valores.length - 1] ?? 0;
        const prom = f.valores.reduce((a, b) => a + b, 0) / Math.max(1, f.valores.length);
        return (
          <div key={f.nombre} className="spark" title={`${f.nombre}: ${etiquetas.map((e, i) => `${e} ${format(f.valores[i])}`).join(' · ')}`}>
            <div className="spark-head"><span>{f.nombre}</span><strong>{format(ultimo)}</strong></div>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
              <polyline points={pts} className="line series-1" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="muted small">Promedio {format(prom)} · último {etiquetas[etiquetas.length - 1]}</span>
          </div>
        );
      })}
    </div>
  );
}
