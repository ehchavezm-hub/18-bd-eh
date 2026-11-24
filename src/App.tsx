import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, loadSettings, saveSettings } from './config/settings';
import { getEmail, getToken, signIn, signOut } from './auth/google';
import { lockConfigured } from './auth/lock';
import { SheetsAdapter } from './data/sheetsAdapter';
import { checkSchema, type SchemaReport } from './data/schemaCheck';
import { DataError } from './data/adapter';
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

  useEffect(() => { if (signedIn && unlocked) void refresh(); }, [signedIn, unlocked, refresh]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <main className="screen center">
        <h1>Falta configurar el acceso de Google</h1>
        <p className="muted">Esta copia de la app no tiene el ID de cliente OAuth (VITE_GOOGLE_CLIENT_ID).</p>
      </main>
    );
  }
  if (!settings.spreadsheetId) return <SetupScreen onDone={reload} />;
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
          try { await signIn(GOOGLE_CLIENT_ID); setSignedIn(true); setEmail(await getEmail(GOOGLE_CLIENT_ID)); }
          catch (e) { setError((e as Error).message); }
        }}>Entrar con Google</button>
      </main>
    );
  }

  if (adminGate === 'verify') {
    return <UnlockScreen title="Configuración" onUnlock={() => setAdminGate('open')} onCancel={() => setAdminGate('closed')} />;
  }
  if (adminGate === 'open') {
    return (
      <AdminScreen
        onExit={() => setAdminGate('closed')}
        onSignOut={async () => { await signOut(); setSignedIn(false); setAdminGate('closed'); }}
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
