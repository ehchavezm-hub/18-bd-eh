/**
 * Bóveda: cifra la copia local de tus datos (IndexedDB) con AES-GCM de 256 bits.
 *
 * - La clave de datos es aleatoria y nunca se guarda en claro.
 * - Se guarda "envuelta" (cifrada) con una clave derivada del PIN (PBKDF2-SHA256, 310 000 iteraciones)
 *   y, si el dispositivo lo permite, con una clave que entrega Face ID / huella / Windows Hello
 *   (extensión WebAuthn PRF). Así se abre con biometría sin escribir el PIN.
 * - Mientras la app está abierta la clave vive solo en memoria. Al cerrar la app se pierde:
 *   quien copie el almacenamiento del navegador ve solo texto cifrado.
 */
import { loadSettings, saveSettings } from '../config/settings';

export const b64 = {
  enc(buf: ArrayBuffer | Uint8Array) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  },
  dec(str: string) {
    const s = atob(str);
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

export interface VaultConfig {
  v: 1;
  salt: string;        // sal del PIN
  pin: string;         // clave de datos envuelta con la clave del PIN
  prfSalt: string;     // sal que se envía a la biometría (PRF)
  prf?: string;        // clave de datos envuelta con la clave de la biometría
  iter?: number;       // iteraciones PBKDF2 del PIN (ausente = 310 000, bóvedas antiguas)
}

let dataKey: CryptoKey | null = null;
let crudo: Uint8Array | null = null; // solo en memoria, para poder agregar la envoltura biométrica

// OWASP 2023: 600 000 iteraciones para PBKDF2-SHA256. Las bóvedas antiguas (310 000) se reenvuelven solas al abrir con PIN.
const ITER = 600_000;
const ITER_ANTIGUO = 310_000;
const aesKey = (raw: BufferSource, usos: KeyUsage[], extraible = false) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extraible, usos);

async function clavePin(pin: string, salt: Uint8Array, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function clavePrf(prf: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('finanzas-vault-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function sellar(k: CryptoKey, datos: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, datos));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64.enc(out);
}
async function abrir(k: CryptoKey, sellado: string) {
  const all = b64.dec(sellado);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, k, all.slice(12)));
}

const config = () => loadSettings().vault as VaultConfig | undefined;
export const vaultConfigurado = () => !!config();
export const vaultAbierto = () => !!dataKey;
export const prfSalt = () => config()?.prfSalt ?? null;
export const tieneEnvolturaBiometrica = () => !!config()?.prf;

async function activar(raw: Uint8Array) {
  dataKey = await aesKey(raw, ['encrypt', 'decrypt']);
  crudo = raw;
}

/** Crea la bóveda con una clave nueva protegida por el PIN. */
export async function crearVault(pin: string): Promise<void> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cfg: VaultConfig = { v: 1, salt: b64.enc(salt), pin: await sellar(await clavePin(pin, salt), raw), iter: ITER, prfSalt: b64.enc(crypto.getRandomValues(new Uint8Array(32))) };
  saveSettings({ vault: cfg });
  await activar(raw);
}

/** Abre la bóveda con el PIN (la crea si aún no existe: migración desde versiones sin cifrado). */
export async function abrirConPin(pin: string): Promise<boolean> {
  const cfg = config();
  if (!cfg) { await crearVault(pin); return true; }
  try { await activar(await abrir(await clavePin(pin, b64.dec(cfg.salt), cfg.iter ?? ITER_ANTIGUO), cfg.pin)); } catch { return false; }
  if ((cfg.iter ?? ITER_ANTIGUO) < ITER) await recifrarConPin(pin); // refuerzo automático
  return true;
}

/** Abre la bóveda con el secreto que entrega la biometría (PRF). */
export async function abrirConPrf(prf: ArrayBuffer): Promise<boolean> {
  const cfg = config();
  if (!cfg?.prf) return false;
  try { await activar(await abrir(await clavePrf(prf), cfg.prf)); return true; } catch { return false; }
}

/** Agrega la envoltura biométrica (para abrir con Face ID sin PIN en el futuro). */
export async function agregarPrf(prf: ArrayBuffer): Promise<void> {
  const cfg = config();
  if (!cfg || !crudo) return;
  saveSettings({ vault: { ...cfg, prf: await sellar(await clavePrf(prf), crudo) } });
}

/** Cambia el PIN que protege la clave (la clave de datos no cambia). */
export async function recifrarConPin(pin: string): Promise<void> {
  const cfg = config();
  if (!cfg || !crudo) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  saveSettings({ vault: { ...cfg, salt: b64.enc(salt), iter: ITER, pin: await sellar(await clavePin(pin, salt), crudo) } });
}

/** Olvida la clave de la memoria (por ejemplo, al borrar todo). */
export function cerrarVault() { dataKey = null; crudo = null; }

export async function cifrar(obj: unknown): Promise<string> {
  if (!dataKey) throw new Error('La bóveda está cerrada.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64.enc(out);
}

export async function descifrar<T>(sellado: string): Promise<T> {
  if (!dataKey) throw new Error('La bóveda está cerrada.');
  const all = b64.dec(sellado);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, dataKey, all.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
