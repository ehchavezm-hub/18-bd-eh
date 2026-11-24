export type Row = Record<string, string | number | boolean | null>;

/**
 * Convierte el resultado de la API de Sheets (matriz con encabezados en la fila 1)
 * en una lista de objetos. Ignora filas sin ID (columna A vacía), como las filas
 * verdes reservadas para agregar registros.
 */
export function rowsFromValues(values: unknown[][] | undefined): Row[] {
  if (!values || values.length === 0) return [];
  const [header, ...rest] = values;
  const keys = header.map((h) => String(h ?? '').trim());
  const out: Row[] = [];
  for (const line of rest) {
    const first = line[0];
    if (first === undefined || first === null || String(first).trim() === '') continue;
    const row: Row = {};
    keys.forEach((k, i) => {
      if (!k) return;
      const v = line[i];
      row[k] = v === undefined || v === '' ? null : (v as Row[string]);
    });
    out.push(row);
  }
  return out;
}

/** Columnas requeridas que faltan en un encabezado. */
export function missingColumns(header: unknown[] | undefined, required: string[]): string[] {
  const have = new Set((header ?? []).map((h) => String(h ?? '').trim()));
  return required.filter((c) => !have.has(c));
}

export const isYes = (v: unknown) => String(v ?? '').trim().toUpperCase() === 'SÍ' || String(v ?? '').trim().toUpperCase() === 'SI';
