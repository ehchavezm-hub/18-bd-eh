import { REQUIRED_COLUMNS, REQUIRED_V1, SCHEMA_VERSION, SHEETS, type TableName } from '../config/schema';
import { missingColumns, isYes } from '../lib/rows';
import type { DataAdapter } from './adapter';

export interface SchemaReport {
  title: string;
  schemaVersion: number | null;
  missingSheets: string[];
  missingColumns: { sheet: string; columns: string[] }[];
  counts: { cuentasActivas: number; categoriasActivas: number; movimientos: number };
  ok: boolean;
}

/** Comprueba que la hoja conectada tiene la estructura que espera esta versión de la app. */
export async function checkSchema(db: DataAdapter): Promise<SchemaReport> {
  const { title, tables } = await db.describe();
  const present = new Set(tables);
  const missingSheets = REQUIRED_V1.filter((t) => !present.has(SHEETS[t])).map((t) => SHEETS[t]);

  const colIssues: SchemaReport['missingColumns'] = [];
  for (const [t, cols] of Object.entries(REQUIRED_COLUMNS) as [TableName, string[]][]) {
    if (!present.has(SHEETS[t])) continue;
    const miss = missingColumns(await db.header(t), cols);
    if (miss.length) colIssues.push({ sheet: SHEETS[t], columns: miss });
  }

  let schemaVersion: number | null = null;
  let counts = { cuentasActivas: 0, categoriasActivas: 0, movimientos: 0 };
  if (missingSheets.length === 0) {
    const [config, cuentas, categorias, movimientos] = await Promise.all([
      db.read('CONFIG'), db.read('CUENTAS'), db.read('CATEGORIAS'), db.read('MOVIMIENTOS'),
    ]);
    const v = config.find((r) => r.CLAVE === 'VERSION_ESQUEMA')?.VALOR;
    schemaVersion = v === null || v === undefined ? null : Number(v);
    counts = {
      cuentasActivas: cuentas.filter((r) => isYes(r.ACTIVA)).length,
      categoriasActivas: categorias.filter((r) => isYes(r.ACTIVA) && r.CATEGORIA_PADRE_ID).length,
      movimientos: movimientos.filter((r) => !isYes(r.ELIMINADO)).length,
    };
  }

  return {
    title,
    schemaVersion,
    missingSheets,
    missingColumns: colIssues,
    counts,
    ok: missingSheets.length === 0 && colIssues.length === 0 && schemaVersion === SCHEMA_VERSION,
  };
}
