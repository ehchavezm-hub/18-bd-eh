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
  movs: Movimiento[], mes: string, clave: 'categoriaId' | 'centroId', nombres: Map<string, string>, max = 7, f: Filtro = {},
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
export function calorGrupoMes(movs: Movimiento[], meses: string[], categorias: Map<string, Categoria>, f: Filtro = {}) {
  const set = new Set(meses);
  const grupos = new Map<string, Map<string, number>>();
  for (const m of movs) {
    if (!pasa(m, f) || m.tipo !== 'EGRESO') continue;
    const mes = monthKey(m.fecha);
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
