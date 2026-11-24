import { useEffect, useState } from 'react';
import { biometricAvailable, enrollBiometric, isValidPin, setPin, verifyBiometric, verifyPin } from '../../auth/lock';
import { loadSettings } from '../../config/settings';

/** Primera vez: activar Face ID / huella / Windows Hello y un PIN de respaldo. */
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
    try { await setPin(pin); onDone(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="screen center">
      <h1>Protege la app</h1>
      <p className="muted">Se pedirá al abrir la app y al entrar a Configuración.</p>
      {bio && (
        <div className="card stack">
          <h2>Face ID / huella / Windows Hello</h2>
          {bioOn ? <span className="badge ok">Activado</span> : <button className="btn" onClick={activateBio}>Activar Face ID / huella / Windows Hello</button>}
        </div>
      )}
      <div className="card stack">
        <h2>PIN de respaldo</h2>
        <p className="muted">De 4 a 6 números, por si Face ID falla.</p>
        <input className="pin" type="password" inputMode="numeric" maxLength={6} value={pin}
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} />
        {error && <div className="msg error">{error}</div>}
        <button className="btn" disabled={!isValidPin(pin)} onClick={finish}>Guardar</button>
      </div>
    </main>
  );
}

/** Desbloqueo: Face ID / huella / Windows Hello primero, PIN como respaldo. */
export function UnlockScreen({ title, onUnlock, onCancel }: { title: string; onUnlock: () => void; onCancel?: () => void }) {
  const hasBio = !!loadSettings().webauthnCredentialId;
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function tryBio() {
    setError(null);
    if (await verifyBiometric()) onUnlock(); else setError('No se reconoció. Intenta de nuevo o usa tu PIN.');
  }
  async function tryPin() {
    if (await verifyPin(pin)) onUnlock(); else { setError('PIN incorrecto.'); setPinValue(''); }
  }
  useEffect(() => { if (hasBio) void tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="screen center">
      <h1>{title}</h1>
      {hasBio && <button className="btn" onClick={tryBio}>Usar Face ID / huella / Windows Hello</button>}
      <div className="card stack">
        <input className="pin" type="password" inputMode="numeric" maxLength={6} placeholder="PIN" value={pin}
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} />
        <button className="btn secondary" disabled={!isValidPin(pin)} onClick={tryPin}>Entrar con PIN</button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {onCancel && <button className="btn link" onClick={onCancel}>Cancelar</button>}
    </main>
  );
}
