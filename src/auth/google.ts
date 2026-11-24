/**
 * Acceso con Google (Google Identity Services, flujo de token en el navegador).
 * El token vive solo en memoria de este teléfono y dura ~1 hora; se renueva solo.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
].join(' ');

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken(opts?: { prompt?: string }): void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: unknown) => void }): TokenClient;
      revoke(token: string, done?: () => void): void;
    } } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el acceso de Google. Revisa tu internet.'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let token: { value: string; expiresAt: number } | null = null;
let client: TokenClient | null = null;
let pending: ((r: TokenResponse) => void) | null = null;

async function ensureClient(clientId: string) {
  await loadScript();
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (r) => pending?.(r),
    error_callback: () => pending?.({ error: 'popup_closed' }),
  });
}

function request(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    pending = (r) => {
      pending = null;
      if (r.error || !r.access_token) return reject(new Error(r.error === 'popup_closed' ? 'Se cerró la ventana de Google.' : 'Google no autorizó el acceso.'));
      token = { value: r.access_token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 120) * 1000 };
      resolve(r.access_token);
    };
    client!.requestAccessToken({ prompt });
  });
}

/** Inicia sesión mostrando la ventana de Google (primera vez o tras cerrar sesión). */
export async function signIn(clientId: string): Promise<string> {
  await ensureClient(clientId);
  return request('consent');
}

/** Devuelve un token válido; lo renueva sin ventana si es posible. */
export async function getToken(clientId: string): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  await ensureClient(clientId);
  return request('');
}

export function hasToken() {
  return !!token && Date.now() < token.expiresAt;
}

export async function signOut() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value);
  token = null;
}

export async function getEmail(clientId: string): Promise<string | null> {
  const t = await getToken(clientId);
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { email?: string }).email ?? null;
}
