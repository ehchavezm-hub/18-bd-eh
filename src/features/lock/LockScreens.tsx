import { useEffect, useState } from 'react';
import { biometricAvailable, enrollBiometric, esperaPin, isValidNewPin, isValidPin, setPin, verifyBiometric, verifyPin } from '../../auth/lock';
import { abrirConPrf, agregarPrf, tieneEnvolturaBiometrica, vaultAbierto } from '../../auth/vault';
import { loadSettings, saveSettings } from '../../config/settings';

/** Primera vez: activar Face ID / huella / Windows Hello y un PIN de 6 dígitos. Crea la bóveda cifrada. */
export function LockSetupScreen({ onDone }: { onDone: () => void }) {
  const [bio, setBio] = useState<boolean | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { biometricAvailable().then(setBio); }, []);

  async function activateBio() {
    setError(null);
    try { await enrollBiometric(); setBioOn(true); } catch { setError('No se pudo activar. Puedes usar solo el PIN.'); }
  }
  async function finish() {
    setError(null);
    try {
      await setPin(pin); // crea la bóveda cifrada protegida por el PIN
      // Si la biometría está activa, pide una vez Face ID / huella para poder abrir la bóveda sin PIN.
      if (bioOn) { const r = await verifyBiometric(); if (r.prf) await agregarPrf(r.prf); }
      onDone();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="screen center">
      <h1>Protege la app</h1>
      <p className="muted">Tus datos guardados en este dispositivo quedan cifrados. Solo se abren con tu biometría o tu PIN.</p>
      {bio && (
        <div className="card stack">
          <h2>Face ID / huella / Windows Hello</h2>
          {bioOn ? <span className="badge ok">Activado</span> : <button className="btn" onClick={activateBio}>Activar Face ID / huella / Windows Hello</button>}
        </div>
      )}
      <div className="card stack">
        <h2>PIN de respaldo</h2>
        <p className="muted">6 números. Evita fechas, 123456 o números repetidos.</p>
        <input className="pin" type="password" inputMode="numeric" maxLength={6} value={pin} autoComplete="new-password"
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} />
        {error && <div className="msg error">{error}</div>}
        <button className="btn" disabled={!isValidNewPin(pin) || /^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)} onClick={finish}>Guardar</button>
      </div>
    </main>
  );
}

/** Activa Face ID / huella y guarda la llave biométrica de la bóveda (la bóveda debe estar abierta). */
export async function activarBiometria(): Promise<'prf' | 'solo-desbloqueo'> {
  await enrollBiometric();
  const r = await verifyBiometric();
  if (r.prf) { await agregarPrf(r.prf); return 'prf'; }
  return 'solo-desbloqueo';
}

/**
 * Desbloqueo: Face ID / huella / Windows Hello primero, PIN como respaldo.
 * Además de desbloquear, abre la bóveda (clave para leer los datos cifrados del dispositivo).
 */
const ES_IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function UnlockScreen({ title, onUnlock, onCancel }: { title: string; onUnlock: () => void; onCancel?: () => void }) {
  const hasBio = !!loadSettings().webauthnCredentialId;
  // Face ID solo se usa si de verdad abre la app: con la llave biométrica guardada (PRF) o con la app aún abierta.
  // Si no, pedir Face ID y luego el PIN serían pasos de más: se va directo al PIN.
  const bioUtil = hasBio && (vaultAbierto() || tieneEnvolturaBiometrica());
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [prfPendiente, setPrfPendiente] = useState<ArrayBuffer | null>(null);
  const [ofrecerBio, setOfrecerBio] = useState(false);

  async function tryBio() {
    setError(null);
    const r = await verifyBiometric();
    if (!r.ok) { setError('No se completó Face ID. Toca el botón otra vez o usa tu PIN.'); return; }
    if (vaultAbierto()) return onUnlock(); // la app sigue abierta: la clave ya está en memoria
    if (r.prf && (await abrirConPrf(r.prf))) return onUnlock();
    setPrfPendiente(r.prf);
    setAviso(r.prf ? 'Escribe tu PIN una vez. Desde la próxima vez bastará Face ID.' : 'Escribe tu PIN.');
  }
  async function tryPin() {
    if (esperaPin() > 0) { setError(`Demasiados intentos. Espera ${esperaPin()} segundos.`); return; }
    if (!(await verifyPin(pin))) {
      const w = esperaPin();
      setError(w > 0 ? `PIN incorrecto. Por seguridad, espera ${w} segundos antes de volver a intentar.` : 'PIN incorrecto.');
      setPinValue('');
      return;
    }
    if (prfPendiente && !tieneEnvolturaBiometrica()) await agregarPrf(prfPendiente);
    // Sin Face ID activado en este dispositivo: se ofrece activarlo (una vez, sin insistir si dices "Ahora no").
    if (!hasBio && !loadSettings().bioRechazado && (await biometricAvailable())) { setOfrecerBio(true); return; }
    onUnlock();
  }
  async function aceptarBio() {
    setError(null);
    try { await activarBiometria(); onUnlock(); } catch { setError('No se pudo activar Face ID. Puedes intentarlo luego en Configuración.'); }
  }

  // Face ID se pide solo al abrir. En iPhone, iOS siempre muestra antes su hoja "Usar llave de acceso"
  // (confirmación obligatoria de Apple para la web); el botón queda de respaldo si la cierras.
  useEffect(() => { if (bioUtil) void tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [verPin, setVerPin] = useState(!bioUtil);
  const mostrarPin = verPin || !!aviso;

  if (ofrecerBio) {
    return (
      <main className="screen center">
        <h1>¿Entrar con Face ID?</h1>
        <p className="muted">La próxima vez bastará mirar el teléfono, sin escribir el PIN. El PIN sigue siendo tu respaldo.</p>
        {error && <div className="msg error">{error}</div>}
        <button className="btn" onClick={aceptarBio}>Activar Face ID / huella</button>
        <button className="btn link" onClick={() => { saveSettings({ bioRechazado: true }); onUnlock(); }}>Ahora no</button>
      </main>
    );
  }

  return (
    <main className="screen center">
      <h1>{title}</h1>
      {bioUtil && !aviso && (
        <button className="btn faceid-btn" onClick={tryBio}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.6 1.2 4.4 1.2 6 0" /></svg>
          {ES_IOS ? 'Entrar con Face ID' : 'Entrar con Face ID / huella / Windows Hello'}
        </button>
      )}
      {aviso && <div className="msg warn">{aviso}</div>}
      {!mostrarPin && <button className="btn link" onClick={() => setVerPin(true)}>Usar PIN</button>}
      {mostrarPin && <div className="card stack">
        <input className="pin" type="password" inputMode="numeric" maxLength={6} placeholder="PIN" value={pin} autoComplete="current-password" autoFocus
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && isValidPin(pin) && void tryPin()} />
        <button className="btn secondary" disabled={!isValidPin(pin)} onClick={tryPin}>Entrar con PIN</button>
      </div>}
      {error && <div className="msg error">{error}</div>}
      {onCancel && <button className="btn link" onClick={onCancel}>Cancelar</button>}
    </main>
  );
}
