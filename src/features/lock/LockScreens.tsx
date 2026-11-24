import { useEffect, useState } from 'react';
import { biometricAvailable, enrollBiometric, esperaPin, isValidNewPin, isValidPin, setPin, verifyBiometric, verifyPin } from '../../auth/lock';
import { abrirConPrf, agregarPrf, tieneEnvolturaBiometrica, vaultAbierto } from '../../auth/vault';
import { loadSettings } from '../../config/settings';

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

/**
 * Desbloqueo: Face ID / huella / Windows Hello primero, PIN como respaldo.
 * Además de desbloquear, abre la bóveda (clave para leer los datos cifrados del dispositivo).
 */
export function UnlockScreen({ title, onUnlock, onCancel }: { title: string; onUnlock: () => void; onCancel?: () => void }) {
  const hasBio = !!loadSettings().webauthnCredentialId;
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [prfPendiente, setPrfPendiente] = useState<ArrayBuffer | null>(null);

  async function tryBio() {
    setError(null);
    const r = await verifyBiometric();
    if (!r.ok) { setError('No se reconoció. Intenta de nuevo o usa tu PIN.'); return; }
    if (vaultAbierto()) return onUnlock(); // la app sigue abierta: la clave ya está en memoria
    if (r.prf && (await abrirConPrf(r.prf))) return onUnlock();
    setPrfPendiente(r.prf);
    setAviso(r.prf
      ? 'Escribe tu PIN una vez. Desde la próxima vez bastará Face ID / huella.'
      : 'Este dispositivo no permite abrir los datos cifrados solo con biometría. Escribe tu PIN al abrir la app; mientras siga abierta, bastará Face ID / huella.');
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
    onUnlock();
  }
  useEffect(() => { if (hasBio) void tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="screen center">
      <h1>{title}</h1>
      {hasBio && !aviso && <button className="btn" onClick={tryBio}>Usar Face ID / huella / Windows Hello</button>}
      {aviso && <div className="msg warn">{aviso}</div>}
      <div className="card stack">
        <input className="pin" type="password" inputMode="numeric" maxLength={6} placeholder="PIN" value={pin} autoComplete="current-password"
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && isValidPin(pin) && void tryPin()} />
        <button className="btn secondary" disabled={!isValidPin(pin)} onClick={tryPin}>Entrar con PIN</button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {onCancel && <button className="btn link" onClick={onCancel}>Cancelar</button>}
    </main>
  );
}
