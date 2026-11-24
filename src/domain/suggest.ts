import type { Movimiento, Regla } from './model';

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface Sugerencia {
  categoriaId: string | null;
  centroId: string | null;
  cuentaId: string | null;
  lugarId: string | null;
  monto: number | null;
  origen: 'historial' | 'regla' | null;
}

/**
 * Sugiere categoría, centro, cuenta y lugar a partir de la descripción.
 * 1) Si ya registraste esa misma descripción, copia lo del último registro (la app "aprende").
 * 2) Si no, aplica la primera regla cuya palabra aparece en la descripción.
 */
export function sugerir(descripcion: string, movs: Movimiento[], reglas: Regla[]): Sugerencia {
  const vacio: Sugerencia = { categoriaId: null, centroId: null, cuentaId: null, lugarId: null, monto: null, origen: null };
  const d = normalizar(descripcion);
  if (d.length < 2) return vacio;

  let ultimo: Movimiento | null = null;
  for (const m of movs) {
    if (m.eliminado || m.estado === 'ANULADO' || m.tipo === 'TRANSFERENCIA') continue;
    if (normalizar(m.descripcion) === d && (!ultimo || m.fecha > ultimo.fecha)) ultimo = m;
  }
  if (ultimo) {
    return { categoriaId: ultimo.categoriaId, centroId: ultimo.centroId, cuentaId: ultimo.cuentaId, lugarId: ultimo.lugarId, monto: ultimo.monto, origen: 'historial' };
  }
  const regla = reglas
    .filter((r) => r.activa && r.patron && d.includes(normalizar(r.patron)))
    .sort((a, b) => a.prioridad - b.prioridad)[0];
  if (regla) return { ...vacio, categoriaId: regla.categoriaId, centroId: regla.centroId, origen: 'regla' };
  return vacio;
}

/** Descripciones usadas antes que empiezan o contienen lo escrito, las más frecuentes primero. */
export function autocompletar(texto: string, movs: Movimiento[], max = 6): string[] {
  const t = normalizar(texto);
  if (t.length < 2) return [];
  const freq = new Map<string, { text: string; n: number; ultima: string }>();
  for (const m of movs) {
    if (m.eliminado || !m.descripcion) continue;
    const k = normalizar(m.descripcion);
    if (!k.includes(t) || k === t) continue;
    const f = freq.get(k);
    if (f) { f.n += 1; if (m.fecha > f.ultima) { f.ultima = m.fecha; f.text = m.descripcion; } }
    else freq.set(k, { text: m.descripcion, n: 1, ultima: m.fecha });
  }
  return [...freq.entries()]
    .sort(([ka, a], [kb, b]) => Number(kb.startsWith(t)) - Number(ka.startsWith(t)) || b.n - a.n || b.ultima.localeCompare(a.ultima))
    .slice(0, max)
    .map(([, v]) => v.text);
}

/** Cuentas ordenadas por uso en los últimos movimientos (las más usadas primero). */
export function cuentasFrecuentes(movs: Movimiento[], ultimos = 300): string[] {
  const n = new Map<string, number>();
  const recientes = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, ultimos);
  for (const m of recientes) n.set(m.cuentaId, (n.get(m.cuentaId) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
