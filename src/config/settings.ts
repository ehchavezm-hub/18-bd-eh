/** Ajustes guardados solo en este teléfono (no son secretos ni datos financieros). */
const KEY = 'finanzas.settings.v1';

export interface Settings {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  /** Cuenta de Google vinculada a este teléfono. Otra cuenta no puede entrar. */
  ownerEmail?: string;
  /** ID de la hoja cuya estructura ya se comprobó (evita repetir la comprobación). */
  schemaOk?: string;
  /** Bóveda: clave de datos envuelta con el PIN y la biometría (nunca en claro). */
  vault?: unknown;
  lockMethod?: 'webauthn' | 'pin';
  webauthnCredentialId?: string;
  pinHash?: string;
  pinSalt?: string;
  /** Minutos sin usar la app antes de pedir Face ID / PIN otra vez. */
  lockAfterMinutes?: number;
  /** La persona dijo "Ahora no" a activar Face ID tras entrar con PIN. */
  bioRechazado?: boolean;
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

/** Clave de API restringida (solo Picker API y solo desde la dirección de la app). */
export const GOOGLE_API_KEY: string = (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) ?? '';
/** Número del proyecto de Google Cloud (lo exige el selector de Drive). */
export const GOOGLE_APP_ID: string = (import.meta.env.VITE_GOOGLE_APP_ID as string | undefined) ?? '';
