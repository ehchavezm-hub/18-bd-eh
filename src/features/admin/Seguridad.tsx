/** Lista de seguridad: revisión automática de la hoja + pasos que solo tú puedes hacer (con enlace directo). */
import { useState } from 'react';
import { getToken } from '../../auth/google';
import { revisarCompartir, type ResultadoCompartir } from '../../auth/driveCheck';
import { GOOGLE_CLIENT_ID, loadSettings } from '../../config/settings';
import { Status } from '../../ui/kit';

const KEY = 'finanzas.seguridad.v1';
const leer = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };

const PASOS = [
  { id: 'google2fa', titulo: 'Verificación en dos pasos en Google', detalle: 'Es la llave de tu hoja: sin ella, quien sepa tu contraseña ve todo.', url: 'https://myaccount.google.com/signinoptions/twosv' },
  { id: 'secreto', titulo: 'Borrar el secreto del cliente de Google', detalle: 'Salió en una captura. La app no lo usa: Google Cloud → Credenciales → tu cliente → Secretos del cliente → borrar.', url: 'https://console.cloud.google.com/apis/credentials' },
  { id: 'github2fa', titulo: 'Verificación en dos pasos en GitHub', detalle: 'Protege el código que publica la app.', url: 'https://github.com/settings/security' },
  { id: 'rama', titulo: 'Proteger la rama que publica la app', detalle: 'GitHub → Settings → Branches → Add rule: rama claude/wizardly-johnson-bsg6uo, sin “Allow force pushes” ni “Allow deletions”, con “Do not allow bypassing”.', url: 'https://github.com/ehchavezm-hub/18-bd-eh/settings/branches' },
];

export function SeguridadCard() {
  const st = loadSettings();
  const [hechos, setHechos] = useState(leer);
  const [hoja, setHoja] = useState<ResultadoCompartir | null>(null);
  const [revisando, setRevisando] = useState(false);
  const marcar = (id: string, v: boolean) => { const n = { ...hechos, [id]: v }; setHechos(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* nada */ } };
  const listos = PASOS.filter((p) => hechos[p.id]).length + (hoja?.estado === 'privada' ? 1 : 0);

  async function revisar() {
    if (!st.spreadsheetId) return;
    setRevisando(true);
    try { setHoja(await revisarCompartir(st.spreadsheetId, await getToken(GOOGLE_CLIENT_ID), st.ownerEmail)); }
    catch { setHoja({ estado: 'error', motivo: 'Conéctate con Google y vuelve a intentar.' }); }
    finally { setRevisando(false); }
  }

  return (
    <section className="card stack">
      <div className="row"><h2>Seguridad</h2><span className="muted small">{listos} de {PASOS.length + 1} listos</span></div>
      <div className="seg-item">
        <div className="seg-main"><strong>Tu hoja de Google es privada</strong><span className="muted small">Solo tú debes tener acceso (acceso general: Restringido).</span></div>
        <button className="btn small secondary" disabled={revisando} onClick={() => void revisar()}>{revisando ? 'Revisando…' : 'Revisar ahora'}</button>
      </div>
      {hoja?.estado === 'privada' && <Status kind="ok">Privada: solo tú tienes acceso.</Status>}
      {hoja?.estado === 'enlace' && <Status kind="error">Cualquiera con el enlace puede {hoja.rol} tu hoja. Ábrela en Google Sheets → Compartir → Acceso general → Restringido.</Status>}
      {hoja?.estado === 'personas' && <Status kind="warn">También tienen acceso: {hoja.correos.join(', ')}. Si no lo esperabas, quítalos en Google Sheets → Compartir.</Status>}
      {hoja?.estado === 'error' && <Status kind="info">No se pudo revisar: {hoja.motivo}</Status>}
      {PASOS.map((p) => (
        <div key={p.id} className="seg-item">
          <label className="check seg-main">
            <input type="checkbox" checked={!!hechos[p.id]} onChange={(e) => marcar(p.id, e.target.checked)} />
            <span><strong>{p.titulo}</strong><span className="muted small seg-det">{p.detalle}</span></span>
          </label>
          <a className="btn small secondary" href={p.url} target="_blank" rel="noopener noreferrer">Abrir</a>
        </div>
      ))}
    </section>
  );
}
