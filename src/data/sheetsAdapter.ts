import { SHEETS, type TableName } from '../config/schema';
import { rowsFromValues, type Row } from '../lib/rows';
import { DataAdapter, DataError } from './adapter';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const q = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

export class SheetsAdapter implements DataAdapter {
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
    if (res.status === 404) throw new DataError('No encontré la hoja de cálculo. Revisa el enlace.', 'not-found');
    if (res.status === 400 && /not supported for this document/i.test(body)) {
      throw new DataError('El archivo sigue siendo un Excel (.xlsx). Conviértelo a Google Sheets: Archivo → Guardar como Hojas de cálculo de Google.', 'office-file');
    }
    throw new DataError(`Google respondió con un error (${res.status}).`, 'unknown');
  }

  async describe() {
    const data = await this.call<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(
      '?fields=properties.title,sheets.properties.title',
    );
    return { title: data.properties.title, tables: data.sheets.map((s) => s.properties.title) };
  }

  async read(table: TableName): Promise<Row[]> {
    const range = encodeURIComponent(q(SHEETS[table]));
    const data = await this.call<{ values?: unknown[][] }>(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    return rowsFromValues(data.values);
  }

  async header(table: TableName): Promise<string[]> {
    const range = encodeURIComponent(`${q(SHEETS[table])}!1:1`);
    const data = await this.call<{ values?: unknown[][] }>(`/values/${range}`);
    return (data.values?.[0] ?? []).map((v) => String(v ?? '').trim());
  }

  async append(table: TableName, rows: Row[]): Promise<void> {
    if (rows.length === 0) return;
    const cols = await this.header(table);
    const values = rows.map((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    const range = encodeURIComponent(`${q(SHEETS[table])}!A1`);
    await this.call(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }
}
