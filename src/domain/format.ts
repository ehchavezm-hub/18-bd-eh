const SIMBOLO: Record<string, string> = { PEN: 'S/', USD: 'US$', EUR: '€', GBP: '£' };

export const simbolo = (moneda: string) => SIMBOLO[moneda] ?? moneda;

const nf2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

export function dinero(v: number, moneda = 'PEN', decimales = true): string {
  const s = (decimales ? nf2 : nf0).format(Math.abs(v));
  // Espacio no separable: el símbolo nunca queda en otra línea que el número.
  return `${v < 0 ? '−' : ''}${simbolo(moneda)}\u00a0${s}`;
}

export const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${nf0.format(v / 1000)} mil` : nf0.format(v));

/** Convierte lo escrito por el usuario ("1.234,50", "1234.5", "1,234.50") a número. */
export function parseMonto(txt: string): number | null {
  const s = txt.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  let norm: string;
  if (lastComma > -1 && lastDot > -1) norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastComma > -1) norm = /,\d{1,2}$/.test(s) ? s.replace(/,/g, '.') : s.replace(/,/g, '');
  else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
