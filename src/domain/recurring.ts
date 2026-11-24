import { addDays, addMonths, daysBetween, daysInMonth, monthKey } from './dates';
import type { Movimiento, Recurrente } from './model';

export type EstadoPago = 'PAGADO' | 'OMITIDO' | 'VENCIDO' | 'PRÓXIMO' | 'PENDIENTE';

export interface Ocurrencia {
  recurrente: Recurrente;
  fecha: string;
  estado: EstadoPago;
  movimiento: Movimiento | null;
  diasPara: number;
}

const PASO_MESES: Record<string, number> = { MENSUAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

function fechaEnMes(key: string, dia: number): string {
  return `${key}-${String(Math.min(dia, daysInMonth(key))).padStart(2, '0')}`;
}

/** Fechas de vencimiento del recurrente dentro de [desde, hasta]. */
export function fechasEntre(r: Recurrente, desde: string, hasta: string): string[] {
  const out: string[] = [];
  const inicio = r.fechaInicio ?? desde;
  const fin = r.fechaFin && r.fechaFin < hasta ? r.fechaFin : hasta;
  const dia = r.dia ?? (r.fechaInicio ? +r.fechaInicio.slice(8, 10) : 1);
  const dentro = (f: string) => f >= desde && f <= fin && f >= inicio;

  if (r.frecuencia === 'UNICA' || r.frecuencia === 'ÚNICA') {
    if (r.fechaInicio && dentro(r.fechaInicio)) out.push(r.fechaInicio);
    return out;
  }
  if (r.frecuencia === 'SEMANAL' || r.frecuencia === 'QUINCENAL') {
    const paso = r.frecuencia === 'SEMANAL' ? 7 : 14;
    let f = inicio;
    if (f < desde) f = addDays(f, Math.ceil(daysBetween(f, desde) / paso) * paso);
    for (; f <= fin; f = addDays(f, paso)) if (dentro(f)) out.push(f);
    return out;
  }
  const paso = PASO_MESES[r.frecuencia] ?? 1;
  const base = monthKey(inicio);
  let k = base;
  const desdeK = monthKey(desde);
  if (k < desdeK) {
    const diff = (+desdeK.slice(0, 4) - +base.slice(0, 4)) * 12 + (+desdeK.slice(5, 7) - +base.slice(5, 7));
    k = addMonths(base, Math.floor(diff / paso) * paso);
  }
  for (; ; k = addMonths(k, paso)) {
    const f = fechaEnMes(k, dia);
    if (f > fin) break;
    if (dentro(f)) out.push(f);
  }
  return out;
}

/**
 * Ocurrencias de pagos fijos entre dos fechas, con su estado.
 * Un pago se considera hecho si hay un movimiento con ese RECURRENTE_ID en el mismo periodo
 * (mismo mes, o ±7 días para semanales/quincenales).
 */
export function ocurrencias(recs: Recurrente[], movs: Movimiento[], desde: string, hasta: string, hoy: string): Ocurrencia[] {
  const porRec = new Map<string, Movimiento[]>();
  for (const m of movs) {
    if (!m.recurrenteId || m.eliminado || m.estado === 'ANULADO') continue;
    const l = porRec.get(m.recurrenteId) ?? [];
    l.push(m);
    porRec.set(m.recurrenteId, l);
  }
  const out: Ocurrencia[] = [];
  for (const r of recs) {
    if (!r.activo) continue;
    for (const f of fechasEntre(r, desde, hasta)) {
      const corto = r.frecuencia === 'SEMANAL' || r.frecuencia === 'QUINCENAL';
      const mov = (porRec.get(r.id) ?? []).find((m) => (corto ? Math.abs(daysBetween(m.fecha, f)) <= 7 : monthKey(m.fecha) === monthKey(f))) ?? null;
      const dias = daysBetween(hoy, f);
      let estado: EstadoPago;
      if (mov) estado = mov.estado === 'OMITIDO' ? 'OMITIDO' : 'PAGADO';
      else if (dias < 0) estado = 'VENCIDO';
      else if (dias <= r.avisarDiasAntes) estado = 'PRÓXIMO';
      else estado = 'PENDIENTE';
      out.push({ recurrente: r, fecha: f, estado, movimiento: mov, diasPara: dias });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.recurrente.descripcion.localeCompare(b.recurrente.descripcion));
}

/** Pagos que requieren atención: vencidos (últimos 30 días) o próximos según el aviso de cada uno. */
export function porAtender(recs: Recurrente[], movs: Movimiento[], hoy: string): Ocurrencia[] {
  return ocurrencias(recs, movs, addDays(hoy, -30), addDays(hoy, 31), hoy).filter((o) => o.estado === 'VENCIDO' || o.estado === 'PRÓXIMO');
}
