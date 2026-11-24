import { describe, expect, it } from 'vitest';
import { serialToIsoDate, serialToTime, toIsoDate, addMonths, dayLabel } from '../domain/dates';
import { toMovimiento, toCuenta, enSoles, safeText, type Movimiento } from '../domain/model';
import { calcularSaldos, totales } from '../domain/balances';
import { sugerir, autocompletar } from '../domain/suggest';
import { fechasEntre, ocurrencias } from '../domain/recurring';
import { resumenMes, gastoPor, acumuladoDiario, regla503020 } from '../domain/reports';
import { parseMonto, dinero } from '../domain/format';
import type { Row } from '../lib/rows';

const mov = (p: Partial<Row>): Movimiento => toMovimiento({ MOVIMIENTO_ID: Math.random().toString(36), FECHA: '2026-11-10', TIPO: 'EGRESO', ESTADO: 'PAGADO', CUENTA_ID: 'BCP', MONTO: 10, MONEDA: 'PEN', ELIMINADO: 'NO', ...p })!;

describe('fechas', () => {
  it('convierte números de serie de Sheets', () => {
    expect(serialToIsoDate(46350)).toBe('2026-11-24');
    expect(serialToTime(46350.5)).toBe('12:00');
  });
  it('lee dd/mm/aaaa y ISO', () => {
    expect(toIsoDate('24/11/2026')).toBe('2026-11-24');
    expect(toIsoDate('2026-1-5')).toBe('2026-01-05');
    expect(toIsoDate('')).toBeNull();
  });
  it('suma meses y etiqueta días', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(dayLabel('2026-11-24', '2026-11-24')).toBe('Hoy');
    expect(dayLabel('2026-11-23', '2026-11-24')).toBe('Ayer');
  });
});

describe('modelo', () => {
  it('ignora filas sin ID o sin fecha', () => {
    expect(toMovimiento({ MOVIMIENTO_ID: 'x' })).toBeNull();
  });
  it('monto en soles', () => {
    expect(enSoles({ monto: 10, moneda: 'USD', montoPen: null, tipoCambio: 3.8 })).toBeCloseTo(38);
    expect(enSoles({ monto: 10, moneda: 'USD', montoPen: null, tipoCambio: null })).toBeNull();
    expect(enSoles({ monto: 10, moneda: 'PEN', montoPen: null, tipoCambio: null })).toBe(10);
  });
  it('protege contra fórmulas', () => {
    expect(safeText('=IMPORTXML("x")')).toBe(`'=IMPORTXML("x")`);
    expect(safeText('Taxi')).toBe('Taxi');
  });
});

describe('saldos', () => {
  const bcp = toCuenta({ CUENTA_ID: 'BCP', TIPO_CUENTA: 'AHORRO', MONEDA: 'PEN', SALDO_INICIAL: 1000, FECHA_SALDO_INICIAL: '2026-11-01', ACTIVA: 'SÍ', CLASE_PATRIMONIO: 'LÍQUIDO' });
  const tc = toCuenta({ CUENTA_ID: 'TC', TIPO_CUENTA: 'TARJETA DE CRÉDITO', MONEDA: 'PEN', SALDO_INICIAL: 0, FECHA_SALDO_INICIAL: '2026-11-01', ACTIVA: 'SÍ', CLASE_PATRIMONIO: 'DEUDA' });
  it('aplica egresos, ingresos y transferencias después del saldo inicial', () => {
    const s = calcularSaldos([bcp, tc], [
      mov({ FECHA: '2026-10-31', MONTO: 999 }), // antes del corte: no cuenta
      mov({ FECHA: '2026-11-01', MONTO: 999 }), // el mismo día del corte: ya incluido en el saldo inicial
      mov({ MONTO: 100 }),
      mov({ TIPO: 'INGRESO', MONTO: 50 }),
      mov({ CUENTA_ID: 'TC', MONTO: 200 }),
      mov({ TIPO: 'TRANSFERENCIA', CUENTA_ID: 'BCP', CUENTA_DESTINO_ID: 'TC', MONTO: 150 }),
      mov({ MONTO: 70, ESTADO: 'ANULADO' }),
      mov({ MONTO: 70, ELIMINADO: 'SÍ' }),
    ]);
    expect(s.get('BCP')!.saldo).toBe(800);
    expect(s.get('TC')!.saldo).toBe(-50);
    const t = totales(s.values());
    expect(t.disponible.PEN).toBe(800);
    expect(t.deudaTarjetas.PEN).toBe(50);
  });
});

describe('sugerencias', () => {
  const hist = [mov({ DESCRIPCION: 'Taxi', CATEGORIA_ID: 'MOVILIDAD', FECHA: '2026-01-01' }), mov({ DESCRIPCION: 'Taxi', CATEGORIA_ID: 'MOV2', CUENTA_ID: 'EFE', FECHA: '2026-02-01' })];
  it('usa el último registro con la misma descripción', () => {
    const s = sugerir('taxi', hist, []);
    expect(s).toMatchObject({ categoriaId: 'MOV2', cuentaId: 'EFE', origen: 'historial' });
  });
  it('si no hay historial, aplica reglas', () => {
    const s = sugerir('Wong comestibles', [], [{ patron: 'wong', categoriaId: 'COMESTIBLES', centroId: null, prioridad: 1, activa: true }]);
    expect(s).toMatchObject({ categoriaId: 'COMESTIBLES', origen: 'regla' });
  });
  it('autocompleta sin tildes ni mayúsculas', () => {
    expect(autocompletar('tax', [mov({ DESCRIPCION: 'Taxi oficina' }), mov({ DESCRIPCION: 'Menú' })])).toEqual(['Taxi oficina']);
  });
});

describe('pagos fijos', () => {
  const rec = { id: 'R1', descripcion: 'Luz', tipo: 'EGRESO' as const, montoEstimado: 100, moneda: 'PEN', cuentaId: 'BCP', cuentaDestinoId: null, categoriaId: 'SERVICIOS', centroId: null, frecuencia: 'MENSUAL', dia: 31, fechaInicio: '2026-01-15', fechaFin: null, avisarDiasAntes: 3, activo: true, tipoRecurrente: 'SERVICIO' };
  it('ajusta el día al último día del mes', () => {
    expect(fechasEntre(rec, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('respeta frecuencia bimestral desde el mes de inicio', () => {
    expect(fechasEntre({ ...rec, frecuencia: 'BIMESTRAL', dia: 5 }, '2026-02-01', '2026-07-31')).toEqual(['2026-03-05', '2026-05-05', '2026-07-05']);
  });
  it('marca pagado, vencido y próximo', () => {
    const pagado = mov({ RECURRENTE_ID: 'R1', FECHA: '2026-10-29' });
    const o = ocurrencias([{ ...rec, dia: 30 }], [pagado], '2026-10-01', '2026-12-31', '2026-11-28');
    expect(o.map((x) => x.estado)).toEqual(['PAGADO', 'PRÓXIMO', 'PENDIENTE']);
    const o2 = ocurrencias([{ ...rec, dia: 20 }], [], '2026-11-01', '2026-11-30', '2026-11-28');
    expect(o2[0].estado).toBe('VENCIDO');
  });
});

describe('reportes', () => {
  const movs = [
    mov({ MONTO: 100, CATEGORIA_ID: 'A', FECHA: '2026-11-02' }),
    mov({ MONTO: 50, CATEGORIA_ID: 'B', FECHA: '2026-11-03' }),
    mov({ MONTO: 20, CATEGORIA_ID: 'A', FECHA: '2026-11-03', MONEDA: 'USD' }), // sin tipo de cambio
    mov({ TIPO: 'INGRESO', MONTO: 500, FECHA: '2026-11-01' }),
    mov({ TIPO: 'TRANSFERENCIA', MONTO: 999, CUENTA_DESTINO_ID: 'X' }),
  ];
  it('resume el mes sin contar transferencias', () => {
    expect(resumenMes(movs, '2026-11')).toEqual({ mes: '2026-11', ingresos: 500, egresos: 150, sinTipoCambio: 1 });
  });
  it('agrupa por categoría de mayor a menor', () => {
    expect(gastoPor(movs, '2026-11', 'categoriaId', new Map([['A', 'Alfa']])).map((p) => [p.nombre, p.valor])).toEqual([['Alfa', 100], ['B', 50]]);
  });
  it('acumula por día', () => {
    expect(acumuladoDiario(movs, '2026-11', 4)).toEqual([0, 100, 150, 150]);
  });
  it('reparte 50/30/20', () => {
    const cats = new Map([['A', { id: 'A', nombre: 'A', tipo: 'EGRESO', padreId: 'G', clase: 'CONSUMO', tipo503020: 'NECESIDAD', activa: true, orden: 1, color: null, icono: null, fijoVariable: null }]]);
    expect(regla503020(movs, '2026-11', cats)).toMatchObject({ NECESIDAD: 100, 'SIN CLASIFICAR': 50 });
  });
});

describe('montos', () => {
  it('entiende formatos comunes', () => {
    expect(parseMonto('1.234,50')).toBe(1234.5);
    expect(parseMonto('1,234.50')).toBe(1234.5);
    expect(parseMonto('12,5')).toBe(12.5);
    expect(parseMonto('abc')).toBeNull();
    expect(dinero(-1234.5)).toBe('−S/ 1,234.50');
  });
});

import { ultimoMesConDatos, resumenPorAnio } from '../domain/reports';
describe('historial', () => {
  it('encuentra el último mes con datos y resume por año', () => {
    const ms = [mov({ FECHA: '2025-08-22', MONTO: 10 }), mov({ FECHA: '2024-03-01', MONTO: 5 }), mov({ TIPO: 'INGRESO', FECHA: '2024-03-02', MONTO: 100 })];
    expect(ultimoMesConDatos(ms)).toBe('2025-08');
    expect(resumenPorAnio(ms)).toEqual([{ anio: '2024', ingresos: 100, egresos: 5, meses: 1 }, { anio: '2025', ingresos: 0, egresos: 10, meses: 1 }]);
  });
});
