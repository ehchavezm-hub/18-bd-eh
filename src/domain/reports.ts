import { addMonths, daysInMonth, monthKey } from './dates';
import type { Categoria, Movimiento } from './model';
import { cuenta, enSoles } from './model';

export interface Filtro { centroId?: string | null }

const pasa = (m: Movimiento, f: Filtro) => cuenta(m) && (!f.centroId || m.centroId === f.centroId);

export interface ResumenMes { mes: string; ingresos: number; egresos: number; sinTipoCambio: number }

/** Ingresos y egresos en soles de un mes. Las transferencias no cuentan. */
export function resumenMes(movs: Movimiento[], mes: string, f: Filtro = {}): ResumenMes {
  const r: ResumenMes = { mes, ingresos: 0, egresos: 0, sinTipoCambio: 0 };
  for (const m of movs) {
    if (!pasa(m, f) || monthKey(m.fecha) !== mes) continue;
    if (m.tipo !== 'INGRESO' && m.tipo !== 'EGRESO' && m.tipo !== 'REEMBOLSO') continue;
    const v = enSoles(m);
    if (v === null) { r.sinTipoCambio += 1; continue; }
    if (m.tipo === 'INGRESO') r.ingresos += v;
    else if (m.tipo === 'EGRESO') r.egresos += v;
    else r.egresos -= v; // un reembolso reduce el gasto
  }
  r.ingresos = Math.round(r.ingresos * 100) / 100;
  r.egresos = Math.round(r.egresos * 100) / 100;
  return r;
}

export function ultimosMeses(hasta: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(hasta, i - n + 1));
}

/** Gasto acumulado día a día de un mes (para comparar con el mes anterior). */
export function acumuladoDiario(movs: Movimiento[], mes: string, hastaDia?: number, f: Filtro = {}): number[] {
  const dias = daysInMonth(mes);
  const porDia = new Array<number>(dias).fill(0);
  for (const m of movs) {
    if (!pasa(m, f) || m.tipo !== 'EGRESO' || monthKey(m.fecha) !== mes) continue;
    const v = enSoles(m);
    if (v !== null) porDia[+m.fecha.slice(8, 10) - 1] += v;
  }
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < (hastaDia ?? dias); i++) { acc += porDia[i]; out.push(Math.round(acc * 100) / 100); }
  return out;
}

export interface Parte { id: string; nombre: string; valor: number; movimientos: number }

/** Gasto del mes por categoría (o por centro), de mayor a menor; a partir de `max` se agrupa en "Otros". */
export function gastoPor(
  movs: Movimiento[], mes: string, clave: 'categoriaId' | 'centroId' | 'cuentaId' | 'lugarId' | 'medioPago', nombres: Map<string, string>, max = 7, f: Filtro = {},
): Parte[] {
  const acc = new Map<string, Parte>();
  for (const m of movs) {
    if (!pasa(m, f) || m.tipo !== 'EGRESO' || monthKey(m.fecha) !== mes) continue;
    const v = enSoles(m);
    if (v === null) continue;
    const id = m[clave] ?? 'SIN';
    const p = acc.get(id) ?? { id, nombre: nombres.get(id) ?? (id === 'SIN' ? 'Sin clasificar' : id), valor: 0, movimientos: 0 };
    p.valor += v; p.movimientos += 1;
    acc.set(id, p);
  }
  const lista = [...acc.values()].map((p) => ({ ...p, valor: Math.round(p.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  if (lista.length <= max) return lista;
  const resto = lista.slice(max - 1);
  return [...lista.slice(0, max - 1), {
    id: 'OTROS', nombre: `Otros (${resto.length})`, valor: Math.round(resto.reduce((s, p) => s + p.valor, 0) * 100) / 100,
    movimientos: resto.reduce((s, p) => s + p.movimientos, 0),
  }];
}

/** Reparto 50/30/20 del gasto del mes según TIPO_50_30_20 de cada categoría. */
export function regla503020(movs: Movimiento[], mes: string, categorias: Map<string, Categoria>, f: Filtro = {}) {
  const r = { NECESIDAD: 0, DESEO: 0, 'AHORRO / DEUDA': 0, 'SIN CLASIFICAR': 0 } as Record<string, number>;
  for (const m of movs) {
    if (!pasa(m, f) || m.tipo !== 'EGRESO' || monthKey(m.fecha) !== mes) continue;
    const v = enSoles(m);
    if (v === null) continue;
    const t = (m.categoriaId && categorias.get(m.categoriaId)?.tipo503020) || 'SIN CLASIFICAR';
    r[t] = (r[t] ?? 0) + v;
  }
  return r;
}

/** Mapa de calor: gasto por categoría padre (grupo) y mes. */
export function calorGrupoMes(movs: Movimiento[], meses: string[], categorias: Map<string, Categoria>, f: Filtro = {}, periodo: (fecha: string) => string = monthKey) {
  const set = new Set(meses);
  const grupos = new Map<string, Map<string, number>>();
  for (const m of movs) {
    if (!pasa(m, f) || m.tipo !== 'EGRESO') continue;
    const mes = periodo(m.fecha);
    if (!set.has(mes)) continue;
    const v = enSoles(m);
    if (v === null) continue;
    const cat = m.categoriaId ? categorias.get(m.categoriaId) : undefined;
    const g = cat?.padreId ?? cat?.id ?? 'SIN';
    const fila = grupos.get(g) ?? new Map<string, number>();
    fila.set(mes, (fila.get(mes) ?? 0) + v);
    grupos.set(g, fila);
  }
  return [...grupos.entries()]
    .map(([id, fila]) => ({ id, nombre: categorias.get(id)?.nombre ?? (id === 'SIN' ? 'Sin clasificar' : id), valores: meses.map((k) => Math.round(fila.get(k) ?? 0)), total: [...fila.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
}

/** Último mes que tiene movimientos pagados (para que los dashboards no arranquen vacíos). */
export function ultimoMesConDatos(movs: Movimiento[]): string | null {
  let max: string | null = null;
  for (const m of movs) if (cuenta(m) && (m.tipo === 'EGRESO' || m.tipo === 'INGRESO')) { const k = monthKey(m.fecha); if (!max || k > max) max = k; }
  return max;
}

export interface ResumenAnio { anio: string; ingresos: number; egresos: number; meses: number }

/** Ingresos y egresos en soles por año, con cuántos meses tienen datos. */
export function resumenPorAnio(movs: Movimiento[], f: Filtro = {}): ResumenAnio[] {
  const acc = new Map<string, { ingresos: number; egresos: number; meses: Set<string> }>();
  for (const m of movs) {
    if (!pasa(m, f) || (m.tipo !== 'INGRESO' && m.tipo !== 'EGRESO' && m.tipo !== 'REEMBOLSO')) continue;
    const v = enSoles(m);
    if (v === null) continue;
    const y = m.fecha.slice(0, 4);
    const a = acc.get(y) ?? { ingresos: 0, egresos: 0, meses: new Set<string>() };
    if (m.tipo === 'INGRESO') a.ingresos += v; else if (m.tipo === 'EGRESO') a.egresos += v; else a.egresos -= v;
    a.meses.add(monthKey(m.fecha));
    acc.set(y, a);
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([anio, a]) => ({ anio, ingresos: Math.round(a.ingresos), egresos: Math.round(a.egresos), meses: a.meses.size }));
}

const egresoSoles = (m: Movimiento, f: Filtro) => (pasa(m, f) && m.tipo === 'EGRESO' ? enSoles(m) : null);

/** Gasto de cada día del mes. */
export function gastoDiario(movs: Movimiento[], mes: string, f: Filtro = {}): number[] {
  const out = new Array<number>(daysInMonth(mes)).fill(0);
  for (const m of movs) { if (monthKey(m.fecha) !== mes) continue; const v = egresoSoles(m, f); if (v !== null) out[+m.fecha.slice(8, 10) - 1] += v; }
  return out.map((v) => Math.round(v));
}

/** Gasto promedio por día de la semana (lunes a domingo) en un conjunto de meses. */
export function gastoPorDiaSemana(movs: Movimiento[], meses: string[], f: Filtro = {}): number[] {
  const set = new Set(meses);
  const tot = new Array<number>(7).fill(0);
  const dias = new Array<Set<string>>(7).fill(null as never).map(() => new Set<string>());
  for (const k of meses) for (let d = 1; d <= daysInMonth(k); d++) {
    const iso = `${k}-${String(d).padStart(2, '0')}`; const w = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; dias[w].add(iso);
  }
  for (const m of movs) {
    if (!set.has(monthKey(m.fecha))) continue;
    const v = egresoSoles(m, f); if (v === null) continue;
    tot[(new Date(`${m.fecha}T12:00:00Z`).getUTCDay() + 6) % 7] += v;
  }
  return tot.map((t, i) => Math.round(t / Math.max(1, dias[i].size)));
}

/** Los gastos más grandes de un mes. */
export function topGastos(movs: Movimiento[], mes: string, n = 8, f: Filtro = {}) {
  return movs.filter((m) => monthKey(m.fecha) === mes && egresoSoles(m, f) !== null)
    .sort((a, b) => (enSoles(b) ?? 0) - (enSoles(a) ?? 0)).slice(0, n);
}

/** Gasto total por periodo (mes o año). */
export function gastoPorPeriodo(movs: Movimiento[], periodos: string[], periodo: (fecha: string) => string = monthKey, f: Filtro = {}): number[] {
  const idx = new Map(periodos.map((p, i) => [p, i]));
  const out = new Array<number>(periodos.length).fill(0);
  for (const m of movs) { const i = idx.get(periodo(m.fecha)); if (i === undefined) continue; const v = egresoSoles(m, f); if (v !== null) out[i] += v; }
  return out.map((v) => Math.round(v));
}

/** Promedio móvil de `n` periodos. */
export const promedioMovil = (xs: number[], n = 3) => xs.map((_, i) => { const w = xs.slice(Math.max(0, i - n + 1), i + 1); return Math.round(w.reduce((a, b) => a + b, 0) / w.length); });

/** Gasto por periodo separado por una propiedad de la categoría (clase, fijo/variable). */
export function gastoPorAtributo(
  movs: Movimiento[], periodos: string[], categorias: Map<string, Categoria>, atributo: (c: Categoria | undefined) => string,
  periodo: (fecha: string) => string = monthKey, f: Filtro = {},
): Map<string, number[]> {
  const idx = new Map(periodos.map((p, i) => [p, i]));
  const out = new Map<string, number[]>();
  for (const m of movs) {
    const i = idx.get(periodo(m.fecha)); if (i === undefined) continue;
    const v = egresoSoles(m, f); if (v === null) continue;
    const k = atributo(m.categoriaId ? categorias.get(m.categoriaId) : undefined);
    const arr = out.get(k) ?? new Array<number>(periodos.length).fill(0);
    arr[i] += v; out.set(k, arr);
  }
  for (const [k, arr] of out) out.set(k, arr.map(Math.round));
  return out;
}

/** Gasto por centro y periodo (para el mapa de calor por persona/proyecto). */
export function calorCentro(movs: Movimiento[], periodos: string[], nombres: Map<string, string>, periodo: (fecha: string) => string = monthKey, f: Filtro = {}) {
  const idx = new Map(periodos.map((p, i) => [p, i]));
  const filas = new Map<string, number[]>();
  for (const m of movs) {
    const i = idx.get(periodo(m.fecha)); if (i === undefined) continue;
    const v = egresoSoles(m, f); if (v === null) continue;
    const k = m.centroId ?? 'SIN';
    const arr = filas.get(k) ?? new Array<number>(periodos.length).fill(0);
    arr[i] += v; filas.set(k, arr);
  }
  return [...filas.entries()].map(([id, vals]) => ({ id, nombre: nombres.get(id) ?? (id === 'SIN' ? 'Sin centro' : id), valores: vals.map(Math.round), total: vals.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
}
