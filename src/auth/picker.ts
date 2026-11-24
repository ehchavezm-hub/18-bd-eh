/**
 * Selector de archivos de Google Drive (Google Picker).
 * Con el permiso mínimo `drive.file`, la app solo puede abrir los archivos
 * que el propietario elige aquí; no ve ningún otro archivo de su Drive.
 */
import { GOOGLE_API_KEY, GOOGLE_APP_ID } from '../config/settings';

interface PickerDoc { id: string; name: string; mimeType: string }
interface PickerResult { action: string; docs?: PickerDoc[] }
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { gapi?: any; google?: any }
}

let gapiPromise: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  gapiPromise ??= new Promise((resolve, reject) => {
    const done = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('No se pudo cargar el selector de Drive.')) });
    if (window.gapi) return done();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('No se pudo cargar el selector de Drive. Revisa tu internet.'));
    document.head.appendChild(s);
  });
  return gapiPromise;
}

export const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/** Abre el selector y devuelve la hoja elegida, o null si el usuario cancela. */
export async function pickSpreadsheet(accessToken: string): Promise<{ id: string; name: string } | null> {
  await loadPicker();
  const g = window.google;
  return new Promise((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.SPREADSHEETS).setMimeTypes(SHEETS_MIME).setMode(g.picker.DocsViewMode.LIST);
    const picker = new g.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .addView(view)
      .setLocale('es')
      .setTitle('Elige tu base de datos de finanzas')
      .setCallback((r: PickerResult) => {
        if (r.action === g.picker.Action.PICKED && r.docs?.[0]) resolve({ id: r.docs[0].id, name: r.docs[0].name });
        else if (r.action === g.picker.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}
