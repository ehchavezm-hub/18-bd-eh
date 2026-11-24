/**
 * Avisos de pagos fijos en el dispositivo.
 * - Al abrir o volver a la app: muestra un aviso (una vez al día) con los pagos próximos y vencidos.
 * - Pone el número de pagos pendientes en el ícono de la app (iPhone/Android/computadora, si se admite).
 * Los avisos con la app cerrada requieren un servidor de notificaciones (Firebase), previsto en una etapa posterior.
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
