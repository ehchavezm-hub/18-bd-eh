import { useMemo, useState } from 'react';
import { useData, tipoCambioPara } from '../../data/useData';
import { save, log } from '../../data/store';
import { sugerir, autocompletar, cuentasFrecuentes } from '../../domain/suggest';
import { nowStamp, nowTime, todayIso } from '../../domain/dates';
import { dinero, parseMonto, simbolo } from '../../domain/format';
import { safeText, type Movimiento, type TipoMov } from '../../domain/model';
import { MEDIOS_PAGO, medioPorCuenta } from '../../config/lists';
import { Field, Segmented, Select, toast, type Opcion } from '../../ui/kit';
import type { Row } from '../../lib/rows';

export interface Prefill {
  tipo?: TipoMov; descripcion?: string; monto?: number | null; cuentaId?: string | null; cuentaDestinoId?: string | null;
  categoriaId?: string | null; centroId?: string | null; recurrenteId?: string | null; fecha?: string;
}

type Tipo = 'EGRESO' | 'INGRESO' | 'TRANSFERENCIA';

/** Formulario para anotar o editar un movimiento. */
export function MovementForm({ editar, prefill, device, onDone }: { editar?: Movimiento; prefill?: Prefill; device: string; onDone: () => void }) {
  const d = useData();
  const base = editar ?? null;
  const [tipo, setTipo] = useState<Tipo>(((base?.tipo ?? prefill?.tipo) as Tipo) ?? 'EGRESO');
  const [montoTxt, setMontoTxt] = useState(base ? String(base.monto) : prefill?.monto ? String(prefill.monto) : '');
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? prefill?.descripcion ?? '');
  const [cuentaId, setCuentaId] = useState(() => base?.cuentaId ?? prefill?.cuentaId
    ?? cuentasFrecuentes(d.movs).find((id) => d.cuentasById.get(id)?.activa) ?? d.cuentas.find((c) => c.activa)?.id ?? '');
  const [destinoId, setDestinoId] = useState(base?.cuentaDestinoId ?? prefill?.cuentaDestinoId ?? '');
  const [montoDestinoTxt, setMontoDestinoTxt] = useState(base?.montoDestino ? String(base.montoDestino) : '');
  const [categoriaId, setCategoriaId] = useState(base?.categoriaId ?? prefill?.categoriaId ?? '');
  const [centroId, setCentroId] = useState(base?.centroId ?? prefill?.centroId ?? (d.centros.some((c) => c.id === 'PERSONAL') ? 'PERSONAL' : ''));
  const [lugarId, setLugarId] = useState(base?.lugarId ?? '');
  const [fecha, setFecha] = useState(base?.fecha ?? prefill?.fecha ?? todayIso());
  const [hora, setHora] = useState(base?.hora ?? nowTime());
  const [medio, setMedio] = useState(base?.medioPago ?? '');
  const [notas, setNotas] = useState(base?.notas ?? '');
  const [etiquetas, setEtiquetas] = useState(base?.etiquetas ?? '');
  const [tcTxt, setTcTxt] = useState(base?.tipoCambio ? String(base.tipoCambio) : '');
  const [mas, setMas] = useState(!!base);
  /** Moneda en que pagaste. Si no la cambias, es la de la cuenta. */
  const [monedaSel, setMonedaSel] = useState<string | null>(base ? base.moneda : null);
  const [otraMoneda, setOtraMoneda] = useState(false);
  const [montoCuentaTxt, setMontoCuentaTxt] = useState('');
  const [tocado, setTocado] = useState<Set<string>>(new Set(base ? ['cuenta', 'categoria', 'centro', 'lugar', 'monto'] : prefill ? ['cuenta', 'categoria', 'centro', 'monto'] : []));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const touch = (k: string) => setTocado((s) => new Set(s).add(k));

  const cuenta = d.cuentasById.get(cuentaId);
  const destino = d.cuentasById.get(destinoId);
  const moneda = cuenta?.moneda ?? 'PEN'; // moneda de la cuenta (en la que se guarda el monto)
  const pagoEn = monedaSel ?? moneda;      // moneda en que pagaste
  const conversion = tipo !== 'TRANSFERENCIA' && pagoEn !== moneda; // pagaste en otra moneda con esta cuenta
  const montoPagado = parseMonto(montoTxt);
  const monto = conversion ? parseMonto(montoCuentaTxt) : montoPagado; // lo que se movió en la cuenta
  const tcSugerido = moneda === 'PEN' ? 1 : tipoCambioPara(d.tiposCambio, moneda, fecha);
  const tc = moneda === 'PEN' ? 1 : parseMonto(tcTxt) ?? tcSugerido;
  const otraMonedaDestino = tipo === 'TRANSFERENCIA' && destino && destino.moneda !== moneda;

  const opcionesCuenta = useMemo<Opcion[]>(() => {
    const activas = d.cuentas.filter((c) => c.activa || c.id === cuentaId || c.id === destinoId);
    const inst = new Map(d.instituciones.map((i) => [i.id, i.nombre]));
    const top = cuentasFrecuentes(d.movs).filter((id) => activas.some((c) => c.id === id)).slice(0, 5);
    if (monedaSel) {
      const enMoneda = activas.filter((c) => c.moneda === monedaSel);
      return [
        ...enMoneda.map((c) => ({ value: c.id, label: c.nombre, group: `Cuentas en ${simbolo(monedaSel)}` })),
        ...activas.filter((c) => c.moneda !== monedaSel).map((c) => ({ value: c.id, label: `${c.nombre} (${c.moneda})`, group: 'Otras monedas' })),
      ];
    }
    return [
      ...top.map((id) => ({ value: id, label: d.nombres.cuenta.get(id) ?? id, group: 'Más usadas' })),
      ...activas.filter((c) => !top.includes(c.id)).map((c) => ({ value: c.id, label: c.nombre, group: inst.get(c.institucionId) ?? c.institucionId })),
    ];
  }, [d, cuentaId, destinoId, monedaSel]);

  const opcionesCategoria = useMemo<Opcion[]>(() => {
    const padres = new Map(d.categorias.filter((c) => !c.padreId).map((c) => [c.id, c.nombre]));
    return d.categorias
      .filter((c) => c.padreId && c.tipo === tipo && (c.activa || c.id === categoriaId))
      .map((c) => ({ value: c.id, label: c.nombre, group: padres.get(c.padreId!) ?? 'Otras' }));
  }, [d, tipo, categoriaId]);

  const sugerencias = useMemo(() => (descripcion && !base ? autocompletar(descripcion, d.movs) : []), [descripcion, d.movs, base]);

  function aplicarSugerencia(texto: string) {
    const s = sugerir(texto, d.movs, d.reglas);
    if (s.categoriaId && !tocado.has('categoria') && d.categoriasById.get(s.categoriaId)?.tipo === tipo) setCategoriaId(s.categoriaId);
    if (s.centroId && !tocado.has('centro')) setCentroId(s.centroId);
    if (s.cuentaId && !tocado.has('cuenta') && d.cuentasById.get(s.cuentaId)?.activa) setCuentaId(s.cuentaId);
    if (s.lugarId && !tocado.has('lugar')) setLugarId(s.lugarId);
    if (s.monto && !tocado.has('monto') && !montoTxt) setMontoTxt(String(s.monto));
  }

  function elegirMoneda(m: string) {
    setMonedaSel(m);
    // Si la cuenta actual no es de esa moneda y no la elegiste tú, propone tu cuenta más usada en esa moneda.
    if (cuenta?.moneda !== m && !tocado.has('cuenta')) {
      const frecuentes = cuentasFrecuentes(d.movs);
      const enMoneda = d.cuentas.filter((c) => c.activa && c.moneda === m && c.tipo !== 'POR CONFIRMAR')
        .sort((a, b) => (frecuentes.indexOf(a.id) + 1 || 999) - (frecuentes.indexOf(b.id) + 1 || 999));
      if (enMoneda[0]) setCuentaId(enMoneda[0].id);
    }
  }
  const monedasActivas = d.monedas.filter((m) => m.activo);

  async function guardar() {
    setError(null);
    if (!montoPagado || montoPagado <= 0) return setError('Escribe un monto mayor que cero.');
    if (montoPagado > 100_000_000 || (monto ?? 0) > 100_000_000) return setError('El monto parece demasiado grande. Revisa que esté bien escrito.');
    if (conversion && (!monto || monto <= 0)) return setError(`Escribe cuánto se cobró en la cuenta (${simbolo(moneda)}).`);
    if (!monto) return setError('Escribe un monto mayor que cero.');
    if (!cuenta) return setError(tipo === 'INGRESO' ? 'Elige a qué cuenta entra el dinero.' : 'Elige de qué cuenta sale el dinero.');
    if (tipo === 'TRANSFERENCIA') {
      if (!destino) return setError('Elige la cuenta de destino.');
      if (destino.id === cuenta.id) return setError('La cuenta de destino debe ser distinta.');
    } else if (!categoriaId) return setError('Elige una categoría.');
    const montoDestino = tipo === 'TRANSFERENCIA' ? (otraMonedaDestino ? parseMonto(montoDestinoTxt) : monto) : null;
    if (otraMonedaDestino && !montoDestino) return setError(`Escribe cuánto llegó a la cuenta de destino (${destino!.moneda}).`);
    if (moneda !== 'PEN' && !tc) return setError(`Escribe el tipo de cambio (soles por 1 ${moneda}).`);

    const row: Row = {
      FECHA: fecha, HORA: hora, TIPO: tipo, DESCRIPCION: safeText(descripcion.trim() || (tipo === 'TRANSFERENCIA' ? 'Transferencia' : '')),
      CUENTA_ID: cuenta.id, MONTO: monto, MONEDA: moneda,
      CUENTA_DESTINO_ID: tipo === 'TRANSFERENCIA' ? destino!.id : '', MONTO_DESTINO: montoDestino ?? '', MONEDA_DESTINO: tipo === 'TRANSFERENCIA' ? destino!.moneda : '',
      TIPO_CAMBIO: tc ?? '', MONTO_PEN: tc ? Math.round(monto * tc * 100) / 100 : '',
      CATEGORIA_ID: tipo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : categoriaId, CENTRO_ID: centroId, LUGAR_ID: lugarId,
      MEDIO_PAGO: medio || medioPorCuenta(cuenta.tipo), ETIQUETAS: safeText(etiquetas.trim()), NOTAS: safeText([conversion ? `Monto original: ${simbolo(pagoEn)} ${montoPagado!.toFixed(2)}` : '', notas.trim()].filter(Boolean).join(' · ')),
      ACTUALIZADO_EN: nowStamp(),
    };
    setGuardando(true);
    try {
      if (base) {
        const patch: Row = { MOVIMIENTO_ID: base.id };
        const actual: Row = { ...base.raw, FECHA: base.fecha, HORA: base.hora ?? '' };
        for (const [k, v] of Object.entries(row)) {
          if (k === 'ACTUALIZADO_EN') continue;
          const antes = actual[k] ?? '';
          if (String(antes) !== String(v ?? '')) {
            patch[k] = v;
            await log('MOVIMIENTOS', base.id, k, antes, v, 'Edición desde la app');
          }
        }
        patch.ACTUALIZADO_EN = row.ACTUALIZADO_EN;
        await save('MOVIMIENTOS', patch, 'update');
        toast('Cambios guardados');
      } else {
        await save('MOVIMIENTOS', {
          MOVIMIENTO_ID: crypto.randomUUID(), ESTADO: 'PAGADO', ...row, RECURRENTE_ID: prefill?.recurrenteId ?? '', CONCILIADO: 'NO',
          ORIGEN: 'APP', CREADO_EN: nowStamp(), ELIMINADO: 'NO', DISPOSITIVO: device, EVIDENCIA: 'REPORTADO',
        });
        if (moneda !== 'PEN' && tc && tc !== tcSugerido) {
          await save('TIPO_CAMBIO', { FECHA: fecha, MONEDA: moneda, COMPRA: '', VENTA: tc, FUENTE: 'Ingresado en la app' });
        }
        toast(navigator.onLine ? 'Guardado' : 'Guardado en el teléfono. Se enviará al volver la conexión.');
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function anular() {
    if (!base || !confirm('¿Anular este movimiento? Dejará de contar en saldos y reportes, pero quedará en el historial.')) return;
    await save('MOVIMIENTOS', { MOVIMIENTO_ID: base.id, ESTADO: 'ANULADO', ACTUALIZADO_EN: nowStamp() }, 'update');
    await log('MOVIMIENTOS', base.id, 'ESTADO', base.estado, 'ANULADO', 'Anulado desde la app');
    toast('Movimiento anulado');
    onDone();
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <Segmented<Tipo> value={tipo} onChange={(v) => { setTipo(v); setCategoriaId(''); }} options={[
        { value: 'EGRESO', label: 'Gasto' }, { value: 'INGRESO', label: 'Ingreso' }, { value: 'TRANSFERENCIA', label: 'Transferencia' },
      ]} />

      <Field label={`Monto (${simbolo(pagoEn)})`}>
        <input className="amount" inputMode="decimal" placeholder="0.00" value={montoTxt} autoFocus={!base}
          onChange={(e) => { setMontoTxt(e.target.value); touch('monto'); }} />
      </Field>
      {tipo !== 'TRANSFERENCIA' && (
        <div className="currency">
          <span className="field-label">Moneda</span>
          <div className="chips">
            {['PEN', 'USD'].map((m) => (
              <button type="button" key={m} className={`chip${pagoEn === m && !otraMoneda ? ' on' : ''}`} onClick={() => { setOtraMoneda(false); elegirMoneda(m); }}>
                {m === 'PEN' ? 'S/ Soles' : 'US$ Dólares'}
              </button>
            ))}
            <button type="button" className={`chip${otraMoneda || !['PEN', 'USD'].includes(pagoEn) ? ' on' : ''}`} onClick={() => setOtraMoneda(true)}>Otra</button>
          </div>
          {(otraMoneda || !['PEN', 'USD'].includes(pagoEn)) && (
            <Select value={pagoEn} onChange={(v) => v && elegirMoneda(v)} options={monedasActivas.map((m) => ({ value: m.id, label: `${m.id} · ${m.nombre}` }))} />
          )}
        </div>
      )}

      <Field label="Descripción">
        <input value={descripcion} placeholder={tipo === 'EGRESO' ? 'Ej. Taxi, Wong, Menú' : tipo === 'INGRESO' ? 'Ej. Sueldo' : 'Ej. Pago tarjeta'}
          autoCapitalize="sentences" maxLength={140}
          onChange={(e) => setDescripcion(e.target.value)} onBlur={() => aplicarSugerencia(descripcion)} />
      </Field>
      {sugerencias.length > 0 && (
        <div className="chips">
          {sugerencias.map((s) => (
            <button type="button" key={s} className="chip" onClick={() => { setDescripcion(s); aplicarSugerencia(s); }}>{s}</button>
          ))}
        </div>
      )}

      <Field label={tipo === 'INGRESO' ? 'Entra a la cuenta' : tipo === 'TRANSFERENCIA' ? 'Sale de la cuenta' : 'Pagado con'}>
        <Select value={cuentaId} onChange={(v) => { setCuentaId(v); touch('cuenta'); }} options={opcionesCuenta} placeholder="Elegir cuenta…" />
      </Field>

      {tipo === 'TRANSFERENCIA' ? (
        <>
          <Field label="Llega a la cuenta">
            <Select value={destinoId} onChange={setDestinoId} options={opcionesCuenta.filter((o) => o.value !== cuentaId)} placeholder="Elegir cuenta…" />
          </Field>
          {otraMonedaDestino && (
            <Field label={`Monto que llegó (${simbolo(destino!.moneda)})`} hint="Cambio de moneda: escribe lo que recibió la cuenta de destino.">
              <input inputMode="decimal" value={montoDestinoTxt} onChange={(e) => setMontoDestinoTxt(e.target.value)} />
            </Field>
          )}
        </>
      ) : (
        <Field label="Categoría">
          <Select value={categoriaId} onChange={(v) => { setCategoriaId(v); touch('categoria'); }} options={opcionesCategoria} placeholder="Elegir categoría…" />
        </Field>
      )}

      <Field label="Para quién / centro">
        <Select value={centroId} onChange={(v) => { setCentroId(v); touch('centro'); }}
          options={d.centros.filter((c) => c.activo || c.id === centroId).map((c) => ({ value: c.id, label: c.nombre }))} />
      </Field>

      {conversion && cuenta && (
        <Field label={`¿Cuánto se cobró en ${cuenta.nombre}? (${simbolo(moneda)})`}
          hint={`Pagaste en ${pagoEn} con una cuenta en ${moneda}. Escribe lo que se descontó de la cuenta (míralo en tu banco o voucher). El monto en ${pagoEn} quedará en las notas.`}>
          <input inputMode="decimal" placeholder="0.00" value={montoCuentaTxt} onChange={(e) => setMontoCuentaTxt(e.target.value)} />
        </Field>
      )}

      {moneda !== 'PEN' && (
        <Field label={`Tipo de cambio (S/ por 1 ${moneda})`} hint={monto && tc ? `Equivale a ${dinero(monto * tc)}` : tcSugerido ? `Último conocido: ${tcSugerido}` : 'No hay tipo de cambio guardado: escríbelo.'}>
          <input inputMode="decimal" placeholder={tcSugerido ? String(tcSugerido) : '3.75'} value={tcTxt} onChange={(e) => setTcTxt(e.target.value)} />
        </Field>
      )}

      <button type="button" className="btn link" onClick={() => setMas(!mas)} aria-expanded={mas}>{mas ? 'Menos detalles' : 'Más detalles (fecha, lugar, notas)'}</button>
      {mas && (
        <div className="stack">
          <div className="grid2">
            <Field label="Fecha"><input type="date" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} /></Field>
            <Field label="Hora"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
          </div>
          <Field label="Lugar">
            <Select value={lugarId} onChange={(v) => { setLugarId(v); touch('lugar'); }} options={d.lugares.filter((l) => l.activo || l.id === lugarId).map((l) => ({ value: l.id, label: l.nombre }))} placeholder="(sin lugar)" />
          </Field>
          <Field label="Medio de pago">
            <Select value={medio} onChange={setMedio} options={MEDIOS_PAGO.map((m) => ({ value: m, label: m.charAt(0) + m.slice(1).toLowerCase() }))} placeholder={cuenta ? `Automático (${medioPorCuenta(cuenta.tipo).toLowerCase()})` : 'Automático'} />
          </Field>
          <Field label="Etiquetas" hint="Separadas por coma. Ej. viaje-cusco, cumple-mamá"><input value={etiquetas} maxLength={120} onChange={(e) => setEtiquetas(e.target.value)} /></Field>
          <Field label="Notas"><input value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} /></Field>
        </div>
      )}

      {error && <div className="msg error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : base ? 'Guardar cambios' : 'Guardar'}</button>
      {base && base.estado !== 'ANULADO' && <button type="button" className="btn secondary danger" onClick={anular}>Anular movimiento</button>}
    </form>
  );
}
