/**
 * Bloqueo local de la app: Face ID / huella (WebAuthn) o PIN.
 * Protege la app abierta en el teléfono; el acceso a los datos sigue
 * dependiendo de la cuenta de Google.
 */
import { loadSettings, saveSettings } from '../config/settings';
import { abrirConPin, b64 as b64std, crearVault, prfSalt, vaultConfigurado } from './vault';

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
      // PRF: la biometría entrega un secreto que abre la bóveda sin escribir el PIN (si el dispositivo lo admite).
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No se pudo activar Face ID / huella.');
  saveSettings({ lockMethod: 'webauthn', webauthnCredentialId: b64u.enc(cred.rawId) });
}

export interface ResultadoBiometria { ok: boolean; prf: ArrayBuffer | null }

export async function verifyBiometric(): Promise<ResultadoBiometria> {
  const id = loadSettings().webauthnCredentialId;
  if (!id) return { ok: false, prf: null };
  const sal = prfSalt();
  try {
    const res = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: b64u.dec(id) }],
        userVerification: 'required',
        timeout: 60000,
        ...(sal ? { extensions: { prf: { eval: { first: b64std.dec(sal) } } } as AuthenticationExtensionsClientInputs } : {}),
      },
    })) as PublicKeyCredential | null;
    if (!res) return { ok: false, prf: null };
    const ext = res.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
    return { ok: true, prf: ext.prf?.results?.first ?? null };
  } catch {
    return { ok: false, prf: null };
  }
}

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64u.dec(saltB64), iterations: 150_000, hash: 'SHA-256' }, key, 256);
  return b64u.enc(bits);
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);
/** Los PIN nuevos deben tener 6 dígitos (1 000 000 combinaciones en lugar de 10 000). */
export const isValidNewPin = (pin: string) => /^\d{6}$/.test(pin);

/**
 * Crea el PIN. No se guarda ningún hash del PIN: el PIN solo "existe" como la llave que abre la bóveda.
 * Así no hay un atajo más débil (antes: hash con 150 000 iteraciones junto a la bóveda con más).
 */
export async function setPin(pin: string): Promise<void> {
  if (!isValidNewPin(pin)) throw new Error('El PIN debe tener 6 números.');
  await crearVault(pin);
  saveSettings({ pinHash: undefined, pinSalt: undefined, lockMethod: loadSettings().lockMethod ?? 'pin' });
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
  if (esperaPin() > 0) return false;
  const { pinHash, pinSalt } = loadSettings();
  let ok: boolean;
  if (vaultConfigurado()) {
    // El PIN correcto es el que abre la bóveda (AES-GCM autentica: un PIN errado no puede "abrirla" a medias).
    ok = await abrirConPin(pin);
    if (ok && pinHash) saveSettings({ pinHash: undefined, pinSalt: undefined }); // retira el hash antiguo
  } else {
    // Versiones antiguas sin bóveda: se valida el hash y se crea la bóveda.
    if (!pinHash || !pinSalt) return false;
    ok = (await hashPin(pin, pinSalt)) === pinHash && (await abrirConPin(pin));
    if (ok) saveSettings({ pinHash: undefined, pinSalt: undefined });
  }
  const i = leerIntentos();
  if (ok) { guardarIntentos({ fallos: 0, bloqueadoHasta: 0 }); return true; }
  const fallos = (i.fallos ?? 0) + 1;
  const espera = fallos >= 5 ? Math.min(3600, 30 * 2 ** (fallos - 5)) : 0;
  guardarIntentos({ fallos, bloqueadoHasta: espera ? Date.now() + espera * 1000 : 0 });
  return false;
}

export const lockConfigured = () => {
  const s = loadSettings();
  return !!(s.webauthnCredentialId || s.pinHash || s.vault);
};
