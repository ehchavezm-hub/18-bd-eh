import type { Cuenta, Movimiento } from './model';
import { cuenta as cuentaPagado } from './model';

export interface Saldo {
  cuenta: Cuenta;
  saldo: number;
  /** false si la cuenta no tiene saldo inicial: el saldo es solo la suma de movimientos. */
  confiable: boolean;
  movimientos: number;
}

/**
 * Saldo de cada cuenta.
 * SALDO_INICIAL es el saldo al cierre de FECHA_SALDO_INICIAL; se suman los movimientos posteriores.
 * Ingreso/reembolso/ajuste suman a CUENTA_ID; egreso resta; transferencia resta en origen y suma en destino.
 */
export function calcularSaldos(cuentas: Cuenta[], movs: Movimiento[]): Map<string, Saldo> {
  const out = new Map<string, Saldo>();
  for (const c of cuentas) {
    out.set(c.id, { cuenta: c, saldo: c.saldoInicial ?? 0, confiable: c.saldoInicial !== null, movimientos: 0 });
  }
  const aplicar = (id: string | null, fecha: string, delta: number) => {
    if (!id) return;
    const s = out.get(id);
    if (!s) return;
    const desde = s.cuenta.fechaSaldoInicial;
    if (s.cuenta.saldoInicial !== null && desde && fecha <= desde) return;
    s.saldo += delta;
    s.movimientos += 1;
  };
  for (const m of movs) {
    if (!cuentaPagado(m)) continue;
    switch (m.tipo) {
      case 'INGRESO':
      case 'REEMBOLSO':
      case 'AJUSTE':
        aplicar(m.cuentaId, m.fecha, m.monto);
        break;
      case 'EGRESO':
        aplicar(m.cuentaId, m.fecha, -m.monto);
        break;
      case 'TRANSFERENCIA':
        aplicar(m.cuentaId, m.fecha, -m.monto);
        aplicar(m.cuentaDestinoId, m.fecha, m.montoDestino ?? m.monto);
        break;
    }
  }
  for (const s of out.values()) s.saldo = Math.round(s.saldo * 100) / 100;
  return out;
}

export interface Totales { disponible: Record<string, number>; deudaTarjetas: Record<string, number>; porCobrar: Record<string, number> }

/** Totales por moneda: dinero disponible (líquido), deuda de tarjetas y por cobrar. */
export function totales(saldos: Iterable<Saldo>): Totales {
  const t: Totales = { disponible: {}, deudaTarjetas: {}, porCobrar: {} };
  const add = (o: Record<string, number>, k: string, v: number) => (o[k] = Math.round(((o[k] ?? 0) + v) * 100) / 100);
  for (const s of saldos) {
    const c = s.cuenta;
    if (!c.activa) continue;
    if (c.tipo === 'TARJETA DE CRÉDITO') add(t.deudaTarjetas, c.moneda, -s.saldo);
    else if (c.clasePatrimonio === 'POR COBRAR') add(t.porCobrar, c.moneda, s.saldo);
    else if (c.clasePatrimonio === 'LÍQUIDO' && c.tipo !== 'POR CONFIRMAR') add(t.disponible, c.moneda, s.saldo);
  }
  return t;
}
