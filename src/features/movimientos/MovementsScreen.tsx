import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import { dayLabel, monthKey, monthLong, todayIso } from '../../domain/dates';
import { dinero } from '../../domain/format';
import { normalizar } from '../../domain/suggest';
import type { Movimiento } from '../../domain/model';
import { Empty, Select, Status } from '../../ui/kit';
import { estiloGrupo, TRANSFERENCIA } from '../../ui/colors';
import type { CSSProperties } from 'react';

const PAGINA = 60;

/** Historial: buscar, filtrar y abrir un movimiento para editarlo o anularlo. */
export function MovementsScreen({ onAbrir, filtroInicial }: { onAbrir: (m: Movimiento) => void; filtroInicial?: { mes?: string; categoriaId?: string; centroId?: string; cuentaId?: string } }) {
  const d = useData();
  const [texto, setTexto] = useState('');
  const [mes, setMes] = useState(filtroInicial?.mes ?? '');
  const [tipo, setTipo] = useState('');
  const [cuentaId, setCuentaId] = useState(filtroInicial?.cuentaId ?? '');
  const [categoriaId, setCategoriaId] = useState(filtroInicial?.categoriaId ?? '');
  const [centroId, setCentroId] = useState(filtroInicial?.centroId ?? '');
  const [anulados, setAnulados] = useState(false);
  const [n, setN] = useState(PAGINA);

  const meses = useMemo(() => [...new Set(d.movs.map((m) => monthKey(m.fecha)))].sort().reverse(), [d.movs]);
  const lista = useMemo(() => {
    const t = normalizar(texto);
    return d.movs
      .filter((m) => !m.eliminado && (anulados || m.estado !== 'ANULADO'))
      .filter((m) => (!mes || monthKey(m.fecha) === mes) && (!tipo || m.tipo === tipo) && (!cuentaId || m.cuentaId === cuentaId || m.cuentaDestinoId === cuentaId))
      .filter((m) => (!categoriaId || m.categoriaId === categoriaId || d.categoriasById.get(m.categoriaId ?? '')?.padreId === categoriaId) && (!centroId || m.centroId === centroId))
      .filter((m) => !t || normalizar(`${m.descripcion} ${m.notas ?? ''} ${m.etiquetas ?? ''}`).includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora ?? '').localeCompare(a.hora ?? ''));
  }, [d, texto, mes, tipo, cuentaId, categoriaId, centroId, anulados]);

  const total = useMemo(() => lista.reduce((s, m) => s + (m.estado === 'PAGADO' && m.tipo === 'EGRESO' && m.moneda === 'PEN' ? m.monto : 0), 0), [lista]);
  const visibles = lista.slice(0, n);
  const grupos: [string, Movimiento[]][] = [];
  for (const m of visibles) { const g = grupos[grupos.length - 1]; if (g && g[0] === m.fecha) g[1].push(m); else grupos.push([m.fecha, [m]]); }
  const hoy = todayIso();

  return (
    <main className="screen">
      <h1>Movimientos</h1>
      <div className="card stack">
        <input type="search" placeholder="Buscar (descripción, notas, etiquetas)" value={texto} onChange={(e) => { setTexto(e.target.value); setN(PAGINA); }} />
        <div className="filters">
          <Select value={mes} onChange={(v) => { setMes(v); setN(PAGINA); }} placeholder="Todos los meses" options={meses.map((m) => ({ value: m, label: monthLong(m) }))} />
          <Select value={tipo} onChange={setTipo} placeholder="Todos los tipos" options={[{ value: 'EGRESO', label: 'Gastos' }, { value: 'INGRESO', label: 'Ingresos' }, { value: 'TRANSFERENCIA', label: 'Transferencias' }]} />
          <Select value={cuentaId} onChange={setCuentaId} placeholder="Todas las cuentas" options={d.cuentas.map((c) => ({ value: c.id, label: c.nombre }))} />
          <Select value={categoriaId} onChange={setCategoriaId} placeholder="Todas las categorías" options={d.categorias.map((c) => ({ value: c.id, label: c.padreId ? c.nombre : `${c.nombre} (grupo)` }))} />
          <Select value={centroId} onChange={setCentroId} placeholder="Todos los centros" options={d.centros.map((c) => ({ value: c.id, label: c.nombre }))} />
        </div>
        <label className="check"><input type="checkbox" checked={anulados} onChange={(e) => setAnulados(e.target.checked)} /> Mostrar anulados</label>
        <p className="muted small">{lista.length.toLocaleString('es-PE')} movimientos · gastos en soles: {dinero(total)}</p>
      </div>

      {lista.length === 0 ? <Empty>No hay movimientos con esos filtros.</Empty> : (
        <div className="stack">
          {grupos.map(([fecha, ms]) => (
            <section key={fecha} className="card day">
              <h3 className="muted small">{dayLabel(fecha, hoy)}</h3>
              <ul className="plain">
                {ms.map((m) => <MovRow key={m.id} m={m} onClick={() => onAbrir(m)} />)}
              </ul>
            </section>
          ))}
          {n < lista.length && <button className="btn secondary" onClick={() => setN(n + PAGINA)}>Ver más ({lista.length - n} restantes)</button>}
        </div>
      )}
    </main>
  );

  function Avatar({ m }: { m: Movimiento }) {
    const cat = d.categoriasById.get(m.categoriaId ?? '');
    const grupo = cat?.padreId ? d.categoriasById.get(cat.padreId) : cat;
    const e = m.tipo === 'TRANSFERENCIA' ? TRANSFERENCIA : estiloGrupo(grupo?.id, grupo ?? undefined);
    return <span className="avatar" style={{ '--c': e.color } as CSSProperties} aria-hidden="true">{e.icono}</span>;
  }

  function MovRow({ m, onClick }: { m: Movimiento; onClick: () => void }) {
    const signo = m.tipo === 'INGRESO' || m.tipo === 'REEMBOLSO' ? '+' : m.tipo === 'TRANSFERENCIA' ? '' : '−';
    return (
      <li>
        <button type="button" className={`mov${m.estado === 'ANULADO' ? ' anulado' : ''}`} onClick={onClick}>
          <Avatar m={m} />
          <span className="mov-main">
            <span className="mov-desc">{m.descripcion || '(sin descripción)'}</span>
            <span className="muted small">
              {m.tipo === 'TRANSFERENCIA' ? `${d.nombres.cuenta.get(m.cuentaId) ?? m.cuentaId} → ${d.nombres.cuenta.get(m.cuentaDestinoId ?? '') ?? m.cuentaDestinoId}` : `${d.nombres.categoria.get(m.categoriaId ?? '') ?? 'Sin categoría'} · ${d.nombres.cuenta.get(m.cuentaId) ?? m.cuentaId}`}
            </span>
          </span>
          <span className={`mov-amount ${signo === '+' ? 'in' : m.tipo === 'TRANSFERENCIA' ? 'tr' : ''}`}>{signo}{dinero(m.monto, m.moneda)}</span>
          {m.estado !== 'PAGADO' && <Status kind="info">{m.estado.toLowerCase()}</Status>}
        </button>
      </li>
    );
  }
}
