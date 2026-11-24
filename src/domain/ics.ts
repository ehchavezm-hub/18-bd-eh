/**
 * Recordatorios de pagos fijos como calendario (.ics): el calendario del teléfono avisa aunque la app esté cerrada,
 * sin servidores intermedios. Cada pago fijo es un evento de día completo que se repite, con aviso a las 9:00.
 */
import { addDays } from './dates';
import { fechasEntre } from './recurring';
import type { Recurrente } from './model';
import { dinero } from './format';

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fecha = (iso: string) => iso.replace(/-/g, '');

/** Pliega líneas a 75 octetos (RFC 5545). */
function plegar(linea: string): string {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const out: string[] = []; let actual = '', n = 0;
  for (const ch of linea) {
    const b = new TextEncoder().encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(actual); actual = ''; n = 0; }
    actual += ch; n += b;
  }
  out.push(actual);
  return out.join('\r\n ');
}

function regla(r: Recurrente, inicio: string): string | null {
  const hasta = r.fechaFin ? `;UNTIL=${fecha(r.fechaFin)}` : '';
  const dia = r.dia ?? +inicio.slice(8, 10);
  // Días 29–31: "último día del mes" (los meses cortos no tienen ese día).
  const porDia = dia >= 29 ? 'BYMONTHDAY=-1' : `BYMONTHDAY=${dia}`;
  switch (r.frecuencia) {
    case 'ÚNICA': case 'UNICA': return null;
    case 'SEMANAL': return `FREQ=WEEKLY${hasta}`;
    case 'QUINCENAL': return `FREQ=WEEKLY;INTERVAL=2${hasta}`;
    case 'BIMESTRAL': return `FREQ=MONTHLY;INTERVAL=2;${porDia}${hasta}`;
    case 'TRIMESTRAL': return `FREQ=MONTHLY;INTERVAL=3;${porDia}${hasta}`;
    case 'SEMESTRAL': return `FREQ=MONTHLY;INTERVAL=6;${porDia}${hasta}`;
    case 'ANUAL': return `FREQ=YEARLY${hasta}`;
    default: return `FREQ=MONTHLY;${porDia}${hasta}`;
  }
}

export interface OpcionesIcs { incluirMontos: boolean; urlApp?: string; ahora?: Date }

/** Genera el calendario con los pagos fijos activos (y sus próximas fechas). */
export function calendarioPagos(recs: Recurrente[], hoy: string, o: OpcionesIcs): { ics: string; eventos: number } {
  const stamp = (o.ahora ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mis Finanzas//Pagos fijos//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Pagos fijos'];
  let eventos = 0;
  for (const r of recs) {
    if (!r.activo || r.tipo === 'INGRESO') continue;
    const inicio = fechasEntre(r, hoy, addDays(hoy, 400))[0];
    if (!inicio) continue;
    const monto = o.incluirMontos && r.montoEstimado ? ` · ${dinero(r.montoEstimado, r.moneda)}` : '';
    const antes = Math.max(0, Math.min(30, Math.round(r.avisarDiasAntes)));
    const rr = regla(r, inicio);
    L.push('BEGIN:VEVENT', `UID:${r.id.replace(/[^A-Za-z0-9-]/g, '')}@mis-finanzas`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fecha(inicio)}`, `DTEND;VALUE=DATE:${fecha(addDays(inicio, 1))}`,
      ...(rr ? [`RRULE:${rr}`] : []),
      `SUMMARY:${esc(`Pago: ${r.descripcion}${monto}`)}`,
      `DESCRIPTION:${esc(`Pago fijo de Mis Finanzas. Al pagarlo, regístralo en la app.${o.urlApp ? `\n${o.urlApp}` : ''}`)}`,
      'TRANSP:TRANSPARENT');
    // Aviso N días antes a las 9:00 (el evento empieza a las 00:00) y otro el mismo día a las 9:00.
    if (antes > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Pago en ${antes} día(s): ${r.descripcion}`)}`, `TRIGGER:-PT${antes * 24 - 9}H`, 'END:VALARM');
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Hoy vence: ${r.descripcion}`)}`, 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
    eventos++;
  }
  L.push('END:VCALENDAR');
  return { ics: L.map(plegar).join('\r\n') + '\r\n', eventos };
}
