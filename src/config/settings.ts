/** Ajustes guardados solo en este teléfono (no son secretos ni datos financieros). */
const KEY = 'finanzas.settings.v1';

export interface Settings {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  lockMethod?: 'webauthn' | 'pin';
  webauthnCredentialId?: string;
  pinHash?: string;
  pinSalt?: string;
  /** Minutos sin usar la app antes de pedir Face ID / PIN otra vez. */
  lockAfterMinutes?: number;
}

export function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible: se pedirá de nuevo */
  }
  return next;
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}

export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
