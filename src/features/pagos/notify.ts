/**
 * Avisos de pagos fijos en el dispositivo.
 * - Al abrir o volver a la app: muestra un aviso (una vez al día) con los pagos próximos y vencidos.
 * - Pone el número de pagos pendientes en el ícono de la app (iPhone/Android/computadora, si se admite).
 * Con la app cerrada, los avisos los da el calendario del teléfono (ver Calendario.tsx): sin servidores.
 */
import type { Ocurrencia } from '../../domain/recurring';
import { todayIso } from '../../domain/dates';

const KEY = 'finanzas.notify.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { on?: boolean; last?: string }; } catch { return {}; } };
const write = (v: { on?: boolean; last?: string }) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch { /* sin almacenamiento */ } };

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
export const notificationsEnabled = () => notificationsSupported() && Notification.permission === 'granted' && !!read().on;

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const p = await Notification.requestPermission();
  write({ on: p === 'granted' });
  return p === 'granted';
}

export async function updateBadgeAndNotify(pendientes: Ocurrencia[]) {
  const n = pendientes.length;
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try { if (n > 0) await nav.setAppBadge?.(n); else await nav.clearAppBadge?.(); } catch { /* no admitido */ }
  if (n === 0 || !notificationsEnabled()) return;
  const hoy = todayIso();
  if (read().last === hoy) return; // un aviso por día como máximo
  const vencidos = pendientes.filter((o) => o.estado === 'VENCIDO').length;
  // Sin montos ni cuentas en el aviso: puede verse en la pantalla bloqueada.
  const body = vencidos > 0 ? `${vencidos} vencido(s) y ${n - vencidos} próximo(s). Abre la app para revisarlos.` : `${n} pago(s) fijo(s) próximos. Abre la app para revisarlos.`;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Mis Finanzas · Pagos fijos', { body, tag: 'pagos-fijos', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    write({ last: hoy });
  } catch { /* el navegador no permitió el aviso */ }
}

/**
 * Aviso de presupuestos: al llegar al 80 % y al pasar el 100 %, una sola vez por presupuesto, mes y nivel.
 * Sin montos (puede verse en la pantalla bloqueada): solo el nombre de la categoría y el porcentaje.
 * Funciona al abrir la app: el gasto se registra en la app, así que el aviso llega justo después de anotar.
 */
const KEY_PRE = 'finanzas.notify.presupuestos.v1';
export async function avisarPresupuestos(items: { id: string; nombre: string; pct: number; estado: 'ok' | 'alerta' | 'excedido' }[], mes: string): Promise<string[]> {
  let vistos: Record<string, true> = {};
  try { vistos = JSON.parse(localStorage.getItem(KEY_PRE) ?? '{}'); } catch { /* nada */ }
  const nuevos = items.filter((a) => a.estado !== 'ok' && !vistos[`${mes}|${a.id}|${a.estado}`]);
  if (nuevos.length === 0) return [];
  const textos = nuevos.map((a) => (a.estado === 'excedido' ? `${a.nombre}: pasaste tu presupuesto (${Math.round(a.pct * 100)} %)` : `${a.nombre}: llegaste al ${Math.round(a.pct * 100)} % de tu presupuesto`));
  for (const a of nuevos) vistos[`${mes}|${a.id}|${a.estado}`] = true;
  // Se guardan solo las claves del mes actual (no crece sin fin).
  try { localStorage.setItem(KEY_PRE, JSON.stringify(Object.fromEntries(Object.entries(vistos).filter(([k]) => k.startsWith(mes))))); } catch { /* nada */ }
  if (notificationsEnabled()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Mis Finanzas · Presupuesto', { body: textos.join('\n'), tag: `presupuesto-${mes}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    } catch { /* no permitido */ }
  }
  return textos;
}
