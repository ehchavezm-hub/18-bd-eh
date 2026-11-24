/**
 * Bloqueo local de la app: Face ID / huella (WebAuthn) o PIN.
 * Protege la app abierta en el teléfono; el acceso a los datos sigue
 * dependiendo de la cuenta de Google.
 */
import { loadSettings, saveSettings } from '../config/settings';

const b64u = {
  enc(buf: ArrayBuffer | Uint8Array) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str: string) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enrollBiometric(): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Mis Finanzas', id: location.hostname },
      user: { id: random(16), name: 'propietario', displayName: 'Propietario' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No se pudo activar Face ID / huella.');
  saveSettings({ lockMethod: 'webauthn', webauthnCredentialId: b64u.enc(cred.rawId) });
}

export async function verifyBiometric(): Promise<boolean> {
  const id = loadSettings().webauthnCredentialId;
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: b64u.dec(id) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64u.dec(saltB64), iterations: 150_000, hash: 'SHA-256' }, key, 256);
  return b64u.enc(bits);
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('El PIN debe tener de 4 a 6 números.');
  const salt = b64u.enc(random(16));
  saveSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt), lockMethod: loadSettings().lockMethod ?? 'pin' });
}

const INTENTOS = 'finanzas.pin.intentos.v1';
interface Intentos { fallos: number; bloqueadoHasta: number }
const leerIntentos = (): Intentos => { try { return JSON.parse(localStorage.getItem(INTENTOS) ?? '') as Intentos; } catch { return { fallos: 0, bloqueadoHasta: 0 }; } };
const guardarIntentos = (i: Intentos) => { try { localStorage.setItem(INTENTOS, JSON.stringify(i)); } catch { /* sin almacenamiento */ } };

/** Segundos que faltan para poder volver a intentar el PIN (0 = se puede). */
export const esperaPin = (ahora = Date.now()) => Math.max(0, Math.ceil((leerIntentos().bloqueadoHasta - ahora) / 1000));

/**
 * Verifica el PIN con límite de intentos: tras 5 fallos seguidos espera 30 s,
 * y la espera se duplica con cada fallo adicional (máximo 1 hora).
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const { pinHash, pinSalt } = loadSettings();
  if (!pinHash || !pinSalt || esperaPin() > 0) return false;
  const ok = (await hashPin(pin, pinSalt)) === pinHash;
  const i = leerIntentos();
  if (ok) { guardarIntentos({ fallos: 0, bloqueadoHasta: 0 }); return true; }
  const fallos = (i.fallos ?? 0) + 1;
  const espera = fallos >= 5 ? Math.min(3600, 30 * 2 ** (fallos - 5)) : 0;
  guardarIntentos({ fallos, bloqueadoHasta: espera ? Date.now() + espera * 1000 : 0 });
  return false;
}

export const lockConfigured = () => {
  const s = loadSettings();
  return !!(s.webauthnCredentialId || s.pinHash);
};
