/**
 * "Tu gasto en series de Fourier": descompone el gasto mensual en ciclos (anual, semestral,
 * cuatrimestral…). Cada ciclo es un círculo que gira; la suma de los círculos dibuja una onda que
 * reconstruye el gasto real (puntos). Con más círculos la reconstrucción es más fiel.
 * Canvas puro, sin librerías. Se detiene fuera de pantalla y respeta "reducir movimiento".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { dinero } from '../domain/format';
import { monthShort } from '../domain/dates';

export interface Ciclo { k: number; amp: number; fase: number; periodo: number; color: string }

const COLORES = ['#ffd966', '#eb6834', '#1baf7a', '#e87ba4', '#6da7ec', '#c9a7ff', '#7fd4ff', '#ff9f80'];

/** Serie de Fourier real de una serie mensual: media + ciclos ordenados por amplitud. */
export function ciclos(valores: number[]) {
  const N = valores.length;
  const media = valores.reduce((a, b) => a + b, 0) / Math.max(1, N);
  const out: Ciclo[] = [];
  for (let k = 1; k <= Math.floor(N / 2); k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) { const a = (2 * Math.PI * k * n) / N; re += valores[n] * Math.cos(a); im -= valores[n] * Math.sin(a); }
    const nyq = N % 2 === 0 && k === N / 2;
    const amp = ((nyq ? 1 : 2) * Math.hypot(re, im)) / N;
    out.push({ k, amp, fase: Math.atan2(im, re), periodo: N / k, color: '' });
  }
  out.sort((a, b) => b.amp - a.amp);
  out.forEach((c, i) => (c.color = COLORES[i % COLORES.length]));
  return { media, ciclos: out };
}

/** Valor de la serie reconstruida con los ciclos dados en el tiempo t (en meses, puede ser fraccionario). */
export const reconstruir = (media: number, cs: Ciclo[], N: number, t: number) =>
  media + cs.reduce((s, c) => s + c.amp * Math.cos((2 * Math.PI * c.k * t) / N + c.fase), 0);

const nombreCiclo = (p: number) => {
  const r = Math.round(p * 10) / 10;
  if (Math.abs(r - 12) < 0.3) return 'Ciclo anual (12 meses)';
  if (Math.abs(r - 6) < 0.3) return 'Ciclo semestral (6 meses)';
  if (Math.abs(r - 3) < 0.3) return 'Ciclo trimestral (3 meses)';
  if (Math.abs(r - 2) < 0.2) return 'Ciclo bimestral (2 meses)';
  return `Ciclo de ${r.toLocaleString('es-PE')} meses`;
};

export function FourierCard({ meses, valores }: { meses: string[]; valores: number[] }) {
  const [n, setN] = useState(3);
  // Pausa elegida por la persona (se recuerda). Con «Reducir movimiento» del iPhone gira más lento, pero gira.
  const [pausa, setPausa] = useState(() => { try { return localStorage.getItem('finanzas.fourierPausa') === '1'; } catch { return false; } });
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => ciclos(valores), [valores]);
  const usados = data.ciclos.slice(0, n);
  const N = valores.length;
  const error = useMemo(() => {
    if (N === 0) return 0;
    const e = valores.reduce((s, v, i) => s + Math.abs(v - reconstruir(data.media, usados, N, i)), 0) / N;
    return Math.round((1 - e / Math.max(1, data.media)) * 100);
  }, [valores, data, usados, N]);

  useEffect(() => {
    const canvas = ref.current; const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || N < 4) return;
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, t = 0, antes = 0;
    // Una vuelta completa: ~9 s (18 s con «Reducir movimiento»). Basado en el tiempo, no en cuadros: igual de fluido a 30 o 120 Hz.
    const vel = (N - 1) / (reducir ? 18_000 : 9_000);
    // Escala ajustada al rango real (no desde cero): círculos y onda se ven grandes.
    const recon = Array.from({ length: 161 }, (_, s2) => reconstruir(data.media, usados, N, (s2 / 160) * (N - 1)));
    const alcance = usados.reduce((s2, c) => s2 + c.amp, 0);
    const hi = Math.max(...valores, ...recon, data.media + alcance), lo = Math.min(...valores, ...recon, data.media - alcance);
    const pad = (hi - lo) * 0.08, max = hi + pad, min = Math.max(0, lo - pad);
    const medir = () => { const r = canvas.getBoundingClientRect(); w = r.width; h = r.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };

    const dibujar = () => {
      ctx.clearRect(0, 0, w, h);
      const izq = Math.min(w * 0.4, h * 1.1);            // zona de los círculos
      const top = 18, bottom = h - 26, alto = bottom - top;
      const y = (v: number) => bottom - ((v - min) / (max - min)) * alto;  // misma escala vertical para círculos y onda
      const escala = alto / (max - min);
      const x0 = w * 0.04 + izq * 0.5;                     // centro de los círculos
      const xw0 = izq + w * 0.08, xw1 = w - 12;            // zona de la onda
      const xt = (i: number) => xw0 + (i / (N - 1)) * (xw1 - xw0);

      // guías
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
      for (const g of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(xw0, top + g * alto); ctx.lineTo(xw1, top + g * alto); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(dinero(max, 'PEN', false), xw1, top - 4);
      ctx.fillText(dinero(min, 'PEN', false), xw1, bottom - 5);
      [0, Math.floor((N - 1) / 2), N - 1].forEach((i, j) => { ctx.textAlign = j === 0 ? 'left' : j === 2 ? 'right' : 'center'; ctx.fillText(monthShort(meses[i]), xt(i), h - 8); });

      // media (línea base)
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x0 - izq * 0.45, y(data.media)); ctx.lineTo(xw1, y(data.media)); ctx.stroke(); ctx.setLineDash([]);

      // círculos (epiciclos): el centro baja la media; cada círculo suma su ciclo
      const tt = pausa ? N - 1 : t;
      let cx = x0, cy = y(data.media);
      for (const c of usados) {
        const r = c.amp * escala;
        const ang = (2 * Math.PI * c.k * tt) / N + c.fase;
        const nx = cx + r * Math.sin(ang), ny = cy - r * Math.cos(ang);
        ctx.strokeStyle = c.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
        cx = nx; cy = ny;
      }
      // onda reconstruida
      ctx.strokeStyle = '#ffd966'; ctx.lineWidth = 2.6; ctx.beginPath();
      const pasos = 160;
      for (let s = 0; s <= pasos; s++) { const ti = (s / pasos) * (N - 1); const yy = y(reconstruir(data.media, usados, N, ti)); if (s) ctx.lineTo(xw0 + (ti / (N - 1)) * (xw1 - xw0), yy); else ctx.moveTo(xw0, yy); }
      ctx.stroke();
      // gasto real
      valores.forEach((v, i) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(xt(i), y(v), 3.6, 0, Math.PI * 2); ctx.fill(); });
      // conexión punta del último círculo → posición actual en la onda
      const xi = xw0 + (tt / (N - 1)) * (xw1 - xw0);
      ctx.strokeStyle = 'rgba(255,217,102,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(xi, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd966'; ctx.beginPath(); ctx.arc(xi, cy, 5, 0, Math.PI * 2); ctx.fill();
    };

    const cuadro = (ahora: number) => {
      if (antes) t = (t + Math.min(100, ahora - antes) * vel) % (N - 1);
      antes = ahora; dibujar(); raf = requestAnimationFrame(cuadro);
    };
    const iniciar = () => { cancelAnimationFrame(raf); antes = 0; medir(); if (pausa) dibujar(); else raf = requestAnimationFrame(cuadro); };
    const vis = () => (document.visibilityState === 'visible' ? iniciar() : cancelAnimationFrame(raf));
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? iniciar() : cancelAnimationFrame(raf)));
    const ro = new ResizeObserver(() => iniciar());
    io.observe(canvas); ro.observe(canvas); document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [valores, meses, data, usados, N, pausa]);

  if (N < 4) return null;
  return (
    <section className="card fourier">
      <div className="fourier-head">
        <div>
          <h2>Tu gasto en series de Fourier</h2>
          <p className="fourier-sub">Cada círculo es un ciclo de tu gasto mensual. Sumados, dibujan la onda dorada que reconstruye tu gasto real (puntos blancos) de {monthShort(meses[0])} a {monthShort(meses[N - 1])}.</p>
        </div>
        <div className="fourier-ctl">
          <button type="button" className="fourier-play" aria-label={pausa ? 'Reproducir animación' : 'Pausar animación'} onClick={() => { const v = !pausa; setPausa(v); try { localStorage.setItem('finanzas.fourierPausa', v ? '1' : '0'); } catch { /* nada */ } }}>{pausa ? '▶' : '❚❚'}</button>
        <div className="fourier-n" role="radiogroup" aria-label="Número de círculos">
          {[3, 5, 8].map((x) => <button key={x} type="button" role="radio" aria-checked={n === x} className={n === x ? 'on' : ''} onClick={() => setN(x)}>{x} círculos</button>)}
        </div>
        </div>
      </div>
      <canvas ref={ref} className="fourier-canvas" role="img" aria-label={`Animación: ${n} círculos reconstruyen el gasto mensual`} />
      <div className="fourier-legend">
        <div className="fl-item"><i style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.6)' }} /><span>Gasto promedio</span><strong>{dinero(data.media, 'PEN', false)}/mes</strong></div>
        {usados.map((c) => (
          <div key={c.k} className="fl-item"><i style={{ background: c.color }} /><span>{nombreCiclo(c.periodo)}</span><strong>± {dinero(c.amp, 'PEN', false)}</strong></div>
        ))}
        <div className="fl-item fl-fit"><span>Con {n} círculos la onda explica ~{Math.max(0, error)} % de tu gasto</span></div>
      </div>
    </section>
  );
}
