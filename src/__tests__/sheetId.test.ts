import { describe, expect, it } from 'vitest';
import { parseSheetLink } from '../lib/sheetId';

describe('parseSheetLink', () => {
  it('lee el ID de un enlace de Google Sheets', () => {
    const r = parseSheetLink('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG/edit?usp=drive_link');
    expect(r).toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG', isOfficeFile: false });
  });
  it('detecta un Excel abierto en Drive (rtpof=true)', () => {
    const r = parseSheetLink('https://docs.google.com/spreadsheets/d/1abcdefghijklmnopqrstuvwxyz012/edit?usp=drive_link&rtpof=true&sd=true');
    expect(r?.isOfficeFile).toBe(true);
  });
  it('acepta un ID pegado directamente', () => {
    expect(parseSheetLink('  1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789  ')?.id).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
  });
  it('rechaza texto que no es un enlace', () => {
    expect(parseSheetLink('hola')).toBeNull();
    expect(parseSheetLink('')).toBeNull();
  });
});
