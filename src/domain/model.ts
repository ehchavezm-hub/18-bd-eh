/**
 * Modelo de la app: convierte las filas de la hoja en objetos tipados y al revés.
 * Los nombres de columnas son los del esquema v3 (no cambian).
 */
import type { Row } from '../lib/rows';
import { isYes } from '../lib/rows';
import { toIsoDate, toTime } from './dates';

export type TipoMov = 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'REEMBOLSO' | 'AJUSTE';
export type EstadoMov = 'PAGADO' | 'PROGRAMADO' | 'OMITIDO' | 'ANULADO';

export interface Movimiento {
  id: string;
  fecha: string; // AAAA-MM-DD
  hora: string | null;
  tipo: TipoMov;
  estado: EstadoMov;
  descripcion: string;
  cuentaId: string;
  monto: number;
  moneda: string;
  cuentaDestinoId: string | null;
  montoDestino: number | null;
  monedaDestino: string | null;
  tipoCambio: number | null;
  montoPen: number | null;
  categoriaId: string | null;
  centroId: string | null;
  lugarId: string | null;
  medioPago: string | null;
  etiquetas: string | null;
  recurrenteId: string | null;
  notas: string | null;
  eliminado: boolean;
  raw: Row;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const strOrNull = (v: unknown) => str(v) || null;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function toMovimiento(r: Row): Movimiento | null {
  const fecha = toIsoDate(r.FECHA);
  const id = str(r.MOVIMIENTO_ID);
  if (!id || !fecha) return null;
  return {
    id,
    fecha,
    hora: toTime(r.HORA),
    tipo: (str(r.TIPO) || 'EGRESO') as TipoMov,
    estado: (str(r.ESTADO) || 'PAGADO') as EstadoMov,
    descripcion: str(r.DESCRIPCION),
    cuentaId: str(r.CUENTA_ID),
    monto: num(r.MONTO) ?? 0,
    moneda: str(r.MONEDA) || 'PEN',
    cuentaDestinoId: strOrNull(r.CUENTA_DESTINO_ID),
    montoDestino: num(r.MONTO_DESTINO),
    monedaDestino: strOrNull(r.MONEDA_DESTINO),
    tipoCambio: num(r.TIPO_CAMBIO),
    montoPen: num(r.MONTO_PEN),
    categoriaId: strOrNull(r.CATEGORIA_ID),
    centroId: strOrNull(r.CENTRO_ID),
    lugarId: strOrNull(r.LUGAR_ID),
    medioPago: strOrNull(r.MEDIO_PAGO),
    etiquetas: strOrNull(r.ETIQUETAS),
    recurrenteId: strOrNull(r.RECURRENTE_ID),
    notas: strOrNull(r.NOTAS),
    eliminado: isYes(r.ELIMINADO),
    raw: r,
  };
}

/** Cuenta para el cálculo: solo movimientos pagados y no eliminados. */
export const cuenta = (m: Movimiento) => m.estado === 'PAGADO' && !m.eliminado;

/** Monto en soles: usa MONTO_PEN; si falta y la moneda es PEN, el monto. Si no hay tipo de cambio, null. */
export function enSoles(m: Pick<Movimiento, 'monto' | 'moneda' | 'montoPen' | 'tipoCambio'>): number | null {
  if (m.montoPen !== null) return m.montoPen;
  if (m.moneda === 'PEN') return m.monto;
  if (m.tipoCambio) return m.monto * m.tipoCambio;
  return null;
}

export interface Cuenta {
  id: string; nombre: string; institucionId: string; tipo: string; moneda: string;
  saldoInicial: number | null; fechaSaldoInicial: string | null; limite: number | null;
  diaCorte: number | null; diaPago: number | null; activa: boolean; clasePatrimonio: string; orden: number;
}

export function toCuenta(r: Row): Cuenta {
  return {
    id: str(r.CUENTA_ID), nombre: str(r.NOMBRE) || str(r.CUENTA_ID), institucionId: str(r.INSTITUCION_ID),
    tipo: str(r.TIPO_CUENTA), moneda: str(r.MONEDA) || 'PEN', saldoInicial: num(r.SALDO_INICIAL),
    fechaSaldoInicial: toIsoDate(r.FECHA_SALDO_INICIAL), limite: num(r.LIMITE_CREDITO),
    diaCorte: num(r.DIA_CORTE), diaPago: num(r.DIA_PAGO), activa: isYes(r.ACTIVA),
    clasePatrimonio: str(r.CLASE_PATRIMONIO) || 'LÍQUIDO', orden: num(r.ORDEN) ?? 999,
  };
}

export interface Categoria { id: string; nombre: string; tipo: string; padreId: string | null; clase: string; tipo503020: string | null; activa: boolean; orden: number; color: string | null; icono: string | null; fijoVariable: string | null }
export function toCategoria(r: Row): Categoria {
  return {
    id: str(r.CATEGORIA_ID), nombre: str(r.NOMBRE) || str(r.CATEGORIA_ID), tipo: str(r.TIPO), padreId: strOrNull(r.CATEGORIA_PADRE_ID),
    clase: str(r.CLASE), tipo503020: strOrNull(r.TIPO_50_30_20), activa: isYes(r.ACTIVA), orden: num(r.ORDEN) ?? 999,
    color: /^#[0-9a-f]{6}$/i.test(str(r.COLOR)) ? str(r.COLOR) : null, icono: strOrNull(r.ICONO), fijoVariable: strOrNull(r.FIJO_VARIABLE),
  };
}

export interface Simple { id: string; nombre: string; activo: boolean }
export const toSimple = (idCol: string, activeCol = 'ACTIVO') => (r: Row): Simple => ({
  id: str(r[idCol]), nombre: str(r.NOMBRE) || str(r[idCol]), activo: r[activeCol] === undefined ? true : isYes(r[activeCol]),
});

export interface Recurrente {
  id: string; descripcion: string; tipo: TipoMov; montoEstimado: number | null; moneda: string; cuentaId: string | null;
  cuentaDestinoId: string | null; categoriaId: string | null; centroId: string | null; frecuencia: string; dia: number | null;
  fechaInicio: string | null; fechaFin: string | null; avisarDiasAntes: number; activo: boolean; tipoRecurrente: string | null;
}
export function toRecurrente(r: Row): Recurrente {
  return {
    id: str(r.RECURRENTE_ID), descripcion: str(r.DESCRIPCION), tipo: (str(r.TIPO) || 'EGRESO') as TipoMov,
    montoEstimado: num(r.MONTO_ESTIMADO), moneda: str(r.MONEDA) || 'PEN', cuentaId: strOrNull(r.CUENTA_ID),
    cuentaDestinoId: strOrNull(r.CUENTA_DESTINO_ID), categoriaId: strOrNull(r.CATEGORIA_ID), centroId: strOrNull(r.CENTRO_ID),
    frecuencia: str(r.FRECUENCIA) || 'MENSUAL', dia: num(r.DIA), fechaInicio: toIsoDate(r.FECHA_INICIO), fechaFin: toIsoDate(r.FECHA_FIN),
    avisarDiasAntes: num(r.AVISAR_DIAS_ANTES) ?? 3, activo: isYes(r.ACTIVO), tipoRecurrente: strOrNull(r.TIPO_RECURRENTE),
  };
}

export interface Regla { patron: string; categoriaId: string; centroId: string | null; prioridad: number; activa: boolean }
export function toRegla(r: Row): Regla {
  return { patron: str(r.PATRON).toLowerCase(), categoriaId: str(r.CATEGORIA_ID), centroId: strOrNull(r.CENTRO_ID), prioridad: num(r.PRIORIDAD) ?? 999, activa: isYes(r.ACTIVA) };
}

export interface TipoCambio { fecha: string; moneda: string; venta: number }
export function toTipoCambio(r: Row): TipoCambio | null {
  const fecha = toIsoDate(r.FECHA); const venta = num(r.VENTA) ?? num(r.COMPRA);
  return fecha && venta ? { fecha, moneda: str(r.MONEDA), venta } : null;
}

/** Evita que un texto escrito por el usuario se interprete como fórmula en la hoja. */
export function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
