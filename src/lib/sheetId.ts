export interface ParsedSheetLink {
  id: string;
  /** true si el enlace apunta a un archivo de Office (.xlsx) abierto en Drive, no a una hoja de Google. */
  isOfficeFile: boolean;
}

/**
 * Extrae el ID de una hoja de cálculo a partir del enlace que copia el usuario
 * (o del ID pegado directamente). Devuelve null si no lo reconoce.
 */
export function parseSheetLink(input: string): ParsedSheetLink | null {
  const text = input.trim();
  if (!text) return null;
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) ?? text.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) {
    return { id: m[1], isOfficeFile: /[?&]rtpof=true/.test(text) || /\/file\/d\//.test(text) };
  }
  if (/^[a-zA-Z0-9_-]{25,}$/.test(text)) return { id: text, isOfficeFile: false };
  return null;
}
