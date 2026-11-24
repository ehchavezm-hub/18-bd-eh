import { useState } from 'react';
import { parseSheetLink } from '../../lib/sheetId';
import { saveSettings } from '../../config/settings';

/** Primera vez: el usuario pega el enlace de su BD en Google Sheets. */
export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = parseSheetLink(link);
    if (!parsed) return setError('No reconozco ese enlace. Copia el enlace de la hoja desde Google Drive.');
    if (parsed.isOfficeFile)
      return setError('Ese enlace es de un archivo Excel (.xlsx). En Drive ábrelo y usa Archivo → Guardar como Hojas de cálculo de Google; luego pega el enlace de la copia nueva.');
    saveSettings({ spreadsheetId: parsed.id });
    onDone();
  }

  return (
    <main className="screen center">
      <h1>Conecta tu base de datos</h1>
      <p className="muted">Pega el enlace de tu hoja de Google Sheets. Solo se guarda en este teléfono.</p>
      <div className="card stack">
        <input
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={link}
          onChange={(e) => { setLink(e.target.value); setError(null); }}
        />
        {error && <div className="msg error">{error}</div>}
        <button className="btn" disabled={!link.trim()} onClick={submit}>Continuar</button>
      </div>
    </main>
  );
}
