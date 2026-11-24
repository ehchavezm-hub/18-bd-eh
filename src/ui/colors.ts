/**
 * Color e ícono de cada grupo de categorías.
 * Si en la hoja (4.CATEGORIAS) el grupo tiene COLOR o ICONO, se usan esos; si no, estos por defecto.
 * El color nunca va solo: siempre lo acompaña el ícono y el nombre.
 */
export interface Estilo { color: string; icono: string }

const GRUPOS: Record<string, Estilo> = {
  'G-ALI': { color: '#eb6834', icono: '🍽' },
  'G-TRA': { color: '#2a78d6', icono: '🚕' },
  'G-VIV': { color: '#1baf7a', icono: '🏠' },
  'G-SAL': { color: '#e87ba4', icono: '🩺' },
  'G-EDU': { color: '#6250d6', icono: '🎓' },
  'G-OCI': { color: '#d6409f', icono: '🎬' },
  'G-COM': { color: '#eda100', icono: '🛍' },
  'G-FAM': { color: '#008300', icono: '👪' },
  'G-OTR': { color: '#7a8194', icono: '•' },
  'G-IMP': { color: '#e34948', icono: '🏛' },
  'G-FIN': { color: '#8a6d3b', icono: '%' },
  'G-INV': { color: '#256abf', icono: '📈' },
  'G-ING': { color: '#0ca30c', icono: '＋' },
};
const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export const TRANSFERENCIA: Estilo = { color: '#7a8194', icono: '⇄' };

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function estiloGrupo(id: string | null | undefined, propio?: { color?: string | null; icono?: string | null }): Estilo {
  const base = (id && GRUPOS[id]) || { color: PALETA[hash(id ?? '') % PALETA.length], icono: (id ?? '?').replace(/^G-/, '').charAt(0) };
  return { color: propio?.color || base.color, icono: propio?.icono || base.icono };
}

/** Color estable para una institución (banco), a partir de su ID. */
export const colorInstitucion = (id: string) => PALETA[hash(id) % PALETA.length];
