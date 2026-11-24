/**
 * Fechas. La app trabaja con texto ISO: fecha 'AAAA-MM-DD' y hora 'HH:MM'.
 * Google Sheets entrega fechas como número de serie (días desde 1899-12-30).
 */
const EPOCH = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, '0');

export function serialToIsoDate(serial: number): string {
  const d = new Date(EPOCH + Math.floor(serial) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function serialToTime(serial: number): string {
  const frac = serial - Math.floor(serial);
  const mins = Math.round(frac * 1440) % 1440;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** Convierte lo que venga de la hoja (número de serie o texto) a 'AAAA-MM-DD'. */
export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return serialToIsoDate(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/aaaa (formato de la BD)
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

export function toTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return serialToTime(v);
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad(+m[1])}:${m[2]}` : null;
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function nowTime(now = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Fecha y hora local para CREADO_EN / ACTUALIZADO_EN. */
export function nowStamp(now = new Date()): string {
  return `${todayIso(now)} ${nowTime(now)}:${pad(now.getSeconds())}`;
}

export const monthKey = (iso: string) => iso.slice(0, 7); // 'AAAA-MM'

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const monthShort = (key: string) => `${MESES[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;
export const monthLong = (key: string) => `${MESES_LARGOS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;

export function dayLabel(iso: string, today = todayIso()): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}${y !== +today.slice(0, 4) ? ` ${y}` : ''}`;
}
