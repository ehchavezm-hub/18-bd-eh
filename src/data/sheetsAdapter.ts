import { SHEETS, type TableName } from '../config/schema';
import { rowsFromValues, type Row } from '../lib/rows';
import { DataAdapter, DataError } from './adapter';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const q = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;
const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
// Fechas como número de serie: no dependen del idioma de la hoja.
const READ_OPTS = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';

export class SheetsAdapter implements DataAdapter {
  private headers = new Map<TableName, string[]>();

  constructor(
    private readonly spreadsheetId: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    let res: Response;
    try {
      res = await fetch(`${API}/${this.spreadsheetId}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      });
    } catch {
      throw new DataError('Sin conexión con Google. Revisa tu internet.', 'network');
    }
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    if (res.status === 401) throw new DataError('Tu sesión de Google expiró. Vuelve a entrar.', 'auth');
    if (res.status === 403) throw new DataError('Tu cuenta de Google no tiene permiso para abrir esta hoja.', 'permission');
    if (res.status === 404) throw new DataError('No encontré la hoja de cálculo. Elígela otra vez en Configuración.', 'not-found');
    if (res.status === 400 && /not supported for this document/i.test(body)) {
      throw new DataError('El archivo sigue siendo un Excel (.xlsx). Conviértelo a Google Sheets.', 'office-file');
    }
    if (res.status === 429) throw new DataError('Google pidió esperar un momento. Se reintentará solo.', 'network');
    throw new DataError(`Google respondió con un error (${res.status}).`, 'unknown');
  }

  async describe() {
    const data = await this.call<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(
      '?fields=properties.title,sheets.properties.title',
    );
    return { title: data.properties.title, tables: data.sheets.map((s) => s.properties.title) };
  }

  async read(table: TableName): Promise<Row[]> {
    return (await this.readMany([table]))[table] ?? [];
  }

  async readMany(tables: TableName[]): Promise<Record<string, Row[]>> {
    const ranges = tables.map((t) => `ranges=${encodeURIComponent(q(SHEETS[t]))}`).join('&');
    const data = await this.call<{ valueRanges: { values?: unknown[][] }[] }>(`/values:batchGet?${ranges}&${READ_OPTS}`);
    const out: Record<string, Row[]> = {};
    tables.forEach((t, i) => {
      const values = data.valueRanges[i]?.values;
      if (values?.[0]) this.headers.set(t, values[0].map((v) => String(v ?? '').trim()));
      out[t] = rowsFromValues(values);
    });
    return out;
  }

  async header(table: TableName): Promise<string[]> {
    const cached = this.headers.get(table);
    if (cached) return cached;
    const range = encodeURIComponent(`${q(SHEETS[table])}!1:1`);
    const data = await this.call<{ values?: unknown[][] }>(`/values/${range}`);
    const h = (data.values?.[0] ?? []).map((v) => String(v ?? '').trim());
    this.headers.set(table, h);
    return h;
  }

  /** IDs de la columna A con su número de fila en la hoja. */
  private async ids(table: TableName): Promise<Map<string, number>> {
    const range = encodeURIComponent(`${q(SHEETS[table])}!A:A`);
    const data = await this.call<{ values?: unknown[][] }>(`/values/${range}?${READ_OPTS}`);
    const map = new Map<string, number>();
    (data.values ?? []).forEach((r, i) => { if (i > 0 && r[0] !== undefined && r[0] !== '') map.set(String(r[0]), i + 1); });
    return map;
  }

  async append(table: TableName, rows: Row[]): Promise<void> {
    if (rows.length === 0) return;
    const cols = await this.header(table);
    const existing = await this.ids(table);
    const nuevos = rows.filter((r) => !existing.has(String(r[cols[0]] ?? ''))); // idempotente: no duplica si se reintenta
    if (nuevos.length === 0) return;
    const values = nuevos.map((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    const range = encodeURIComponent(`${q(SHEETS[table])}!A1`);
    await this.call(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }

  async update(table: TableName, id: string, patch: Row): Promise<void> {
    const cols = await this.header(table);
    const row = (await this.ids(table)).get(id);
    if (!row) throw new DataError(`No encontré el registro ${id} en ${SHEETS[table]}.`, 'not-found');
    const data: { range: string; values: unknown[][] }[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const idx = cols.indexOf(k);
      if (idx < 0) continue;
      data.push({ range: `${q(SHEETS[table])}!${colLetter(idx + 1)}${row}`, values: [[v === undefined ? null : v]] });
    }
    if (data.length === 0) return;
    await this.call('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
  }
}
