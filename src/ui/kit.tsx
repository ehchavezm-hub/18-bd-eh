import { useEffect, useState, type ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export interface Opcion { value: string; label: string; group?: string }

/** Lista desplegable nativa (en el teléfono abre el selector del sistema). */
export function Select({ value, onChange, options, placeholder, required }: { value: string; onChange: (v: string) => void; options: Opcion[]; placeholder?: string; required?: boolean }) {
  const groups = new Map<string, Opcion[]>();
  const sueltas: Opcion[] = [];
  for (const o of options) { if (o.group) { const g = groups.get(o.group) ?? []; g.push(o); groups.set(o.group, g); } else sueltas.push(o); }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{placeholder ?? 'Elegir…'}</option>
      {sueltas.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {[...groups.entries()].map(([g, os]) => (
        <optgroup key={g} label={g}>{os.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Panel a pantalla completa en el teléfono y ventana centrada en la computadora. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn link" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

let toastSet: ((t: string | null) => void) | null = null;
export const toast = (t: string) => toastSet?.(t);
export function ToastHost() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => { toastSet = setT; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 2600); return () => clearTimeout(id); }, [t]);
  return t ? <div className="toast" role="status">{t}</div> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

/** Estado con icono + texto (nunca solo color). */
export function Status({ kind, children }: { kind: 'ok' | 'warn' | 'error' | 'info'; children: ReactNode }) {
  const icon = { ok: '✓', warn: '!', error: '✕', info: 'i' }[kind];
  return <span className={`badge ${kind}`}><span aria-hidden="true">{icon}</span> {children}</span>;
}
