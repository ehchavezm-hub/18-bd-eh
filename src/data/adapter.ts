import type { TableName } from '../config/schema';
import type { Row } from '../lib/rows';

/**
 * Contrato que usan las pantallas y servicios para leer y escribir datos.
 * Hoy lo implementa SheetsAdapter (Google Sheets). En el futuro puede
 * implementarlo un SupabaseAdapter sin cambiar el resto de la app.
 */
export interface DataAdapter {
  /** Nombre visible de la base de datos (título de la hoja de cálculo). */
  describe(): Promise<{ title: string; tables: string[] }>;
  /** Lee una tabla completa como lista de objetos. */
  read(table: TableName): Promise<Row[]>;
  /** Lee varias tablas en una sola llamada. */
  readMany(tables: TableName[]): Promise<Record<string, Row[]>>;
  /** Lee solo el encabezado (nombres de columnas) de una tabla. */
  header(table: TableName): Promise<string[]>;
  /** Agrega registros al final de la tabla, respetando el orden de columnas. Omite IDs que ya existen. */
  append(table: TableName, rows: Row[]): Promise<void>;
  /** Cambia campos de un registro identificado por su ID (columna A). */
  update(table: TableName, id: string, patch: Row): Promise<void>;
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'not-found' | 'office-file' | 'permission' | 'network' | 'schema' | 'unknown',
  ) {
    super(message);
  }
}
