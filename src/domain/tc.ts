/**
 * Serie histórica de tipo de cambio (S/ por US$), venta, sistema bancario SBS — fuente: BCRP (serie PD04640PD).
 * Es información pública: se descarga al publicar la app (no sale ningún dato tuyo).
 */
export interface SerieTc { fechas: string[]; valores: number[] }

export const serieVacia = (): SerieTc => ({ fechas: [], valores: [] });

/** Valida y ordena el archivo publicado { datos: [["AAAA-MM-DD", 3.75], ...] }. */
export function leerSerie(json: unknown): SerieTc {
  const datos = (json as { datos?: unknown })?.datos;
  if (!Array.isArray(datos)) return serieVacia();
  const pares = datos
    .filter((d): d is [string, number] => Array.isArray(d) && /^\d{4}-\d{2}-\d{2}$/.test(String(d[0])) && typeof d[1] === 'number' && d[1] > 0.5 && d[1] < 20)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return { fechas: pares.map((p) => p[0]), valores: pares.map((p) => p[1]) };
}

/** Último valor en o antes de la fecha (fines de semana y feriados usan el día hábil anterior). Máximo 10 días atrás. */
export function valorEn(s: SerieTc, fecha: string): number | null {
  let lo = 0, hi = s.fechas.length - 1, idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (s.fechas[mid] <= fecha) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx < 0) return null;
  const dias = (Date.parse(fecha) - Date.parse(s.fechas[idx])) / 86_400_000;
  return dias <= 10 ? s.valores[idx] : null;
}
