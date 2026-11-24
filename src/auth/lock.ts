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

export async function verifyPin(pin: string): Promise<boolean> {
  const { pinHash, pinSalt } = loadSettings();
  if (!pinHash || !pinSalt) return false;
  return (await hashPin(pin, pinSalt)) === pinHash;
}

export const lockConfigured = () => {
  const s = loadSettings();
  return !!(s.webauthnCredentialId || s.pinHash);
};
