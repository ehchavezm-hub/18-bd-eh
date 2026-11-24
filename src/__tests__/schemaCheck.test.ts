import { describe, expect, it } from 'vitest';
import { checkSchema } from '../data/schemaCheck';
import { REQUIRED_COLUMNS, SHEETS, type TableName } from '../config/schema';
import type { DataAdapter } from '../data/adapter';
import type { Row } from '../lib/rows';

function fakeDb(data: Partial<Record<TableName, Row[]>>, sheets = Object.values(SHEETS) as string[]): DataAdapter {
  return {
    describe: async () => ({ title: 'BD prueba', tables: sheets }),
    read: async (t) => data[t] ?? [],
    header: async (t) => REQUIRED_COLUMNS[t] ?? [],
    append: async () => {},
  };
}

describe('checkSchema', () => {
  it('aprueba una BD completa v3 y cuenta registros', async () => {
    const r = await checkSchema(fakeDb({
      CONFIG: [{ CLAVE: 'VERSION_ESQUEMA', VALOR: '3' }],
      CUENTAS: [{ CUENTA_ID: 'A', ACTIVA: 'SÍ' }, { CUENTA_ID: 'B', ACTIVA: 'NO' }],
      CATEGORIAS: [{ CATEGORIA_ID: 'G', ACTIVA: 'SÍ', CATEGORIA_PADRE_ID: null }, { CATEGORIA_ID: 'X', ACTIVA: 'SÍ', CATEGORIA_PADRE_ID: 'G' }],
      MOVIMIENTOS: [{ MOVIMIENTO_ID: '1', ELIMINADO: 'NO' }, { MOVIMIENTO_ID: '2', ELIMINADO: 'SÍ' }],
    }));
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ cuentasActivas: 1, categoriasActivas: 1, movimientos: 1 });
  });
  it('avisa si faltan pestañas', async () => {
    const r = await checkSchema(fakeDb({}, ['1.MOVIMIENTOS']));
    expect(r.ok).toBe(false);
    expect(r.missingSheets).toContain('3.CUENTAS');
  });
  it('avisa si la versión del esquema no coincide', async () => {
    const r = await checkSchema(fakeDb({ CONFIG: [{ CLAVE: 'VERSION_ESQUEMA', VALOR: 2 }] }));
    expect(r.ok).toBe(false);
    expect(r.schemaVersion).toBe(2);
  });
});
