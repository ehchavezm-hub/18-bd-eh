import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearSettings, GOOGLE_API_KEY, GOOGLE_APP_ID, GOOGLE_CLIENT_ID, loadSettings, saveSettings } from './config/settings';
import { SCHEMA_VERSION } from './config/schema';
import { getEmail, getToken, hasToken, signIn, signOut } from './auth/google';
import { cerrarVault, vaultAbierto } from './auth/vault';
import { lockConfigured } from './auth/lock';
import { SheetsAdapter } from './data/sheetsAdapter';
import { checkSchema } from './data/schemaCheck';
import { DataError } from './data/adapter';
import { localDb } from './data/localDb';
import { getState, initStore, refrescar, resetStore, sync, useStore } from './data/store';
import { cargarTcHistorico } from './data/tcHistorico';
import { deviceName, useData } from './data/useData';
import { porAtender } from './domain/recurring';
import { todayIso } from './domain/dates';
import type { Movimiento } from './domain/model';
import { SetupScreen } from './features/setup/SetupScreen';
import { LockSetupScreen, UnlockScreen } from './features/lock/LockScreens';
import { HomeScreen } from './features/home/HomeScreen';
import { AdminScreen } from './features/admin/AdminScreen';
import { MovementForm, type Prefill } from './features/anotar/MovementForm';
import { MovementsScreen } from './features/movimientos/MovementsScreen';
import { AccountsScreen } from './features/cuentas/AccountsScreen';
import { PaymentsScreen } from './features/pagos/PaymentsScreen';
import { ReportsScreen } from './features/reportes/ReportsScreen';
import { avisarPresupuestos, updateBadgeAndNotify } from './features/pagos/notify';
import { avancePresupuestos } from './domain/plan';
import { Sheet, toast, ToastHost } from './ui/kit';

type Tab = 'inicio' | 'movimientos' | 'anotar' | 'cuentas' | 'reportes' | 'pagos';
const ICON: Record<Tab, string> = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  movimientos: 'M4 6h16M4 12h16M4 18h10',
  anotar: 'M12 5v14M5 12h14',
  cuentas: 'M3 7h18v12H3zM3 11h18M7 15h4',
  reportes: 'M5 20V10M12 20V4M19 20v-7',
  pagos: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
};
const TABS: { id: Tab; label: string; desktopOnly?: boolean }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'anotar', label: 'Anotar' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'reportes', label: 'Dashboards' },
  { id: 'pagos', label: 'Pagos fijos', desktopOnly: true },
];
const Icon = ({ d }: { d: string }) => (
  <svg className="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const DEVICE = deviceName();
// Valor guardado en el dispositivo: se acota a 0–15 min para que un ajuste alterado no deje la app sin bloqueo.
const minutosBloqueo = () => { const m = Number(loadSettings().lockAfterMinutes); return Number.isFinite(m) ? Math.min(15, Math.max(0, m)) : 2; };

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  // Si ya entraste antes en este dispositivo, no se vuelve a mostrar la pantalla de Google:
  // la app abre con tus datos y Google se reconecta en segundo plano.
  const [signedIn, setSignedIn] = useState(() => { const s = loadSettings(); return !!(s.ownerEmail && s.spreadsheetId); });
  const [unlocked, setUnlocked] = useState(false);
  const [adminGate, setAdminGate] = useState<'closed' | 'verify' | 'open'>('closed');
  const [adminSeccion, setAdminSeccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const reload = () => setSettings(loadSettings());

  // Bloqueo: al salir de la app más de 2 minutos, o tras 5 minutos sin tocar nada con la app abierta.
  // Al bloquear se cierra la bóveda y se oculta el contenido (pantalla de privacidad). El permiso de Google
  // (solo memoria, máx. 1 hora, solo para la hoja elegida) se conserva para no volver a pedirlo en cada apertura.
  useEffect(() => {
    const bloquear = () => { setUnlocked(false); setAdminGate('closed'); };
    let ultimaActividad = Date.now();
    const actividad = () => { ultimaActividad = Date.now(); };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        document.documentElement.classList.add('privacy');
      } else {
        document.documentElement.classList.remove('privacy');
        if (hiddenAt.current && Date.now() - hiddenAt.current > minutosBloqueo() * 60_000) bloquear();
        ultimaActividad = Date.now();
      }
    };
    const id = setInterval(() => { if (Date.now() - ultimaActividad > 5 * 60_000) bloquear(); }, 15_000);
    document.addEventListener('visibilitychange', onVis);
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, actividad, { passive: true });
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.removeEventListener(ev, actividad);
    };
  }, []);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY || !GOOGLE_APP_ID) {
    return (
      <main className="screen center">
        <h1>Falta configurar el acceso de Google</h1>
        <p className="muted">Faltan las variables VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY o VITE_GOOGLE_APP_ID. Ver docs/CONFIGURAR_GOOGLE.md.</p>
      </main>
    );
  }
  if (!lockConfigured()) return <LockSetupScreen onDone={() => { setUnlocked(true); reload(); }} />;
  // Sin la bóveda abierta no se puede leer nada guardado en el dispositivo.
  if (!unlocked || !vaultAbierto()) return <UnlockScreen title="Mis Finanzas" onUnlock={() => setUnlocked(true)} />;

  if (!signedIn) {
    return (
      <main className="screen center">
        <h1>Entra con Google</h1>
        <p className="muted">{settings.spreadsheetTitle ? `Para leer y guardar en tu hoja «${settings.spreadsheetTitle}».` : 'Para leer y guardar en tu hoja de finanzas.'}</p>
        {error && <div className="msg error">{error}</div>}
        <button className="btn" onClick={async () => {
          setError(null);
          try {
            await signIn(GOOGLE_CLIENT_ID, loadSettings().ownerEmail);
            const mail = await getEmail(GOOGLE_CLIENT_ID);
            const owner = loadSettings().ownerEmail;
            if (!mail) throw new Error('No se pudo confirmar tu cuenta de Google.');
            if (owner && owner.toLowerCase() !== mail.toLowerCase()) {
              await signOut();
              throw new Error('Esta app está vinculada a otra cuenta de Google. Acceso denegado.');
            }
            if (!owner) saveSettings({ ownerEmail: mail });
            setSignedIn(true);
          } catch (e) { setError((e as Error).message); }
        }}>Entrar con Google</button>
      </main>
    );
  }

  if (!settings.spreadsheetId) return <SetupScreen getAccessToken={() => getToken(GOOGLE_CLIENT_ID)} onDone={reload} />;

  if (adminGate === 'verify') {
    return <UnlockScreen title="Configuración" onUnlock={() => setAdminGate('open')} onCancel={() => setAdminGate('closed')} />;
  }

  return (
    <Main
      spreadsheetId={settings.spreadsheetId}
      adminOpen={adminGate === 'open'}
      adminSeccion={adminSeccion}
      onOpenAdmin={(sec?: string) => { setAdminSeccion(sec ?? null); setAdminGate('verify'); }}
      onCloseAdmin={() => setAdminGate('closed')}
      onSignOut={async () => { await signOut(); setSignedIn(false); setAdminGate('closed'); }}
      onChangeSheet={async () => { await resetStore(); saveSettings({ spreadsheetId: undefined, spreadsheetTitle: undefined, schemaOk: undefined }); setAdminGate('closed'); reload(); }}
      onWipe={async () => { await signOut(); await resetStore(); await localDb.delete(); cerrarVault(); clearSettings(); try { localStorage.clear(); } catch { /* nada */ } location.reload(); }}
    />
  );
}

/** App ya conectada: módulo usuario + módulo administrador. */
function Main(p: {
  spreadsheetId: string; adminOpen: boolean; adminSeccion: string | null; onOpenAdmin: (seccion?: string) => void; onCloseAdmin: () => void;
  onSignOut: () => void; onChangeSheet: () => void; onWipe: () => void;
}) {
  const store = useStore();
  const data = useData();
  const [tab, setTab] = useState<Tab>('inicio');
  const [vistaDash, setVistaDash] = useState<'normal' | 'plan'>('normal');
  const [form, setForm] = useState<{ editar?: Movimiento; prefill?: Prefill } | null>(null);
  const [filtro, setFiltro] = useState<{ key: number; mes?: string; categoriaId?: string; centroId?: string; cuentaId?: string }>({ key: 0 });
  const [schemaMsg, setSchemaMsg] = useState<string | null>(null);

  const db = useMemo(() => new SheetsAdapter(p.spreadsheetId, () => getToken(GOOGLE_CLIENT_ID)), [p.spreadsheetId]);

  // Arranque: copia local + sincronización; comprobación del esquema la primera vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      void cargarTcHistorico().then(refrescar);
      await initStore(db, DEVICE);
      const st = loadSettings();
      if (st.schemaOk !== p.spreadsheetId && navigator.onLine) {
        try {
          const r = await checkSchema(db);
          if (!vivo) return;
          if (r.ok) saveSettings({ schemaOk: p.spreadsheetId, spreadsheetTitle: r.title });
          else setSchemaMsg(`La hoja «${r.title}» no tiene la estructura esperada. ${r.missingSheets.length ? `Faltan pestañas: ${r.missingSheets.join(', ')}.` : ''} ${r.missingColumns.map((m) => `En ${m.sheet} faltan: ${m.columns.join(', ')}.`).join(' ')}`);
        } catch (e) {
          if (e instanceof DataError && e.kind === 'auth') setConectar(true); // se pide con el aviso, sin bloquear la app
        }
      }
      await sync();
    })();
    // Sincronización automática; si Google necesita tu toque, se espera al botón del aviso.
    const auto = () => { if (getState().authExpired && !hasToken()) return; void sync(); };
    const onOnline = auto;
    const onVis = () => document.visibilityState === 'visible' && auto();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(auto, 120_000);
    return () => { vivo = false; window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  const [conectar, setConectar] = useState(false);
  const [conectando, setConectando] = useState(false);
  const pideGoogle = conectar || store.authExpired;
  // Reconectar con Google: un toque (gesto del usuario), sin elegir cuenta ni volver a dar permisos.
  const reconectar = async () => {
    setConectando(true);
    try {
      await signIn(GOOGLE_CLIENT_ID, loadSettings().ownerEmail);
      const mail = await getEmail(GOOGLE_CLIENT_ID);
      const owner = loadSettings().ownerEmail;
      if (!mail || (owner && owner.toLowerCase() !== mail.toLowerCase())) {
        await signOut();
        throw new Error('Esa no es la cuenta de Google vinculada a esta app.');
      }
      setConectar(false);
      await sync();
    } catch (e) {
      toast((e as Error).message);
    } finally { setConectando(false); }
  };

  // Versión del esquema en cada sincronización.
  const version = (store.tables.CONFIG ?? []).find((r) => r.CLAVE === 'VERSION_ESQUEMA')?.VALOR;
  const versionMal = version !== undefined && version !== null && Number(version) !== SCHEMA_VERSION;

  // Avisos y número en el ícono.
  useEffect(() => {
    if (!store.ready) return;
    void updateBadgeAndNotify(porAtender(data.recurrentes, data.movs, todayIso()));
    // Presupuestos: aviso al 80 % y al 100 % (también como mensaje dentro de la app).
    const mesHoy = todayIso().slice(0, 7);
    void avisarPresupuestos(avancePresupuestos(data.presupuestos, data.movs, data.categoriasById, mesHoy, todayIso())
      .map((a) => ({ id: a.presupuesto.id, nombre: a.nombre, pct: a.pct, estado: a.estado })), mesHoy).then((t) => { if (t.length) toast(t.join(' · ')); });
  }, [store.ready, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirMovs = useCallback((f: { mes?: string; categoriaId?: string; centroId?: string; cuentaId?: string }) => {
    setFiltro({ key: Date.now(), ...f });
    setTab('movimientos');
  }, []);

  if (p.adminOpen) {
    return <><AdminScreen seccionInicial={p.adminSeccion} onExit={p.onCloseAdmin} onSignOut={p.onSignOut} onChangeSheet={p.onChangeSheet} onWipe={p.onWipe} /><ToastHost /></>;
  }

  if (!store.ready) {
    return (
      <main className="screen" aria-busy="true">
        <h1>Cargando tus datos…</h1>
        <p className="muted">{store.error ?? 'La primera vez puede tardar unos segundos. Luego funcionará también sin internet.'}</p>
        {pideGoogle ? <button className="btn" disabled={conectando} onClick={() => void reconectar()}>Conectar con Google</button> : store.error ? <button className="btn" onClick={() => void sync()}>Reintentar</button> : (
          <><div className="skeleton hero-sk" /><div className="kpis"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton chart-sk" /></>
        )}
      </main>
    );
  }

  return (
    <>
      {pideGoogle && (
        <div className="screen banner"><div className="msg conectar">
          <span>Tus datos están al día en este dispositivo. Toca para sincronizar con Google.</span>
          <button className="btn small" disabled={conectando} onClick={() => void reconectar()}>{conectando ? 'Conectando…' : 'Conectar'}</button>
        </div></div>
      )}
      {(schemaMsg || versionMal) && (
        <div className="screen banner"><div className="msg error">{schemaMsg ?? `La hoja tiene la versión de esquema ${version}; esta app espera la ${SCHEMA_VERSION}. No modifiques la hoja hasta actualizar la app.`}</div></div>
      )}
      {tab === 'inicio' && <HomeScreen onPagar={(pf) => setForm({ prefill: pf })} onVerPagos={() => setTab('pagos')} onVerCuentas={() => setTab('cuentas')} onVerDashboards={() => setTab('reportes')} onVerPlan={() => { setVistaDash('plan'); setTab('reportes'); }} />}
      {tab === 'movimientos' && <MovementsScreen key={filtro.key} filtroInicial={filtro} onAbrir={(m) => setForm({ editar: m })} />}
      {tab === 'cuentas' && <AccountsScreen onVerMovimientos={(cuentaId) => abrirMovs({ cuentaId })} />}
      {tab === 'reportes' && <ReportsScreen key={vistaDash} vistaInicial={vistaDash === 'plan' ? 'plan' : undefined} onVerMovimientos={abrirMovs} onConfigurar={(sec) => p.onOpenAdmin(sec)} />}
      {tab === 'pagos' && <PaymentsScreen onPagar={(pf) => setForm({ prefill: pf })} device={DEVICE} onConfigurar={() => p.onOpenAdmin('RECURRENTES')} onAnotar={() => setForm({})} />}

      <button className="btn link gear" aria-label="Configuración" onClick={() => p.onOpenAdmin()}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      <nav className="tabbar">
        <div className="brand"><img src="icons/icon.svg" alt="" width="28" height="28" /><span>Mis Finanzas</span></div>
        {TABS.map((t) => (
          <button key={t.id} className={t.desktopOnly ? 'desktop-only' : t.id === 'anotar' ? 'tab-add' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => { if (t.id === 'anotar') setForm({}); else { if (t.id === 'reportes') setVistaDash('normal'); setTab(t.id); } }}>
            <Icon d={ICON[t.id]} />{t.label}
          </button>
        ))}
      </nav>

      {form && (
        <Sheet title={form.editar ? 'Editar movimiento' : form.prefill?.recurrenteId ? 'Registrar pago fijo' : 'Anotar'} onClose={() => setForm(null)}>
          <MovementForm editar={form.editar} prefill={form.prefill} device={DEVICE} onDone={() => setForm(null)} />
        </Sheet>
      )}
      <ToastHost />
    </>
  );
}
