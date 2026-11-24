import { describe, expect, it } from 'vitest';
import { isYes, missingColumns, rowsFromValues } from '../lib/rows';

describe('rowsFromValues', () => {
  it('convierte filas en objetos y salta filas sin ID', () => {
    const rows = rowsFromValues([
      ['CUENTA_ID', 'NOMBRE', 'ACTIVA'],
      ['EFECTIVO-PEN', 'Efectivo soles', 'SÍ'],
      ['', '', ''],
      ['BCP-AHO-PEN', 'BCP ahorro', 'NO'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ CUENTA_ID: 'EFECTIVO-PEN', NOMBRE: 'Efectivo soles', ACTIVA: 'SÍ' });
  });
  it('completa con null las celdas faltantes', () => {
    expect(rowsFromValues([['A', 'B'], ['x']])[0]).toEqual({ A: 'x', B: null });
  });
  it('tabla vacía', () => {
    expect(rowsFromValues(undefined)).toEqual([]);
  });
});

describe('missingColumns / isYes', () => {
  it('lista columnas que faltan', () => {
    expect(missingColumns(['A', 'B'], ['A', 'C'])).toEqual(['C']);
  });
  it('reconoce SÍ con y sin tilde', () => {
    expect(isYes('SÍ')).toBe(true);
    expect(isYes('si')).toBe(true);
    expect(isYes('NO')).toBe(false);
    expect(isYes(null)).toBe(false);
  });
});
