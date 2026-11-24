import type { SchemaReport } from '../../data/schemaCheck';
import { SCHEMA_VERSION } from '../../config/schema';

/** Etapa 0: confirma que la app está conectada a la BD correcta. */
export function HomeScreen({ report, email, onRefresh, loading }: { report: SchemaReport | null; email: string | null; onRefresh: () => void; loading: boolean }) {
  return (
    <main className="screen">
      <div className="row">
        <h1>Inicio</h1>
        <button className="btn link" onClick={onRefresh} disabled={loading}>{loading ? 'Revisando…' : 'Actualizar'}</button>
      </div>
      {email && <p className="muted">Sesión: {email}</p>}

      {report && (
        <section className="card stack">
          <div className="row">
            <h2>Base de datos</h2>
            <span className={`badge ${report.ok ? 'ok' : 'error'}`}>{report.ok ? 'Conectada' : 'Revisar'}</span>
          </div>
          <p>{report.title}</p>
          <p className="muted">Versión del esquema: {report.schemaVersion ?? '—'} (la app espera {SCHEMA_VERSION})</p>
          {report.missingSheets.length > 0 && (
            <div className="msg error">Faltan pestañas: {report.missingSheets.join(', ')}</div>
          )}
          {report.missingColumns.map((m) => (
            <div key={m.sheet} className="msg error">En {m.sheet} faltan columnas: {m.columns.join(', ')}</div>
          ))}
          {report.ok && (
            <div className="stats">
              <div><strong>{report.counts.cuentasActivas}</strong><span className="muted">cuentas</span></div>
              <div><strong>{report.counts.categoriasActivas}</strong><span className="muted">categorías</span></div>
              <div><strong>{report.counts.movimientos.toLocaleString('es-PE')}</strong><span className="muted">movimientos</span></div>
            </div>
          )}
        </section>
      )}

      <section className="card stack">
        <h2>Próximamente</h2>
        <p className="muted">Etapa 1: anotar gastos. Etapa 2: saldos e historial. Etapa 3: pagos fijos. Etapa 4: reportes.</p>
      </section>
    </main>
  );
}

export function Placeholder({ title, stage }: { title: string; stage: string }) {
  return (
    <main className="screen">
      <h1>{title}</h1>
      <div className="card"><p className="muted">Disponible en la {stage}.</p></div>
    </main>
  );
}
