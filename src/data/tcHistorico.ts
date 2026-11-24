/** Carga la serie histórica de tipo de cambio publicada con la app (pública, sin datos personales). */
import { leerSerie, serieVacia, type SerieTc } from '../domain/tc';

let serie: SerieTc = serieVacia();
let promesa: Promise<SerieTc> | null = null;

export const serieUsd = () => serie;

export function cargarTcHistorico(): Promise<SerieTc> {
  promesa ??= fetch(`${import.meta.env.BASE_URL}tc/usd.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { serie = leerSerie(j); return serie; })
    .catch(() => serie);
  return promesa;
}
