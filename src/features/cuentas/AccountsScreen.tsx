import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import { save, log } from '../../data/store';
import { calcularSaldos, totales, type Saldo } from '../../domain/balances';
import { nowStamp, todayIso } from '../../domain/dates';
import { dinero, parseMonto } from '../../domain/format';
import { Meter } from '../../ui/charts';
import { Field, Sheet, Status, toast } from '../../ui/kit';
import { colorInstitucion } from '../../ui/colors';
import type { CSSProperties } from 'react';

/** D4 · Cuentas: ¿cuánto tengo y cuánto debo? */
export function AccountsScreen({ onVerMovimientos }: { onVerMovimientos: (cuentaId: string) => void }) {
  const d = useData();
  const [inactivas, setInactivas] = useState(false);
  const [ajustar, setAjustar] = useState<Saldo | null>(null);
  const saldos = useMemo(() => calcularSaldos(d.cuentas, d.movs), [d]);
  const t = useMemo(() => totales(saldos.values()), [saldos]);
  const inst = new Map(d.instituciones.map((i) => [i.id, i.nombre]));

  const grupos = new Map<string, Saldo[]>();
  for (const s of saldos.values()) {
    if (!inactivas && !s.cuenta.activa) continue;
    const g = s.cuenta.tipo === 'TARJETA DE CRÉDITO' ? 'Tarjetas de crédito' : s.cuenta.clasePatrimonio === 'POR COBRAR' ? 'Por cobrar' : s.cuenta.tipo === 'POR CONFIRMAR' ? 'Por confirmar' : 'Dinero disponible';
    (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(s);
  }
  const orden = ['Dinero disponible', 'Tarjetas de crédito', 'Por cobrar', 'Por confirmar'];

  return (
    <main className="screen">
      <h1>Cuentas</h1>
      <div className="kpis">
        <div className="card kpi"><span className="muted small">Disponible</span>{Object.entries(t.disponible).map(([m, v]) => <strong key={m}>{dinero(v, m)}</strong>)}</div>
        <div className="card kpi"><span className="muted small">Deuda tarjetas</span>{Object.entries(t.deudaTarjetas).map(([m, v]) => <strong key={m}>{dinero(v, m)}</strong>)}{Object.keys(t.deudaTarjetas).length === 0 && <strong>—</strong>}</div>
        <div className="card kpi"><span className="muted small">Por cobrar</span>{Object.entries(t.porCobrar).map(([m, v]) => <strong key={m}>{dinero(v, m)}</strong>)}{Object.keys(t.porCobrar).length === 0 && <strong>—</strong>}</div>
      </div>

      {orden.filter((g) => grupos.has(g)).map((g) => (
        <section key={g} className="card stack">
          <h2>{g}</h2>
          <ul className="plain">
            {grupos.get(g)!.map((s) => {
              const c = s.cuenta;
              const tarjeta = c.tipo === 'TARJETA DE CRÉDITO';
              const valor = tarjeta ? -s.saldo : s.saldo;
              return (
                <li key={c.id} className="acct">
                  <button type="button" className="acct-main" onClick={() => onVerMovimientos(c.id)}>
                    <span className="acct-title"><span className="avatar sm" style={{ '--c': colorInstitucion(c.institucionId) } as CSSProperties} aria-hidden="true">{(inst.get(c.institucionId) ?? c.institucionId).charAt(0)}</span><span className="clamp2">{c.nombre}</span>{!c.activa && <span className="muted small"> (inactiva)</span>}</span>
                    <span className="muted small">{inst.get(c.institucionId) ?? c.institucionId} · {c.moneda}</span>
                  </button>
                  <div className="acct-side">
                    <strong className={valor < 0 && !tarjeta ? 'neg' : ''}>{dinero(valor, c.moneda)}</strong>
                    {!s.confiable && <button className="btn link small" onClick={() => setAjustar(s)}>Fijar saldo</button>}
                  </div>
                  {tarjeta && c.limite ? (
                    <div className="acct-meter"><Meter value={valor} max={c.limite} label={`Uso del límite de ${c.nombre}`} /><span className="muted small">{Math.round((valor / c.limite) * 100)} % de {dinero(c.limite, c.moneda, false)}</span></div>
                  ) : null}
                  {!s.confiable && <div className="acct-warn"><Status kind="warn">Sin saldo inicial: el saldo es solo la suma de movimientos</Status></div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <label className="check"><input type="checkbox" checked={inactivas} onChange={(e) => setInactivas(e.target.checked)} /> Mostrar cuentas inactivas</label>
      {ajustar && <FijarSaldo s={ajustar} onClose={() => setAjustar(null)} />}
    </main>
  );
}

/** Fija el saldo real de hoy: queda como saldo inicial al cierre de hoy. */
function FijarSaldo({ s, onClose }: { s: Saldo; onClose: () => void }) {
  const tarjeta = s.cuenta.tipo === 'TARJETA DE CRÉDITO';
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function guardar() {
    const v = parseMonto(txt);
    if (v === null) return setErr('Escribe el saldo.');
    const saldo = tarjeta ? -Math.abs(v) : v;
    const hoy = todayIso();
    await save('CUENTAS', { CUENTA_ID: s.cuenta.id, SALDO_INICIAL: saldo, FECHA_SALDO_INICIAL: hoy }, 'update');
    await log('CUENTAS', s.cuenta.id, 'SALDO_INICIAL', s.cuenta.saldoInicial, `${saldo} al ${hoy} (${nowStamp()})`, 'Saldo fijado desde la app');
    toast('Saldo guardado');
    onClose();
  }
  return (
    <Sheet title={`Saldo de ${s.cuenta.nombre}`} onClose={onClose}>
      <div className="stack">
        <p className="muted">{tarjeta ? 'Escribe cuánto debes hoy en esta tarjeta' : 'Escribe el saldo que muestra hoy tu banco'}, después de los movimientos de hoy. Desde mañana la app lo actualizará con lo que registres.</p>
        <Field label={`${tarjeta ? 'Deuda' : 'Saldo'} al cierre de hoy (${s.cuenta.moneda})`}>
          <input className="amount" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus />
        </Field>
        {err && <div className="msg error">{err}</div>}
        <button className="btn" onClick={guardar}>Guardar saldo</button>
      </div>
    </Sheet>
  );
}
