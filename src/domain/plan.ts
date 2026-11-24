/**
 * Control y metas: presupuestos, cierre de mes, patrimonio neto y metas de ahorro.
 * Todo se calcula en soles con el tipo de cambio de cada día (ver enSoles / aSoles).
 */
import type { Row } from '../lib/rows';
import { isYes } from '../lib/rows';
import { addMonths, daysInMonth, monthKey, toIsoDate } from './dates';
import { aSoles, cuenta as cuentaValida, enSoles, type Categoria, type Cuenta, type Movimiento, type Recurrente } from './model';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** MES en la hoja: vacío (todos los meses), "AAAA-MM" o una fecha. */
function mesDe(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return toIsoDate(v)?.slice(0, 7) ?? null;
  const t = str(v);
  return /^\d{4}-\d{2}/.test(t) ? t.slice(0, 7) : null;
}

// ---------------------------------------------------------------- Presupuestos

export interface Presupuesto { id: string; mes: string | null; categoriaId: string; centroId: string | null; monto: number; moneda: string }

export function toPresupuesto(r: Row): Presupuesto | null {
  const id = str(r.PRESUPUESTO_ID); const categoriaId = str(r.CATEGORIA_ID); const monto = num(r.MONTO);
  if (!id || !categoriaId || !monto || monto <= 0) return null;
  return { id, mes: mesDe(r.MES), categoriaId, centroId: str(r.CENTRO_ID) || null, monto, moneda: str(r.MONEDA) || 'PEN' };
}

export type EstadoPresupuesto = 'ok' | 'alerta' | 'excedido';
export interface AvancePresupuesto {
  presupuesto: Presupuesto; nombre: string; limite: number; gastado: number; pct: number; estado: EstadoPresupuesto;
  /** Gasto proyectado al cierre del mes al ritmo actual (solo el mes en curso). */
  proyeccion: number | null;
}

/** Presupuestos que aplican a un mes: el específico del mes reemplaza al general ("todos los meses") de la misma categoría y centro. */
export function presupuestosDelMes(ps: Presupuesto[], mes: string): Presupuesto[] {
  const clave = (p: Presupuesto) => `${p.categoriaId}|${p.centroId ?? ''}`;
  const especificos = new Set(ps.filter((p) => p.mes === mes).map(clave));
  return ps.filter((p) => p.mes === mes || (p.mes === null && !especificos.has(clave(p))));
}

/** ¿El movimiento cae en la categoría del presupuesto? (la categoría o, si es un grupo, cualquiera de sus hijas) */
const enCategoria = (m: Movimiento, catId: string, cats: Map<string, Categoria>) =>
  m.categoriaId === catId || (m.categoriaId !== null && cats.get(m.categoriaId)?.padreId === catId);

export function avancePresupuestos(ps: Presupuesto[], movs: Movimiento[], cats: Map<string, Categoria>, mes: string, hoy: string): AvancePresupuesto[] {
  const dias = daysInMonth(mes);
  const diaHoy = monthKey(hoy) === mes ? +hoy.slice(8, 10) : null;
  return presupuestosDelMes(ps, mes).map((p) => {
    let gastado = 0;
    for (const m of movs) {
      if (!cuentaValida(m) || monthKey(m.fecha) !== mes || !enCategoria(m, p.categoriaId, cats)) continue;
      if (p.centroId && m.centroId !== p.centroId) continue;
      const v = enSoles(m);
      if (v === null) continue;
      if (m.tipo === 'EGRESO') gastado += v;
      else if (m.tipo === 'REEMBOLSO') gastado -= v;
    }
    const limite = aSoles(p.monto, p.moneda, `${mes}-01`) ?? p.monto;
    const pct = limite > 0 ? gastado / limite : 0;
    return {
      presupuesto: p, nombre: cats.get(p.categoriaId)?.nombre ?? p.categoriaId, limite: r2(limite), gastado: r2(gastado), pct,
      estado: pct >= 1 ? 'excedido' : pct >= 0.8 ? 'alerta' : 'ok',
      proyeccion: diaHoy ? r2((gastado / diaHoy) * dias) : null,
    } satisfies AvancePresupuesto;
  }).sort((a, b) => b.pct - a.pct);
}

/** Sugerencia de presupuesto por grupo: promedio de los últimos N meses con gasto, redondeado a 10. */
export function sugerirPresupuestos(movs: Movimiento[], cats: Map<string, Categoria>, hastaMes: string, n = 6, max = 10) {
  const meses = Array.from({ length: n }, (_, i) => addMonths(hastaMes, -i - 1));
  const porGrupo = new Map<string, number>();
  for (const m of movs) {
    if (!cuentaValida(m) || m.tipo !== 'EGRESO' || !meses.includes(monthKey(m.fecha)) || !m.categoriaId) continue;
    const c = cats.get(m.categoriaId);
    const g = c?.padreId ?? m.categoriaId;
    if (cats.get(g)?.clase === 'INTERNO' || c?.clase === 'INTERNO' || c?.clase === 'FINANCIERO') continue;
    const v = enSoles(m);
    if (v !== null) porGrupo.set(g, (porGrupo.get(g) ?? 0) + v);
  }
  return [...porGrupo.entries()]
    .map(([id, total]) => ({ categoriaId: id, nombre: cats.get(id)?.nombre ?? id, monto: Math.ceil(total / n / 10) * 10 }))
    .filter((x) => x.monto >= 50)
    .sort((a, b) => b.monto - a.monto)
    .slice(0, max);
}

// ---------------------------------------------------------------- Cierre de mes

export interface CambioCategoria { id: string; nombre: string; antes: number; ahora: number; diferencia: number }
export interface CambioPagoFijo { id: string; nombre: string; antes: number; ahora: number; diferencia: number }
export interface CierreMes {
  mes: string; ingresos: number; egresos: number; ahorro: number; tasaAhorro: number | null;
  egresosAnterior: number; promedio6: number; movimientos: number;
  subieron: CambioCategoria[]; bajaron: CambioCategoria[]; pagosQueSubieron: CambioPagoFijo[];
}

function egresosPorGrupo(movs: Movimiento[], mes: string, cats: Map<string, Categoria>) {
  const out = new Map<string, number>();
  for (const m of movs) {
    if (!cuentaValida(m) || monthKey(m.fecha) !== mes || (m.tipo !== 'EGRESO' && m.tipo !== 'REEMBOLSO')) continue;
    const v = enSoles(m); if (v === null) continue;
    const g = (m.categoriaId && cats.get(m.categoriaId)?.padreId) || m.categoriaId || 'SIN';
    out.set(g, (out.get(g) ?? 0) + (m.tipo === 'EGRESO' ? v : -v));
  }
  return out;
}

function totalesMes(movs: Movimiento[], mes: string) {
  let ingresos = 0, egresos = 0, n = 0;
  for (const m of movs) {
    if (!cuentaValida(m) || monthKey(m.fecha) !== mes) continue;
    const v = enSoles(m); if (v === null) continue;
    if (m.tipo === 'INGRESO') { ingresos += v; n++; } else if (m.tipo === 'EGRESO') { egresos += v; n++; } else if (m.tipo === 'REEMBOLSO') { egresos -= v; n++; }
  }
  return { ingresos: r2(ingresos), egresos: r2(egresos), n };
}

export function cierreMes(movs: Movimiento[], cats: Map<string, Categoria>, recs: Recurrente[], mes: string): CierreMes {
  const ant = addMonths(mes, -1);
  const t = totalesMes(movs, mes);
  const tAnt = totalesMes(movs, ant);
  const prev = Array.from({ length: 6 }, (_, i) => totalesMes(movs, addMonths(mes, -i - 1)).egresos).filter((v) => v > 0);
  const gAhora = egresosPorGrupo(movs, mes, cats), gAntes = egresosPorGrupo(movs, ant, cats);
  const cambios: CambioCategoria[] = [...new Set([...gAhora.keys(), ...gAntes.keys()])].map((id) => {
    const ahora = r2(gAhora.get(id) ?? 0), antes = r2(gAntes.get(id) ?? 0);
    return { id, nombre: cats.get(id)?.nombre ?? (id === 'SIN' ? 'Sin categoría' : id), antes, ahora, diferencia: r2(ahora - antes) };
  });
  // Pagos fijos: monto pagado este mes frente al mes anterior (mismo RECURRENTE_ID).
  const pagado = (rid: string, k: string) => movs.filter((m) => cuentaValida(m) && m.recurrenteId === rid && monthKey(m.fecha) === k)
    .reduce((s, m) => s + (enSoles(m) ?? 0), 0);
  const pagos = recs.filter((r) => r.activo).map((r) => ({ id: r.id, nombre: r.descripcion, antes: r2(pagado(r.id, ant)), ahora: r2(pagado(r.id, mes)) }))
    .filter((p) => p.antes > 0 && p.ahora > p.antes * 1.02)
    .map((p) => ({ ...p, diferencia: r2(p.ahora - p.antes) }))
    .sort((a, b) => b.diferencia - a.diferencia);
  return {
    mes, ingresos: t.ingresos, egresos: t.egresos, ahorro: r2(t.ingresos - t.egresos),
    tasaAhorro: t.ingresos > 0 ? (t.ingresos - t.egresos) / t.ingresos : null,
    egresosAnterior: tAnt.egresos, promedio6: prev.length ? r2(prev.reduce((a, b) => a + b, 0) / prev.length) : 0, movimientos: t.n,
    subieron: cambios.filter((c) => c.diferencia > 0).sort((a, b) => b.diferencia - a.diferencia).slice(0, 5),
    bajaron: cambios.filter((c) => c.diferencia < 0).sort((a, b) => a.diferencia - b.diferencia).slice(0, 3),
    pagosQueSubieron: pagos.slice(0, 5),
  };
}

// ---------------------------------------------------------------- Saldos en una fecha y patrimonio

/** Efecto de un movimiento en el saldo de una cuenta (misma regla que calcularSaldos). */
function deltas(m: Movimiento): [string, number][] {
  switch (m.tipo) {
    case 'INGRESO': case 'REEMBOLSO': case 'AJUSTE': return [[m.cuentaId, m.monto]];
    case 'EGRESO': return [[m.cuentaId, -m.monto]];
    case 'TRANSFERENCIA': return m.cuentaDestinoId ? [[m.cuentaId, -m.monto], [m.cuentaDestinoId, m.montoDestino ?? m.monto]] : [[m.cuentaId, -m.monto]];
    default: return [];
  }
}

/**
 * Saldo de cada cuenta al cierre de una fecha.
 * Con saldo inicial: se parte de él y se suman (o restan, si la fecha es anterior) los movimientos entre ambas fechas.
 * Sin saldo inicial: solo la suma de movimientos hasta la fecha (marcado como no confiable).
 */
export function saldosAl(cuentas: Cuenta[], movs: Movimiento[], fecha: string): Map<string, { saldo: number; confiable: boolean }> {
  const out = new Map(cuentas.map((c) => [c.id, { saldo: c.saldoInicial ?? 0, confiable: c.saldoInicial !== null }]));
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const m of movs) {
    if (!cuentaValida(m)) continue;
    for (const [id, d] of deltas(m)) {
      const c = porId.get(id); const s = out.get(id);
      if (!c || !s) continue;
      const si = c.saldoInicial !== null ? c.fechaSaldoInicial : null;
      if (si) {
        if (m.fecha > si && m.fecha <= fecha) s.saldo += d;
        else if (m.fecha <= si && m.fecha > fecha) s.saldo -= d;
      } else if (m.fecha <= fecha) s.saldo += d;
    }
  }
  for (const s of out.values()) s.saldo = r2(s.saldo);
  return out;
}

export interface Activo { id: string; nombre: string; tipo: string; fechaAdquisicion: string | null; costo: number | null; moneda: string; valorEstimado: number | null; cuentaDeudaId: string | null; activo: boolean }
export function toActivo(r: Row): Activo | null {
  const id = str(r.ACTIVO_ID); if (!id) return null;
  return {
    id, nombre: str(r.NOMBRE) || id, tipo: str(r.TIPO), fechaAdquisicion: toIsoDate(r.FECHA_ADQUISICION), costo: num(r.COSTO_ADQUISICION),
    moneda: str(r.MONEDA) || 'PEN', valorEstimado: num(r.VALOR_ESTIMADO), cuentaDeudaId: str(r.CUENTA_DEUDA_ID) || null,
    activo: r.ACTIVO === undefined || r.ACTIVO === '' ? true : isYes(r.ACTIVO),
  };
}

export interface PuntoPatrimonio { mes: string; liquido: number; inversiones: number; porCobrar: number; bienes: number; deudas: number; neto: number }

const finDeMes = (k: string) => `${k}-${String(daysInMonth(k)).padStart(2, '0')}`;

/** Patrimonio neto al cierre de cada mes: dinero + inversiones + por cobrar + bienes − deudas (en soles). */
export function patrimonioMensual(cuentas: Cuenta[], movs: Movimiento[], activos: Activo[], meses: string[]): { puntos: PuntoPatrimonio[]; sinSaldoInicial: Cuenta[]; sinTc: number } {
  let sinTc = 0;
  const puntos = meses.map((k) => {
    const f = finDeMes(k);
    const saldos = saldosAl(cuentas, movs, f);
    const p: PuntoPatrimonio = { mes: k, liquido: 0, inversiones: 0, porCobrar: 0, bienes: 0, deudas: 0, neto: 0 };
    for (const c of cuentas) {
      const s = saldos.get(c.id); if (!s || s.saldo === 0) continue;
      const v = aSoles(s.saldo, c.moneda, f);
      if (v === null) { sinTc++; continue; }
      if (c.tipo === 'TARJETA DE CRÉDITO' || c.clasePatrimonio === 'DEUDA' || c.tipo === 'DEUDA') p.deudas += -v; // deuda = saldo negativo
      else if (c.clasePatrimonio === 'POR COBRAR') p.porCobrar += v;
      else if (c.clasePatrimonio === 'INVERSIÓN' || c.clasePatrimonio === 'RETIRO') p.inversiones += v;
      else p.liquido += v;
    }
    for (const a of activos) {
      if (!a.activo || (a.fechaAdquisicion && a.fechaAdquisicion > f)) continue;
      const valor = a.valorEstimado ?? a.costo; if (valor === null) continue;
      p.bienes += aSoles(valor, a.moneda, f) ?? 0;
    }
    for (const k2 of ['liquido', 'inversiones', 'porCobrar', 'bienes', 'deudas'] as const) p[k2] = r2(p[k2]);
    p.neto = r2(p.liquido + p.inversiones + p.porCobrar + p.bienes - p.deudas);
    return p;
  });
  const usadas = new Set(movs.flatMap((m) => [m.cuentaId, m.cuentaDestinoId]));
  return { puntos, sinSaldoInicial: cuentas.filter((c) => c.activa && c.saldoInicial === null && usadas.has(c.id)), sinTc };
}

// ---------------------------------------------------------------- Metas

export interface Meta {
  id: string; nombre: string; tipo: string; objetivo: number; moneda: string; fechaObjetivo: string | null;
  cuentaId: string | null; aporteMensual: number | null; prioridad: number; estado: string;
}
export function toMeta(r: Row): Meta | null {
  const id = str(r.META_ID); const objetivo = num(r.MONTO_OBJETIVO);
  if (!id || !objetivo) return null;
  return {
    id, nombre: str(r.NOMBRE) || id, tipo: str(r.TIPO), objetivo, moneda: str(r.MONEDA) || 'PEN', fechaObjetivo: toIsoDate(r.FECHA_OBJETIVO),
    cuentaId: str(r.CUENTA_ID) || null, aporteMensual: num(r.APORTE_MENSUAL), prioridad: num(r.PRIORIDAD) ?? 99, estado: (str(r.ESTADO) || 'ACTIVA').toUpperCase(),
  };
}

export interface AvanceMeta {
  meta: Meta; actual: number | null; pct: number; falta: number; mesesRestantes: number | null;
  /** Aporte mensual necesario para llegar a tiempo. */
  necesarioMes: number | null; aTiempo: boolean | null;
}

export function avanceMetas(metas: Meta[], cuentas: Cuenta[], movs: Movimiento[], hoy: string): AvanceMeta[] {
  const saldos = saldosAl(cuentas, movs, hoy);
  const monedaCta = new Map(cuentas.map((c) => [c.id, c.moneda]));
  return metas.filter((m) => m.estado !== 'CANCELADA').map((meta) => {
    let actual: number | null = null;
    if (meta.cuentaId && saldos.has(meta.cuentaId)) {
      const s = saldos.get(meta.cuentaId)!.saldo; const mon = monedaCta.get(meta.cuentaId) ?? 'PEN';
      if (mon === meta.moneda) actual = s;
      else {
        // Cuenta y meta en monedas distintas: se pasa por soles con el tipo de cambio del día.
        const enPen = aSoles(s, mon, hoy), tc = aSoles(1, meta.moneda, hoy);
        actual = enPen !== null && tc ? enPen / tc : null;
      }
    }
    if (meta.estado === 'LOGRADA') actual = Math.max(actual ?? 0, meta.objetivo);
    const a = actual ?? 0;
    const falta = r2(Math.max(0, meta.objetivo - a));
    const mesesRestantes = meta.fechaObjetivo
      ? Math.max(0, (+meta.fechaObjetivo.slice(0, 4) - +hoy.slice(0, 4)) * 12 + (+meta.fechaObjetivo.slice(5, 7) - +hoy.slice(5, 7)))
      : null;
    const necesarioMes = mesesRestantes === null ? null : mesesRestantes === 0 ? falta : r2(falta / mesesRestantes);
    return {
      meta, actual: actual === null ? null : r2(actual), pct: Math.min(1, a / meta.objetivo), falta, mesesRestantes, necesarioMes,
      aTiempo: falta === 0 ? true : necesarioMes === null || meta.aporteMensual === null ? null : meta.aporteMensual >= necesarioMes,
    };
  }).sort((x, y) => x.meta.prioridad - y.meta.prioridad);
}
