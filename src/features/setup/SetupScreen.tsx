import { useState } from 'react';
import { pickSpreadsheet } from '../../auth/picker';
import { saveSettings } from '../../config/settings';

/**
 * Elegir la BD con el selector de Google Drive.
 * Es la única forma de dar acceso: la app solo podrá abrir el archivo elegido aquí.
 */
export function SetupScreen({ getAccessToken, onDone }: { getAccessToken: () => Promise<string>; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    setError(null); setBusy(true);
    try {
      const picked = await pickSpreadsheet(await getAccessToken());
      if (picked) { saveSettings({ spreadsheetId: picked.id, spreadsheetTitle: picked.name }); onDone(); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen center">
      <h1>Elige tu base de datos</h1>
      <p className="muted">Se abrirá tu Google Drive. Elige tu hoja de finanzas (Google Sheets). La app solo podrá abrir ese archivo, ningún otro.</p>
      {error && <div className="msg error">{error}</div>}
      <button className="btn" disabled={busy} onClick={choose}>{busy ? 'Abriendo Drive…' : 'Elegir en Google Drive'}</button>
    </main>
  );
}
