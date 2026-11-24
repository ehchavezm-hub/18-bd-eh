/**
 * Editor genérico de catálogos (bancos, cuentas, categorías, centros, lugares, pagos fijos, reglas).
 * Nada se borra: se desactiva. Cada cambio queda en la bitácora.
 */
import { useMemo, useState } from 'react';
import { useStore, save, log, idColumn } from '../../data/store';
import type { TableName } from '../../config/schema';
import type { Row } from '../../lib/rows';
import { isYes } from '../../lib/rows';
import { toIsoDate } from '../../domain/dates';
import { parseMonto } from '../../domain/format';
import { safeText } from '../../domain/model';
import { normalizar } from '../../domain/suggest';
import { Field, Select, Sheet, Status, toast, type Opcion } from '../../ui/kit';

export interface Campo {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'yesno';
  options?: Opcion[] | (() => Opcion[]);
  required?: boolean;
  hint?: string;
}

export interface CatalogSpec {
  table: TableName;
  titulo: string;
  campos: Campo[];
  /** Columna SÍ/NO que indica si está activo (no se borra nada). */
  activoCol: string;
  /** Texto principal y secundario de cada fila de la lista. */
  resumen: (r: Row) => { titulo: string; detalle?: string };
  /** Cómo generar el ID de un registro nuevo. */
  nuevoId: (r: Row, existentes: Set<string>) => string;
  defaults?: Row;
}

export const slugId = (base: string, existentes: Set<string>) => {
  const s = normalizar(base).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'NUEVO';
  let id = s, i = 2;
  while (existentes.has(id)) id = `${s}-${i++}`;
  return id;
};
export const secuenciaId = (prefijo: string) => (_: Row, existentes: Set<string>) => {
  let n = 1;
  for (const id of existentes) { const m = id.match(new RegExp(`^${prefijo}-(\\d+)$`)); if (m) n = Math.max(n, +m[1] + 1); }
  return `${prefijo}-${String(n).padStart(3, '0')}`;
};

export function CatalogEditor({ spec, onBack }: { spec: CatalogSpec; onBack: () => void }) {
  const { tables } = useStore();
  const rows = tables[spec.table] ?? [];
  const idCol = idColumn(spec.table);
  const [buscar, setBuscar] = useState('');
  // Si todo está inactivo (por ejemplo, los pagos fijos detectados del historial), mostrarlos para poder activarlos.
  const [inactivos, setInactivos] = useState(() => rows.length > 0 && !rows.some((r) => isYes(r[spec.activoCol])));
  const [editando, setEditando] = useState<Row | 'nuevo' | null>(null);

  const visibles = useMemo(() => {
    const t = normalizar(buscar);
    return rows
      .filter((r) => inactivos || isYes(r[spec.activoCol]))
      .filter((r) => !t || normalizar(`${r[idCol]} ${spec.resumen(r).titulo} ${spec.resumen(r).detalle ?? ''}`).includes(t));
  }, [rows, buscar, inactivos, spec, idCol]);

  return (
    <main className="screen">
      <div className="row"><button className="btn link" onClick={onBack}>‹ Configuración</button></div>
      <div className="row"><h1>{spec.titulo}</h1><button className="btn small" onClick={() => setEditando('nuevo')}>+ Agregar</button></div>
      <div className="card stack">
        <input type="search" placeholder="Buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <label className="check"><input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} /> Mostrar inactivos</label>
      </div>
      <section className="card">
        <ul className="plain">
          {visibles.map((r) => {
            const s = spec.resumen(r);
            return (
              <li key={String(r[idCol])}>
                <button type="button" className="mov" onClick={() => setEditando(r)}>
                  <span className="mov-main"><span className="mov-desc">{s.titulo}</span>{s.detalle && <span className="muted small">{s.detalle}</span>}</span>
                  {!isYes(r[spec.activoCol]) && <Status kind="info">Inactivo</Status>}
                </button>
              </li>
            );
          })}
        </ul>
        {visibles.length === 0 && <p className="muted">Sin resultados.</p>}
      </section>
      {editando && <EditForm spec={spec} row={editando === 'nuevo' ? null : editando} existentes={new Set(rows.map((r) => String(r[idCol])))} onClose={() => setEditando(null)} />}
    </main>
  );
}

function EditForm({ spec, row, existentes, onClose }: { spec: CatalogSpec; row: Row | null; existentes: Set<string>; onClose: () => void }) {
  const idCol = idColumn(spec.table);
  const inicial: Record<string, string> = {};
  for (const c of spec.campos) {
    const v = row ? row[c.key] : spec.defaults?.[c.key];
    inicial[c.key] = v === null || v === undefined ? '' : c.type === 'date' ? toIsoDate(v) ?? '' : c.type === 'yesno' ? (isYes(v) ? 'SÍ' : 'NO') : String(v);
  }
  if (!row) inicial[spec.activoCol] = 'SÍ';
  const [vals, setVals] = useState(inicial);
  const [err, setErr] = useState<string | null>(null);
  const setV = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  async function guardar() {
    setErr(null);
    for (const c of spec.campos) if (c.required && !vals[c.key]?.trim()) return setErr(`Completa: ${c.label}.`);
    const out: Row = {};
    for (const c of spec.campos) {
      const v = vals[c.key] ?? '';
      if (c.type === 'number') { if (v.trim() === '') out[c.key] = ''; else { const n = parseMonto(v); if (n === null) return setErr(`${c.label}: número no válido.`); out[c.key] = n; } }
      else out[c.key] = c.type === 'text' ? safeText(v.trim()) : v;
    }
    if (row) {
      const patch: Row = { [idCol]: row[idCol] };
      for (const [k, v] of Object.entries(out)) {
        const antes = spec.campos.find((c) => c.key === k)?.type === 'date' ? toIsoDate(row[k]) ?? '' : row[k] ?? '';
        if (String(antes) !== String(v)) { patch[k] = v; await log(spec.table, String(row[idCol]), k, antes, v, 'Configuración'); }
      }
      if (Object.keys(patch).length > 1) await save(spec.table, patch, 'update');
      toast('Cambios guardados');
    } else {
      const nuevo: Row = { ...spec.defaults, ...out };
      nuevo[idCol] = spec.nuevoId(nuevo, existentes);
      await save(spec.table, nuevo, 'append');
      await log(spec.table, String(nuevo[idCol]), '*', '', 'creado', 'Configuración');
      toast('Agregado');
    }
    onClose();
  }

  return (
    <Sheet title={row ? `Editar · ${spec.resumen(row).titulo}` : `Agregar a ${spec.titulo}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        {row && <p className="muted small">ID: {String(row[idCol])} (no cambia)</p>}
        {spec.campos.map((c) => (
          <Field key={c.key} label={c.label + (c.required ? ' *' : '')} hint={c.hint}>
            {c.type === 'select' ? <Select value={vals[c.key] ?? ''} onChange={(v) => setV(c.key, v)} options={typeof c.options === 'function' ? c.options() : c.options ?? []} />
              : c.type === 'yesno' ? <Select value={vals[c.key] ?? ''} onChange={(v) => setV(c.key, v)} options={[{ value: 'SÍ', label: 'Sí' }, { value: 'NO', label: 'No' }]} />
              : <input type={c.type === 'date' ? 'date' : 'text'} inputMode={c.type === 'number' ? 'decimal' : undefined} value={vals[c.key] ?? ''} onChange={(e) => setV(c.key, e.target.value)} />}
          </Field>
        ))}
        {err && <div className="msg error">{err}</div>}
        <button className="btn" type="submit">{row ? 'Guardar cambios' : 'Agregar'}</button>
      </form>
    </Sheet>
  );
}
