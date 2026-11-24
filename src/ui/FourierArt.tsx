/**
 * Arte generativo con series de Fourier (epiciclos).
 * La figura que se dibuja sale de los datos del usuario: el gasto de los últimos meses se
 * convierte en una curva cerrada (polar), se descompone con la transformada discreta de Fourier
 * y los círculos girando la vuelven a trazar.
 * - Sin librerías; un <canvas> liviano.
 * - Se detiene si la app no está visible y respeta "reducir movimiento" (muestra la figura quieta).
 */
import { useEffect, useRef } from 'react';

interface Termino { frec: number; amp: number; fase: number }

/** Curva cerrada a partir de una serie de valores: radio = 0.55 + 0.45·valor normalizado. */
function curva(valores: number[], n = 96): { x: number; y: number }[] {
  const vs = valores.length >= 3 ? valores : [3, 5, 2, 6, 4, 7, 3, 5]; // figura por defecto si no hay datos
  const max = Math.max(...vs), min = Math.min(...vs);
  const norm = vs.map((v) => (max === min ? 0.5 : (v - min) / (max - min)));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    // interpolación suave y cíclica entre los valores
    const t = (i / n) * norm.length;
    const a = Math.floor(t), f = t - a;
    const v0 = norm[a % norm.length], v1 = norm[(a + 1) % norm.length];
    const v = v0 + (v1 - v0) * (0.5 - Math.cos(f * Math.PI) / 2);
    const r = 0.55 + 0.45 * v;
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
  }
  return pts;
}

/** Transformada discreta de Fourier de la curva (números complejos x + iy). */
function dft(pts: { x: number; y: number }[]): Termino[] {
  const N = pts.length, out: Termino[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      re += pts[n].x * Math.cos(phi) + pts[n].y * Math.sin(phi);
      im += -pts[n].x * Math.sin(phi) + pts[n].y * Math.cos(phi);
    }
    re /= N; im /= N;
    out.push({ frec: k > N / 2 ? k - N : k, amp: Math.hypot(re, im), fase: Math.atan2(im, re) });
  }
  return out.sort((a, b) => b.amp - a.amp).slice(0, 28);
}

export function FourierArt({ valores, className }: { valores: number[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clave = valores.map((v) => Math.round(v)).join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const terminos = dft(curva(valores));
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, t = 0;
    const rastro: { x: number; y: number }[] = [];
    const N = 96;

    const medir = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const punto = (tt: number, escala: number, cx: number, cy: number, dibujar: boolean) => {
      let x = cx, y = cy;
      for (const c of terminos) {
        const px = x, py = y, rad = c.amp * escala, ang = c.frec * tt + c.fase;
        x += rad * Math.cos(ang); y += rad * Math.sin(ang);
        if (dibujar && rad > 0.6) {
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        }
      }
      return { x, y };
    };
    const geometria = () => { const escala = Math.min(w * 0.5, h) * 0.44; return { escala, cx: w - escala * 1.25, cy: h / 2 }; };

    const quieto = () => {
      medir();
      const { escala, cx, cy } = geometria();
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i <= N; i++) { const p = punto((i / N) * Math.PI * 2, escala, cx, cy, false); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
      ctx.stroke();
    };

    // Figura completa tenue ("fantasma") para que se vea desde el primer instante.
    const fantasma = (escala: number, cx: number, cy: number) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]); ctx.beginPath();
      for (let i = 0; i <= N; i++) { const q = punto((i / N) * Math.PI * 2, escala, cx, cy, false); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    const cuadro = () => {
      const { escala, cx, cy } = geometria();
      ctx.clearRect(0, 0, w, h);
      fantasma(escala, cx, cy);
      const p = punto(t, escala, cx, cy, true);
      rastro.unshift(p);
      if (rastro.length > N + 20) rastro.pop();
      ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 1; i < rastro.length; i++) {
        ctx.strokeStyle = `rgba(255,217,102,${0.95 * (1 - i / rastro.length)})`;
        ctx.beginPath(); ctx.moveTo(rastro[i - 1].x, rastro[i - 1].y); ctx.lineTo(rastro[i].x, rastro[i].y); ctx.stroke();
      }
      ctx.fillStyle = '#ffd966'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
      t += (Math.PI * 2) / (N * 2.2);
      raf = requestAnimationFrame(cuadro);
    };

    const iniciar = () => { cancelAnimationFrame(raf); if (reducir) quieto(); else { medir(); raf = requestAnimationFrame(cuadro); } };
    const visibilidad = () => (document.visibilityState === 'visible' ? iniciar() : cancelAnimationFrame(raf));
    const ro = new ResizeObserver(() => { rastro.length = 0; iniciar(); });
    ro.observe(canvas);
    document.addEventListener('visibilitychange', visibilidad);
    iniciar();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', visibilidad); };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
