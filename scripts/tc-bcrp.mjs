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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let formato = null; // el primer formato de URL que funcione se usa para el resto

async function bajar(desde, hasta) {
  const base = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${SERIE}/json`;
  const variantes = formato ? [formato] : [
    (a, b) => `${base}/${a}/${b}/esp`,
    (a, b) => `${base}/${a}/${b}`,
    (a, b) => `${base}/${a.replace(/-0?/g, '-')}/${b.replace(/-0?/g, '-')}/esp`,
  ];
  let ultimo = '';
  for (const v of variantes) {
    const url = v(desde, hasta);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'es-PE,es;q=0.9' }, signal: AbortSignal.timeout(30000) });
    const txt = (await r.text()).trim();
    if (r.ok && txt.startsWith('{')) { formato = v; return parsear(JSON.parse(txt)); }
    ultimo = `${r.status} ${r.headers.get('content-type')} ${url} → ${txt.slice(0, 160).replace(/\s+/g, ' ')}`;
    console.warn(`  intento fallido: ${ultimo}`);
  }
  throw new Error(ultimo);
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const hoy = new Date().toISOString().slice(0, 10);
  const porFecha = new Map();
  const agregar = (xs) => { for (const [f, v] of xs) porFecha.set(f, v); };
  // 1) Todo en una sola consulta (menos pedidos = menos bloqueos del antibots del BCRP).
  try { agregar(await bajar('2015-01-01', hoy)); } catch (e) { console.warn(`Consulta única falló: ${e.message.slice(0, 120)}`); }
  // 2) Si no alcanzó, año por año con pausas y reintentos; se guarda lo que llegue.
  if (porFecha.size < 2000) {
    for (let y = 2015; y <= +hoy.slice(0, 4); y++) {
      for (let intento = 0; intento < 3; intento++) {
        try { agregar(await bajar(`${y}-01-01`, `${y}-12-31`)); break; }
        catch (e) { console.warn(`${y} intento ${intento + 1}: ${e.message.slice(0, 80)}`); await pausa(8000 * (intento + 1)); }
      }
      await pausa(2500);
    }
  }
  let datos = [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`BCRP: ${datos.length} días (${datos[0]?.[0] ?? '—'} → ${datos.at(-1)?.[0] ?? '—'})`);
  // 3) Completar con la serie ya publicada (días que el BCRP no entregó esta vez).
  if (PUBLICADO) {
    try { const r = await fetch(PUBLICADO); if (r.ok) { const j = await r.json(); if (Array.isArray(j.datos)) { const m = new Map(j.datos); for (const [f, v] of datos) m.set(f, v); const antes = datos.length; datos = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); console.log(`Serie publicada: +${datos.length - antes} días.`); } } } catch { /* nada */ }
  }
  await mkdir('public/tc', { recursive: true });
  await writeFile(OUT, JSON.stringify({ fuente: 'BCRP PD04640PD (venta, S/ por US$)', actualizado: hoy, datos }));
  console.log(`Escrito ${OUT}: ${datos.length} días.`);
  const m = new Map(datos);
  console.log('Muestra:', ['2018-01-02', '2020-03-16', '2024-09-03', datos.at(-1)?.[0]].map((f) => `${f}=${m.get(f) ?? '—'}`).join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
