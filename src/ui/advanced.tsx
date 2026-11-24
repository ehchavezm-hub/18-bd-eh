/**
 * Gráficos avanzados en SVG (sin librerías): Sankey, treemap, cascada, calendario de calor,
 * mancuernas, ranking (bump) y enjambre. Siguen la skill dataviz: un eje, etiquetas directas,
 * color por entidad (grupo) y siempre con texto, tooltip al tocar/pasar el mouse.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { compacto } from '../domain/format';
import type { Flujo, Hoja } from '../domain/reports';
import { estiloGrupo } from './colors';

function useWidth<T extends HTMLElement>(min = 260) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w] as const;
}

function Tip({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  return <div className="tooltip" style={{ left: Math.min(w - 190, Math.max(0, x - 80)) }}>{children}</div>;
}

const colorGrupo = (g: string | null) => (g ? estiloGrupo(g).color : '#7a8194');

// ---------------------------------------------------------------- Sankey
export function Sankey({ flujo, format, titulos = ['Para quién', 'Grupo', 'Categoría'] }: { flujo: Flujo; format: (v: number) => string; titulos?: string[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const cols = [0, 1, 2].map((c) => flujo.nodos.filter((n) => n.col === c));
    const valorNodo = new Map<string, number>();
    for (const n of flujo.nodos) {
      const entra = flujo.enlaces.filter((e) => e.a === n.id).reduce((s, e) => s + e.valor, 0);
      const sale = flujo.enlaces.filter((e) => e.de === n.id).reduce((s, e) => s + e.valor, 0);
      valorNodo.set(n.id, Math.max(entra, sale));
    }
    for (const c of cols) c.sort((a, b) => valorNodo.get(b.id)! - valorNodo.get(a.id)!);
    const gap = 6, pt = 22;
    const maxN = Math.max(...cols.map((c) => c.length), 1);
    const h = Math.max(260, Math.min(620, maxN * 34 + 40));
    const total = Math.max(1, ...cols.map((c) => c.reduce((s, n) => s + valorNodo.get(n.id)!, 0)));
    const usable = h - pt - 8 - gap * (maxN - 1);
    const k = usable / total;
    const nodeW = 10;
    const xs = [8, w / 2 - nodeW / 2, w - nodeW - 8];
    const pos = new Map<string, { x: number; y: number; h: number }>();
    cols.forEach((c, ci) => {
      const alto = c.reduce((s, n) => s + valorNodo.get(n.id)! * k, 0) + gap * (c.length - 1);
      let y = pt + (h - pt - 8 - alto) / 2;
      for (const n of c) { const hh = Math.max(2, valorNodo.get(n.id)! * k); pos.set(n.id, { x: xs[ci], y, h: hh }); y += hh + gap; }
    });
    // apilar enlaces en origen y destino, ordenados por la posición del otro extremo
    const offOut = new Map<string, number>(), offIn = new Map<string, number>();
    const links = [...flujo.enlaces].sort((a, b) => pos.get(a.a)!.y - pos.get(b.a)!.y).map((e) => {
      const s = pos.get(e.de)!, t = pos.get(e.a)!, grosor = Math.max(1, e.valor * k);
      const y0 = s.y + (offOut.get(e.de) ?? 0) + grosor / 2; offOut.set(e.de, (offOut.get(e.de) ?? 0) + grosor);
      return { e, s, t, grosor, y0 };
    }).sort((a, b) => a.s.y - b.s.y).map((l) => {
      const y1 = l.t.y + (offIn.get(l.e.a) ?? 0) + l.grosor / 2; offIn.set(l.e.a, (offIn.get(l.e.a) ?? 0) + l.grosor);
      return { ...l, y1 };
    });
    return { cols, pos, links, valorNodo, h, nodeW, xs };
  }, [flujo, w]);

  if (flujo.enlaces.length === 0) return <p className="muted">Sin gastos en este periodo.</p>;
  const { cols, pos, links, valorNodo, h, nodeW, xs } = layout;
  const activo = (id: string) => !hover || hover === id || links.some((l) => (l.e.de === hover || l.e.a === hover) && (l.e.de === id || l.e.a === id));
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Diagrama de flujo del gasto">
        {titulos.map((t, i) => <text key={t} x={i === 0 ? xs[0] : i === 1 ? w / 2 : w - 8} y={12} className="axis" textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}>{t}</text>)}
        {links.map((l, i) => {
          const x0 = l.s.x + nodeW, x1 = l.t.x, mx = (x0 + x1) / 2;
          const on = !hover || l.e.de === hover || l.e.a === hover;
          return <path key={i} d={`M${x0},${l.y0}C${mx},${l.y0} ${mx},${l.y1} ${x1},${l.y1}`} fill="none" stroke={colorGrupo(l.e.grupo)} strokeOpacity={on ? 0.42 : 0.08} strokeWidth={l.grosor}>
            <title>{`${flujo.nodos.find((n) => n.id === l.e.de)?.nombre} → ${flujo.nodos.find((n) => n.id === l.e.a)?.nombre}: ${format(l.e.valor)}`}</title>
          </path>;
        })}
        {cols.flat().map((n) => {
          const p = pos.get(n.id)!;
          const izq = n.col === 2;
          return (
            <g key={n.id} onPointerEnter={() => setHover(n.id)} onPointerDown={() => setHover(hover === n.id ? null : n.id)} style={{ cursor: 'pointer' }} opacity={activo(n.id) ? 1 : 0.35}>
              <rect x={p.x} y={p.y} width={nodeW} height={p.h} rx={3} fill={n.col === 0 ? 'var(--text)' : colorGrupo(n.grupo)} />
              {p.h >= 9 && (
                <text x={izq ? p.x - 6 : p.x + nodeW + 6} y={p.y + p.h / 2 + 4} className="sankey-label" textAnchor={izq ? 'end' : 'start'}>
                  {n.nombre.length > 22 ? `${n.nombre.slice(0, 21)}…` : n.nombre} <tspan className="sankey-val">{compacto(valorNodo.get(n.id)!)}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- Treemap (squarified)
interface Rect { x: number; y: number; w: number; h: number }
function squarify(vals: number[], r: Rect): Rect[] {
  const out: Rect[] = new Array(vals.length);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return vals.map(() => ({ x: r.x, y: r.y, w: 0, h: 0 }));
  const area = vals.map((v) => (v / total) * r.w * r.h);
  let i = 0, x = r.x, y = r.y, w = r.w, h = r.h;
  const peor = (fila: number[], lado: number) => { const s = fila.reduce((a, b) => a + b, 0); const mx = Math.max(...fila), mn = Math.min(...fila); return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn)); };
  while (i < area.length) {
    const lado = Math.min(w, h);
    const fila = [area[i]]; let j = i + 1;
    while (j < area.length && peor([...fila, area[j]], lado) <= peor(fila, lado)) fila.push(area[j++]);
    const s = fila.reduce((a, b) => a + b, 0);
    if (w >= h) { const ancho = s / h; let yy = y; fila.forEach((a, k) => { out[i + k] = { x, y: yy, w: ancho, h: a / ancho }; yy += a / ancho; }); x += ancho; w -= ancho; }
    else { const alto = s / w; let xx = x; fila.forEach((a, k) => { out[i + k] = { x: xx, y, w: a / alto, h: alto }; xx += a / alto; }); y += alto; h -= alto; }
    i = j;
  }
  return out;
}

export function Treemap({ hojas, format, onSelect }: { hojas: Hoja[]; format: (v: number) => string; onSelect?: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>(260);
  const [hover, setHover] = useState<number | null>(null);
  const h = Math.round(Math.min(420, Math.max(240, w * 0.6)));
  const top = hojas.slice(0, 24);
  const rects = useMemo(() => squarify(top.map((x) => x.valor), { x: 0, y: 0, w, h }), [top, w, h]);
  const total = hojas.reduce((s, x) => s + x.valor, 0);
  if (top.length === 0) return <p className="muted">Sin gastos en este periodo.</p>;
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Treemap del gasto por categoría">
        {top.map((x, i) => {
          const r = rects[i]; if (!r || r.w < 1 || r.h < 1) return null;
          const c = colorGrupo(x.grupo);
          const cabe = r.w > 64 && r.h > 34;
          return (
            <g key={x.id} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onClick={() => onSelect?.(x.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={6} fill={c} fillOpacity={hover === i ? 0.95 : 0.78} />
              {cabe && <text x={r.x + 8} y={r.y + 18} className="tm-label">{x.nombre.length * 7 > r.w - 12 ? `${x.nombre.slice(0, Math.max(3, Math.floor((r.w - 16) / 7)))}…` : x.nombre}</text>}
              {cabe && r.h > 50 && <text x={r.x + 8} y={r.y + 36} className="tm-val">{compacto(x.valor)} · {Math.round((x.valor / total) * 100)} %</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && rects[hover] && (
        <Tip x={rects[hover].x + rects[hover].w / 2} w={w}>
          <strong>{top[hover].nombre}</strong>
          <div>{top[hover].grupoNombre}</div>
          <div>{format(top[hover].valor)} · {Math.round((top[hover].valor / total) * 100)} % del total</div>
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Cascada (waterfall)
export function Waterfall({ ingresos, gastos, resultado, format }: { ingresos: number; gastos: { id: string; nombre: string; v: number }[]; resultado: number; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>(280);
  const [hover, setHover] = useState<number | null>(null);
  type Paso = { nombre: string; desde: number; hasta: number; tipo: 'in' | 'out' | 'res' };
  const pasos: Paso[] = [{ nombre: 'Ingresos', desde: 0, hasta: ingresos, tipo: 'in' }];
  let nivel = ingresos;
  for (const g of gastos) { pasos.push({ nombre: g.nombre, desde: nivel, hasta: nivel - g.v, tipo: 'out' }); nivel -= g.v; }
  pasos.push({ nombre: resultado >= 0 ? 'Te quedó' : 'Déficit', desde: 0, hasta: resultado, tipo: 'res' });
  const vals = pasos.flatMap((p) => [p.desde, p.hasta]);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const h = 240, pl = 48, pr = 8, pt = 12, pb = 46;
  const y = (v: number) => pt + ((max - v) / (max - min)) * (h - pt - pb);
  const slot = (w - pl - pr) / pasos.length, bw = Math.max(8, slot * 0.62);
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Cascada: ingresos menos gastos">
        {[min, 0, max].filter((v, i, a) => a.indexOf(v) === i).map((t) => <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} /><text x={pl - 6} y={y(t) + 4} className="axis" textAnchor="end">{compacto(t)}</text></g>)}
        {pasos.map((p, i) => {
          const x = pl + i * slot + (slot - bw) / 2, y0 = y(Math.max(p.desde, p.hasta)), y1 = y(Math.min(p.desde, p.hasta));
          const cls = p.tipo === 'in' ? 'wf-in' : p.tipo === 'out' ? 'wf-out' : resultado >= 0 ? 'wf-in' : 'wf-neg';
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pl + i * slot} y={pt} width={slot} height={h - pt - pb} className={hover === i ? 'hover-band' : 'hit'} />
              <rect x={x} y={y0} width={bw} height={Math.max(1, y1 - y0)} rx={3} className={cls} />
              {i < pasos.length - 1 && <line x1={x + bw} x2={x + slot} y1={y(p.hasta)} y2={y(p.hasta)} className="wf-link" />}
              <text x={pl + i * slot + slot / 2} y={h - pb + 14} className="axis" textAnchor="middle">{p.nombre.length > 10 ? `${p.nombre.slice(0, 9)}…` : p.nombre}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tip x={pl + hover * slot + slot / 2} w={w}>
          <strong>{pasos[hover].nombre}</strong>
          <div>{pasos[hover].tipo === 'out' ? '−' : ''}{format(Math.abs(pasos[hover].hasta - pasos[hover].desde))}</div>
          {pasos[hover].tipo === 'out' && <div>Queda: {format(pasos[hover].hasta)}</div>}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Calendario de calor
const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function CalendarHeatmap({ anio, dias, format }: { anio: number; dias: Map<string, number>; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>(280);
  const [sel, setSel] = useState<string | null>(null);
  const inicio = new Date(Date.UTC(anio, 0, 1));
  const offset = (inicio.getUTCDay() + 6) % 7; // lunes = 0
  const total = (Date.UTC(anio + 1, 0, 1) - inicio.getTime()) / 86_400_000;
  const semanas = Math.ceil((total + offset) / 7);
  const cell = Math.max(6, Math.min(16, Math.floor((w - 28) / semanas) - 2));
  const vals = [...dias.entries()].filter(([k]) => k.startsWith(String(anio))).map(([, v]) => v).sort((a, b) => a - b);
  const p95 = vals.length ? vals[Math.floor(vals.length * 0.95)] : 1;
  const paso = (v: number) => (v <= 0 ? 0 : Math.min(7, 1 + Math.floor((v / Math.max(1, p95)) * 6)));
  const celdas: { k: string; x: number; y: number; v: number }[] = [];
  for (let d = 0; d < total; d++) {
    const f = new Date(inicio.getTime() + d * 86_400_000);
    const k = f.toISOString().slice(0, 10);
    const i = d + offset;
    celdas.push({ k, x: 26 + Math.floor(i / 7) * (cell + 2), y: 16 + (i % 7) * (cell + 2), v: dias.get(k) ?? 0 });
  }
  const h = 16 + 7 * (cell + 2) + 4;
  const s = sel ? celdas.find((c) => c.k === sel) : null;
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={h} role="img" aria-label={`Calendario de gasto ${anio}`}>
        {MES_C.map((m, i) => { const d = (Date.UTC(anio, i, 1) - inicio.getTime()) / 86_400_000 + offset; return <text key={m} x={26 + Math.floor(d / 7) * (cell + 2)} y={10} className="axis">{m}</text>; })}
        {['L', '', 'M', '', 'V', '', 'D'].map((t, i) => <text key={i} x={0} y={16 + i * (cell + 2) + cell - 1} className="axis">{t}</text>)}
        {celdas.map((c) => <rect key={c.k} x={c.x} y={c.y} width={cell} height={cell} rx={2} className={`h${paso(c.v)}${sel === c.k ? ' cal-sel' : ''}`} onPointerEnter={() => setSel(c.k)} onPointerDown={() => setSel(c.k)}><title>{`${c.k}: ${format(c.v)}`}</title></rect>)}
      </svg>
      <div className="heat-scale muted small">{s ? <span><strong>{s.k}</strong>: {format(s.v)}</span> : <><span>Menos</span>{[1, 2, 3, 4, 5, 6, 7].map((x) => <i key={x} className={`h${x}`} />)}<span>Más</span></>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Mancuernas (dumbbell)
export function Dumbbell({ filas, etiquetaAntes, etiquetaAhora, format }: { filas: { id: string; nombre: string; antes: number; ahora: number }[]; etiquetaAntes: string; etiquetaAhora: string; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>(280);
  const lw = Math.min(150, w * 0.36), pr = 16, rh = 30;
  const max = Math.max(1, ...filas.flatMap((f) => [f.antes, f.ahora]));
  const x = (v: number) => lw + (v / max) * (w - lw - pr);
  const h = filas.length * rh + 24;
  if (filas.length === 0) return <p className="muted">Sin datos para comparar.</p>;
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={h} role="img" aria-label={`Comparación ${etiquetaAntes} y ${etiquetaAhora}`}>
        {[0, max / 2, max].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={4} y2={h - 20} className="grid" /><text x={x(t)} y={h - 6} className="axis" textAnchor="middle">{compacto(t)}</text></g>)}
        {filas.map((f, i) => {
          const cy = 14 + i * rh, sube = f.ahora > f.antes;
          const pct = f.antes > 0 ? Math.round(((f.ahora - f.antes) / f.antes) * 100) : null;
          return (
            <g key={f.id}>
              <title>{`${f.nombre}: ${etiquetaAntes} ${format(f.antes)} → ${etiquetaAhora} ${format(f.ahora)}${pct !== null ? ` (${pct > 0 ? '+' : ''}${pct} %)` : ''}`}</title>
              <text x={lw - 8} y={cy + 4} className="sankey-label" textAnchor="end">{f.nombre.length > 18 ? `${f.nombre.slice(0, 17)}…` : f.nombre}</text>
              <line x1={x(f.antes)} x2={x(f.ahora)} y1={cy} y2={cy} className={sube ? 'db-up' : 'db-down'} />
              <circle cx={x(f.antes)} cy={cy} r={5} className="db-antes" />
              <circle cx={x(f.ahora)} cy={cy} r={6} className="db-ahora" />
              {pct !== null && Math.abs(pct) >= 1 && (() => { const derecha = Math.max(x(f.antes), x(f.ahora)) + 46 < w; return <text x={derecha ? Math.max(x(f.antes), x(f.ahora)) + 9 : Math.max(x(f.antes), x(f.ahora))} y={derecha ? cy + 4 : cy - 8} textAnchor={derecha ? 'start' : 'end'} className={`axis ${sube ? 'up-ink' : 'down-ink'}`}>{sube ? '▲' : '▼'}{Math.abs(pct)}%</text>; })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- Ranking en el tiempo (bump)
export function BumpChart({ periodos, series, format }: { periodos: string[]; series: { id: string; nombre: string; valores: number[] }[]; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const [hover, setHover] = useState<string | null>(null);
  const n = series.length, pl = 10, pr = 120, pt = 14, rh = 30;
  const h = pt + n * rh;
  const rangos = periodos.map((_, i) => { const orden = [...series].sort((a, b) => b.valores[i] - a.valores[i]); return new Map(orden.map((s, r) => [s.id, r])); });
  const x = (i: number) => pl + (i / Math.max(1, periodos.length - 1)) * (w - pl - pr);
  const y = (r: number) => pt + r * rh + rh / 2 - 6;
  if (n === 0) return <p className="muted">Sin datos.</p>;
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h + 18} role="img" aria-label="Ranking de grupos por mes">
        {periodos.map((p, i) => (i % Math.ceil(periodos.length / 6) === 0 || i === periodos.length - 1) && <text key={p} x={x(i)} y={h + 14} className="axis" textAnchor="middle">{p}</text>)}
        {series.map((s) => {
          const c = colorGrupo(s.id), on = !hover || hover === s.id;
          const pts = periodos.map((_, i) => `${x(i)},${y(rangos[i].get(s.id)!)}`).join(' ');
          const last = rangos[periodos.length - 1].get(s.id)!;
          return (
            <g key={s.id} opacity={on ? 1 : 0.18} onPointerEnter={() => setHover(s.id)} onPointerDown={() => setHover(hover === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
              <polyline points={pts} fill="none" stroke={c} strokeWidth={hover === s.id ? 4 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
              {periodos.map((p, i) => <circle key={i} cx={x(i)} cy={y(rangos[i].get(s.id)!)} r={4} fill={c} stroke="var(--surface)" strokeWidth={1.5}><title>{`${s.nombre} · ${p}: puesto ${rangos[i].get(s.id)! + 1} (${format(s.valores[i])})`}</title></circle>)}
              <text x={x(periodos.length - 1) + 10} y={y(last) + 4} className="sankey-label">{last + 1}. {s.nombre.length > 14 ? `${s.nombre.slice(0, 13)}…` : s.nombre}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- Enjambre (beeswarm)
export function Beeswarm({ filas, format }: { filas: { id: string; nombre: string; montos: { v: number; desc: string; fecha: string }[] }[]; format: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>(280);
  const [hover, setHover] = useState<{ f: number; i: number } | null>(null);
  const lw = Math.min(130, w * 0.32), pr = 12, rh = 46, r = 3.6;
  const todos = filas.flatMap((f) => f.montos.map((m) => m.v));
  const min = Math.max(1, Math.min(...todos, 1)), max = Math.max(min * 10, ...todos);
  const x = (v: number) => lw + ((Math.log10(Math.max(v, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * (w - lw - pr);
  const ticks = [1, 10, 100, 1000, 10000, 100000].filter((t) => t >= min && t <= max);
  const h = filas.length * rh + 22;
  // acomodo simple: cada punto sube o baja hasta no tocar a los anteriores
  const puntos = filas.map((f) => {
    const placed: { x: number; y: number }[] = [];
    return [...f.montos].sort((a, b) => a.v - b.v).map((m) => {
      const px = x(m.v); let dy = 0;
      for (let k = 0; k < 40; k++) { const cand = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.7); if (!placed.some((p) => Math.hypot(p.x - px, p.y - cand) < r * 2)) { dy = cand; break; } }
      dy = Math.max(-rh / 2 + r, Math.min(rh / 2 - r, dy));
      placed.push({ x: px, y: dy });
      return { m, px, dy };
    });
  });
  if (filas.length === 0) return <p className="muted">Sin gastos en este periodo.</p>;
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Distribución de los gastos por categoría">
        {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={2} y2={h - 18} className="grid" /><text x={x(t)} y={h - 4} className="axis" textAnchor="middle">{compacto(t)}</text></g>)}
        {filas.map((f, fi) => {
          const cy = fi * rh + rh / 2;
          const vs = f.montos.map((m) => m.v).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)];
          return (
            <g key={f.id}>
              <text x={lw - 8} y={cy + 4} className="sankey-label" textAnchor="end">{f.nombre.length > 16 ? `${f.nombre.slice(0, 15)}…` : f.nombre}</text>
              <line x1={x(med)} x2={x(med)} y1={cy - rh / 2 + 4} y2={cy + rh / 2 - 4} className="median" />
              {puntos[fi].map((p, i) => <circle key={i} cx={p.px} cy={cy + p.dy} r={r} className="bee" onPointerEnter={() => setHover({ f: fi, i })} onPointerDown={() => setHover({ f: fi, i })} />)}
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tip x={puntos[hover.f][hover.i].px} w={w}>
          <strong>{puntos[hover.f][hover.i].m.desc || '(sin descripción)'}</strong>
          <div>{puntos[hover.f][hover.i].m.fecha} · {format(puntos[hover.f][hover.i].m.v)}</div>
        </Tip>
      )}
    </div>
  );
}
