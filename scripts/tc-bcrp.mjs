// Descarga la serie diaria de tipo de cambio venta (S/ por US$) del BCRP y la guarda en public/tc/usd.json.
// Se ejecuta en GitHub Actions al publicar. Si el BCRP no responde, reutiliza la versión ya publicada; nunca rompe la publicación.
import { mkdir, writeFile } from 'node:fs/promises';

const SERIE = 'PD04640PD'; // TC sistema bancario SBS, venta
const MESES = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Set: 9, Oct: 10, Nov: 11, Dic: 12 };
const OUT = 'public/tc/usd.json';
const PUBLICADO = process.env.TC_PUBLICADO_URL; // p. ej. https://usuario.github.io/18-bd-eh/tc/usd.json

export function parsear(json) {
  const out = [];
  for (const p of json?.periods ?? []) {
    const m = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(p.name ?? '');
    const v = Number(String(p.values?.[0] ?? '').replace(',', '.'));
    if (!m || !MESES[m[2]] || !Number.isFinite(v) || v <= 0) continue;
    out.push([`20${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1]}`, Math.round(v * 10000) / 10000]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

async function bajar(desde, hasta) {
  const url = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${SERIE}/json/${desde}/${hasta}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (finanzas-pwa build)', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`BCRP ${r.status}`);
  return parsear(JSON.parse((await r.text()).trim()));
}

async function main() {
  const hoy = new Date().toISOString().slice(0, 10);
  let datos = [];
  try {
    for (let y = 2015; y <= +hoy.slice(0, 4); y++) datos.push(...(await bajar(`${y}-01-01`, `${y}-12-31`)));
    console.log(`BCRP: ${datos.length} días (${datos[0]?.[0]} → ${datos.at(-1)?.[0]})`);
  } catch (e) {
    console.warn(`BCRP no respondió (${e.message}).`);
    datos = [];
  }
  if (datos.length < 200 && PUBLICADO) {
    try { const r = await fetch(PUBLICADO); if (r.ok) { const j = await r.json(); if (Array.isArray(j.datos) && j.datos.length > datos.length) { datos = j.datos; console.log(`Se reutiliza la serie publicada (${datos.length} días).`); } } } catch { /* nada */ }
  }
  await mkdir('public/tc', { recursive: true });
  await writeFile(OUT, JSON.stringify({ fuente: 'BCRP PD04640PD (venta, S/ por US$)', actualizado: hoy, datos }));
  console.log(`Escrito ${OUT}: ${datos.length} días.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
