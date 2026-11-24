import { loadSettings } from '../../config/settings';

const SECTIONS = [
  ['Bancos', '2.INSTITUCIONES'], ['Cuentas y tarjetas', '3.CUENTAS'], ['Categorías', '4.CATEGORIAS'],
  ['Centros', '5.CENTROS'], ['Lugares y países', '6.LUGARES · 9.PAISES'], ['Monedas y tipo de cambio', '7.MONEDAS · 8.TIPO_CAMBIO'],
  ['Pagos fijos', '12.RECURRENTES'], ['Reglas automáticas', '14.REGLAS_CATEGORIZACION'], ['Ajustes', '11.CONFIG'], ['Datos y bitácora', '17.BITACORA'],
];

/** Módulo Administrador. Etapa 0: estructura y opciones de sesión. */
export function AdminScreen({ onSignOut, onChangeSheet, onExit }: { onSignOut: () => void; onChangeSheet: () => void; onExit: () => void }) {
  const s = loadSettings();
  return (
    <main className="screen">
      <div className="row">
        <h1>Configuración</h1>
        <button className="btn link" onClick={onExit}>Cerrar</button>
      </div>
      <section className="card">
        <ul className="plain">
          {SECTIONS.map(([name, sheet]) => (
            <li key={name} className="row"><span>{name}</span><span className="muted">{sheet} · etapa 1</span></li>
          ))}
        </ul>
      </section>
      <section className="card stack">
        <h2>Este teléfono</h2>
        <p className="muted">Bloqueo: {s.webauthnCredentialId ? 'Face ID / huella + PIN' : 'PIN'}</p>
        <button className="btn secondary" onClick={onChangeSheet}>Cambiar hoja de cálculo</button>
        <button className="btn secondary" onClick={onSignOut}>Cerrar sesión de Google</button>
      </section>
    </main>
  );
}
