import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearSettings, GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID, loadSettings, saveSettings } from './config/settings';
import { getEmail, getToken, signIn, signOut } from './auth/google';
import { lockConfigured } from './auth/lock';
import { SheetsAdapter } from './data/sheetsAdapter';
import { checkSchema, type SchemaReport } from './data/schemaCheck';
import { DataError } from './data/adapter';
import { localDb } from './data/localDb';
import { SetupScreen } from './features/setup/SetupScreen';
import { LockSetupScreen, UnlockScreen } from './features/lock/LockScreens';
import { HomeScreen, Placeholder } from './features/home/HomeScreen';
import { AdminScreen } from './features/admin/AdminScreen';

type Tab = 'inicio' | 'movimientos' | 'anotar' | 'cuentas' | 'reportes';
const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'inicio', label: 'Inicio', ico: '⌂' },
  { id: 'movimientos', label: 'Movimientos', ico: '☰' },
  { id: 'anotar', label: 'Anotar', ico: '＋' },
  { id: 'cuentas', label: 'Cuentas', ico: '◫' },
  { id: 'reportes', label: 'Reportes', ico: '◔' },
];

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [signedIn, setSignedIn] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [adminGate, setAdminGate] = useState<'closed' | 'verify' | 'open'>('closed');
  const [tab, setTab] = useState<Tab>('inicio');
  const [email, setEmail] = useState<string | null>(null);
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const reload = () => setSettings(loadSettings());

  // Bloqueo automático al volver a la app tras unos minutos.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > (loadSettings().lockAfterMinutes ?? 2) * 60_000) {
        setUnlocked(false); setAdminGate('closed');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const db = useMemo(
    () => (settings.spreadsheetId && GOOGLE_CLIENT_ID ? new SheetsAdapter(settings.spreadsheetId, () => getToken(GOOGLE_CLIENT_ID)) : null),
    [settings.spreadsheetId],
  );

  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true); setError(null);
    try {
      const r = await checkSchema(db);
      setReport(r);
      saveSettings({ spreadsheetTitle: r.title });
    } catch (e) {
      setError(e instanceof DataError ? e.message : 'No se pudo leer la base de datos.');
      if (e instanceof DataError && e.kind === 'auth') setSignedIn(false);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { if (signedIn && unlocked && settings.spreadsheetId) void refresh(); }, [signedIn, unlocked, settings.spreadsheetId, refresh]);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY || !GOOGLE_APP_ID) {
    return (
      <main className="screen center">
        <h1>Falta configurar el acceso de Google</h1>
        <p className="muted">Faltan las variables VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY o VITE_GOOGLE_APP_ID. Ver docs/CONFIGURAR_GOOGLE.md.</p>
      </main>
    );
  }
  if (!lockConfigured()) return <LockSetupScreen onDone={() => { setUnlocked(true); reload(); }} />;
  if (!unlocked) return <UnlockScreen title="Mis Finanzas" onUnlock={() => setUnlocked(true)} />;

  if (!signedIn) {
    return (
      <main className="screen center">
        <h1>Entra con Google</h1>
        <p className="muted">{settings.spreadsheetTitle ? `Para leer y guardar en tu hoja «${settings.spreadsheetTitle}».` : 'Para leer y guardar en tu hoja de finanzas.'}</p>
        {error && <div className="msg error">{error}</div>}
        <button className="btn" onClick={async () => {
          setError(null);
          try {
            await signIn(GOOGLE_CLIENT_ID);
            const mail = await getEmail(GOOGLE_CLIENT_ID);
            const owner = loadSettings().ownerEmail;
            if (!mail) throw new Error('No se pudo confirmar tu cuenta de Google.');
            if (owner && owner.toLowerCase() !== mail.toLowerCase()) {
              await signOut();
              throw new Error('Esta app está vinculada a otra cuenta de Google. Acceso denegado.');
            }
            if (!owner) saveSettings({ ownerEmail: mail });
            setEmail(mail); setSignedIn(true);
          }
          catch (e) { setError((e as Error).message); }
        }}>Entrar con Google</button>
      </main>
    );
  }

  if (!settings.spreadsheetId) return <SetupScreen getAccessToken={() => getToken(GOOGLE_CLIENT_ID)} onDone={reload} />;

  if (adminGate === 'verify') {
    return <UnlockScreen title="Configuración" onUnlock={() => setAdminGate('open')} onCancel={() => setAdminGate('closed')} />;
  }
  if (adminGate === 'open') {
    return (
      <AdminScreen
        onExit={() => setAdminGate('closed')}
        onSignOut={async () => { await signOut(); setSignedIn(false); setAdminGate('closed'); }}
        onWipe={async () => { await signOut(); await localDb.delete(); clearSettings(); location.reload(); }}
        onChangeSheet={() => { saveSettings({ spreadsheetId: undefined, spreadsheetTitle: undefined }); setReport(null); setAdminGate('closed'); reload(); }}
      />
    );
  }

  return (
    <>
      {error && <div className="screen" style={{ flex: 0, paddingBottom: 0 }}><div className="msg error">{error}</div></div>}
      {tab === 'inicio' && <HomeScreen report={report} email={email} onRefresh={refresh} loading={loading} />}
      {tab === 'movimientos' && <Placeholder title="Movimientos" stage="etapa 2" />}
      {tab === 'anotar' && <Placeholder title="Anotar" stage="etapa 1" />}
      {tab === 'cuentas' && <Placeholder title="Cuentas" stage="etapa 2" />}
      {tab === 'reportes' && <Placeholder title="Reportes" stage="etapa 4" />}
      <button className="btn link" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top) + 8px)', right: 8 }}
        aria-label="Configuración" onClick={() => setAdminGate('verify')}>⚙︎</button>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span className="ico">{t.ico}</span>{t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
