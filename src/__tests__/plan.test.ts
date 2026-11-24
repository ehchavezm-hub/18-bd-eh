import { afterEach, describe, expect, it } from 'vitest';
import { toMovimiento, toCuenta, toCategoria, setTcRespaldo, enSoles, type Movimiento } from '../domain/model';
import { avancePresupuestos, presupuestosDelMes, toPresupuesto, sugerirPresupuestos, cierreMes, saldosAl, patrimonioMensual, toActivo, toMeta, avanceMetas } from '../domain/plan';
import { leerSerie, valorEn } from '../domain/tc';
import { parsear } from '../../scripts/tc-bcrp.mjs';
import type { Row } from '../lib/rows';

const mov = (p: Partial<Row>): Movimiento => toMovimiento({ MOVIMIENTO_ID: Math.random().toString(36), FECHA: '2026-11-10', TIPO: 'EGRESO', ESTADO: 'PAGADO', CUENTA_ID: 'BCP', MONTO: 10, MONEDA: 'PEN', ELIMINADO: 'NO', ...p })!;
const cats = new Map([
  toCategoria({ CATEGORIA_ID: 'ALIMENTACION', NOMBRE: 'Alimentación', TIPO: 'EGRESO', ACTIVA: 'SÍ', CLASE: 'CONSUMO' }),
  toCategoria({ CATEGORIA_ID: 'COMESTIBLES', NOMBRE: 'Comestibles', TIPO: 'EGRESO', CATEGORIA_PADRE_ID: 'ALIMENTACION', ACTIVA: 'SÍ', CLASE: 'CONSUMO' }),
  toCategoria({ CATEGORIA_ID: 'RESTAURANTES', NOMBRE: 'Restaurantes', TIPO: 'EGRESO', CATEGORIA_PADRE_ID: 'ALIMENTACION', ACTIVA: 'SÍ', CLASE: 'CONSUMO' }),
  toCategoria({ CATEGORIA_ID: 'TAXI', NOMBRE: 'Taxi', TIPO: 'EGRESO', CATEGORIA_PADRE_ID: 'MOVILIDAD', ACTIVA: 'SÍ', CLASE: 'CONSUMO' }),
].map((c) => [c.id, c]));

afterEach(() => setTcRespaldo(() => null));

describe('tipo de cambio histórico', () => {
  it('lee la respuesta del BCRP (meses en español, "Set" y "n.d.")', () => {
    expect(parsear({ periods: [{ name: '02.Ene.18', values: ['3.2420'] }, { name: '03.Set.24', values: ['3.75'] }, { name: '04.Ene.18', values: ['n.d.'] }] }))
      .toEqual([['2018-01-02', 3.242], ['2024-09-03', 3.75]]);
  });
  it('usa el último día hábil anterior y no inventa valores lejanos', () => {
    const s = leerSerie({ datos: [['2026-11-06', 3.70], ['2026-11-09', 3.72], ['basura', 1], ['2026-11-10', 99]] });
    expect(valorEn(s, '2026-11-08')).toBe(3.70); // domingo → viernes
    expect(valorEn(s, '2026-11-09')).toBe(3.72);
    expect(valorEn(s, '2026-12-31')).toBeNull(); // más de 10 días sin dato
    expect(valorEn(s, '2020-01-01')).toBeNull();
  });
  it('un gasto en dólares sin TC propio se convierte con el TC del día', () => {
    const m = mov({ MONTO: 10, MONEDA: 'USD', FECHA: '2026-11-08' });
    expect(enSoles(m)).toBeNull();
    setTcRespaldo((mon, f) => (mon === 'USD' && f === '2026-11-08' ? 3.7 : null));
    expect(enSoles(m)).toBe(37);
    expect(enSoles(mov({ MONTO: 10, MONEDA: 'USD', TIPO_CAMBIO: 3.5 }))).toBe(35); // el TC propio manda
  });
});

describe('presupuestos', () => {
  const ps = [
    toPresupuesto({ PRESUPUESTO_ID: 'P1', MES: '', CATEGORIA_ID: 'ALIMENTACION', MONTO: 1000 })!,
    toPresupuesto({ PRESUPUESTO_ID: 'P2', MES: '', CATEGORIA_ID: 'TAXI', MONTO: 100 })!,
    toPresupuesto({ PRESUPUESTO_ID: 'P3', MES: '2026-12', CATEGORIA_ID: 'TAXI', MONTO: 300 })!,
  ];
  it('el presupuesto de un mes específico reemplaza al general', () => {
    expect(presupuestosDelMes(ps, '2026-12').map((p) => p.id).sort()).toEqual(['P1', 'P3']);
    expect(presupuestosDelMes(ps, '2026-11').map((p) => p.id).sort()).toEqual(['P1', 'P2']);
  });
  it('suma las subcategorías del grupo, descuenta reembolsos y marca 80 % y 100 %', () => {
    const movs = [
      mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 600 }), mov({ CATEGORIA_ID: 'RESTAURANTES', MONTO: 250 }),
      mov({ CATEGORIA_ID: 'RESTAURANTES', MONTO: 50, TIPO: 'REEMBOLSO' }), mov({ CATEGORIA_ID: 'TAXI', MONTO: 120 }),
      mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 999, ESTADO: 'ANULADO' }), mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 999, FECHA: '2026-10-31' }),
    ];
    const r = avancePresupuestos(ps, movs, cats, '2026-11', '2026-11-15');
    const ali = r.find((x) => x.presupuesto.id === 'P1')!, taxi = r.find((x) => x.presupuesto.id === 'P2')!;
    expect(ali.gastado).toBe(800); expect(ali.estado).toBe('alerta');
    expect(taxi.gastado).toBe(120); expect(taxi.estado).toBe('excedido');
    expect(ali.proyeccion).toBe(1600); // 800 en 15 días → 30 días
    expect(r[0].presupuesto.id).toBe('P2'); // el más comprometido primero
  });
  it('ignora presupuestos sin monto', () => {
    expect(toPresupuesto({ PRESUPUESTO_ID: 'X', CATEGORIA_ID: 'TAXI', MONTO: 0 })).toBeNull();
  });
  it('sugiere el promedio de los últimos meses por grupo, redondeado', () => {
    const movs = [mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 600, FECHA: '2026-10-05' }), mov({ CATEGORIA_ID: 'RESTAURANTES', MONTO: 600, FECHA: '2026-09-05' })];
    expect(sugerirPresupuestos(movs, cats, '2026-11', 6)).toEqual([{ categoriaId: 'ALIMENTACION', nombre: 'Alimentación', monto: 200 }]);
  });
});

describe('cierre de mes', () => {
  it('ahorro, tasa, categorías que subieron y pagos fijos que subieron', () => {
    const movs = [
      mov({ TIPO: 'INGRESO', MONTO: 5000, CATEGORIA_ID: 'SUELDO', FECHA: '2026-10-28' }),
      mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 500, FECHA: '2026-10-10' }), mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 800, FECHA: '2026-10-20' }),
      mov({ CATEGORIA_ID: 'COMESTIBLES', MONTO: 400, FECHA: '2026-09-10' }),
      mov({ CATEGORIA_ID: 'TAXI', MONTO: 120, FECHA: '2026-10-03', RECURRENTE_ID: 'REC-1' }), mov({ CATEGORIA_ID: 'TAXI', MONTO: 100, FECHA: '2026-09-03', RECURRENTE_ID: 'REC-1' }),
    ];
    const recs = [{ id: 'REC-1', descripcion: 'Movilidad fija', activo: true }] as never;
    const c = cierreMes(movs, cats, recs, '2026-10');
    expect(c.ingresos).toBe(5000); expect(c.egresos).toBe(1420); expect(c.ahorro).toBe(3580);
    expect(c.tasaAhorro).toBeCloseTo(0.716);
    expect(c.subieron[0]).toMatchObject({ id: 'ALIMENTACION', antes: 400, ahora: 1300, diferencia: 900 });
    expect(c.pagosQueSubieron).toEqual([{ id: 'REC-1', nombre: 'Movilidad fija', antes: 100, ahora: 120, diferencia: 20 }]);
  });
});

describe('saldos en una fecha y patrimonio', () => {
  const bcp = toCuenta({ CUENTA_ID: 'BCP', NOMBRE: 'BCP', TIPO_CUENTA: 'AHORRO', MONEDA: 'PEN', SALDO_INICIAL: 1000, FECHA_SALDO_INICIAL: '2026-10-31', ACTIVA: 'SÍ', CLASE_PATRIMONIO: 'LÍQUIDO' });
  const usd = toCuenta({ CUENTA_ID: 'USD', NOMBRE: 'Dólares', TIPO_CUENTA: 'AHORRO', MONEDA: 'USD', SALDO_INICIAL: 100, FECHA_SALDO_INICIAL: '2026-10-31', ACTIVA: 'SÍ', CLASE_PATRIMONIO: 'LÍQUIDO' });
  const tc = toCuenta({ CUENTA_ID: 'TC', NOMBRE: 'Visa', TIPO_CUENTA: 'TARJETA DE CRÉDITO', MONEDA: 'PEN', SALDO_INICIAL: 0, FECHA_SALDO_INICIAL: '2026-10-31', ACTIVA: 'SÍ' });
  const movs = [
    mov({ CUENTA_ID: 'BCP', MONTO: 200, FECHA: '2026-11-05' }), // después del saldo inicial: resta
    mov({ CUENTA_ID: 'BCP', MONTO: 300, FECHA: '2026-10-20' }), // antes: al ir hacia atrás se suma
    mov({ CUENTA_ID: 'TC', MONTO: 150, FECHA: '2026-11-07' }),
  ];
  it('calcula hacia adelante y hacia atrás desde el saldo inicial', () => {
    expect(saldosAl([bcp], movs, '2026-11-30').get('BCP')!.saldo).toBe(800);
    expect(saldosAl([bcp], movs, '2026-10-15').get('BCP')!.saldo).toBe(1300);
  });
  it('patrimonio = dinero + bienes − deudas, con dólares al TC del día', () => {
    setTcRespaldo((m) => (m === 'USD' ? 3.7 : null));
    const casa = toActivo({ ACTIVO_ID: 'CASA', NOMBRE: 'Casa', VALOR_ESTIMADO: 500000, MONEDA: 'PEN', FECHA_ADQUISICION: '2010-01-01', ACTIVO: 'SÍ' })!;
    const { puntos, sinSaldoInicial } = patrimonioMensual([bcp, usd, tc], movs, [casa], ['2026-11']);
    expect(puntos[0]).toMatchObject({ liquido: 800 + 370, bienes: 500000, deudas: 150, neto: 800 + 370 + 500000 - 150 });
    expect(sinSaldoInicial).toEqual([]);
  });
});

describe('metas', () => {
  it('avance con la cuenta vinculada y aporte necesario por mes', () => {
    const ahorro = toCuenta({ CUENTA_ID: 'AH', NOMBRE: 'Ahorro viaje', TIPO_CUENTA: 'AHORRO', MONEDA: 'PEN', SALDO_INICIAL: 2000, FECHA_SALDO_INICIAL: '2026-10-31', ACTIVA: 'SÍ' });
    const meta = toMeta({ META_ID: 'M1', NOMBRE: 'Viaje a Grecia', MONTO_OBJETIVO: 8000, MONEDA: 'PEN', FECHA_OBJETIVO: '2027-11-30', CUENTA_ID: 'AH', APORTE_MENSUAL: 400, ESTADO: 'ACTIVA' })!;
    const [a] = avanceMetas([meta], [ahorro], [], '2026-11-24');
    expect(a.actual).toBe(2000); expect(a.pct).toBe(0.25); expect(a.falta).toBe(6000);
    expect(a.mesesRestantes).toBe(12); expect(a.necesarioMes).toBe(500); expect(a.aTiempo).toBe(false);
  });
});

import { calendarioPagos } from '../domain/ics';
import { toRecurrente } from '../domain/model';
describe('recordatorios de calendario (.ics)', () => {
  const recs = [
    toRecurrente({ RECURRENTE_ID: 'REC-001', DESCRIPCION: 'Luz casa, Tilda', TIPO: 'EGRESO', MONTO_ESTIMADO: 120, MONEDA: 'PEN', FRECUENCIA: 'MENSUAL', DIA: 15, AVISAR_DIAS_ANTES: 3, ACTIVO: 'SÍ' }),
    toRecurrente({ RECURRENTE_ID: 'REC-002', DESCRIPCION: 'Seguro', TIPO: 'EGRESO', FRECUENCIA: 'TRIMESTRAL', DIA: 31, AVISAR_DIAS_ANTES: 0, ACTIVO: 'SÍ' }),
    toRecurrente({ RECURRENTE_ID: 'REC-003', DESCRIPCION: 'Inactivo', TIPO: 'EGRESO', FRECUENCIA: 'MENSUAL', DIA: 1, ACTIVO: 'NO' }),
    toRecurrente({ RECURRENTE_ID: 'REC-004', DESCRIPCION: 'Sueldo', TIPO: 'INGRESO', FRECUENCIA: 'MENSUAL', DIA: 28, ACTIVO: 'SÍ' }),
  ];
  it('solo pagos activos, con repetición, aviso N días antes a las 9:00 y sin montos por defecto', () => {
    const { ics, eventos } = calendarioPagos(recs, '2026-11-24', { incluirMontos: false, ahora: new Date('2026-11-24T12:00:00Z') });
    expect(eventos).toBe(2);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261215');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
    expect(ics).toContain('TRIGGER:-PT63H');
    expect(ics).toContain('SUMMARY:Pago: Luz casa\\, Tilda');
    expect(ics).not.toMatch(/S\/\s?120/);
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1');
    expect(ics).not.toContain('Inactivo'); expect(ics).not.toContain('Sueldo');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('con montos si se pide', () => {
    expect(calendarioPagos(recs, '2026-11-24', { incluirMontos: true }).ics).toMatch(/SUMMARY:Pago: Luz casa\\, Tilda · S\/\s120\.00/);
  });
});

import { evaluarPermisos } from '../auth/driveCheck';
describe('revisión de con quién está compartida la hoja', () => {
  const dueño = { type: 'user', role: 'owner', emailAddress: 'yo@example.com' };
  it('privada si solo está el propietario', () => expect(evaluarPermisos([dueño], 'yo@example.com')).toEqual({ estado: 'privada' }));
  it('alerta si cualquiera con el enlace puede verla', () => expect(evaluarPermisos([dueño, { type: 'anyone', role: 'reader' }], 'yo@example.com')).toEqual({ estado: 'enlace', rol: 'ver' }));
  it('lista a otras personas', () => expect(evaluarPermisos([dueño, { type: 'user', role: 'writer', emailAddress: 'otro@example.com' }], 'yo@example.com')).toEqual({ estado: 'personas', correos: ['otro@example.com'] }));
});
