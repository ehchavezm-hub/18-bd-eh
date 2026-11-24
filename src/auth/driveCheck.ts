/**
 * Comprueba con quién está compartida tu hoja de Google (solo lectura de permisos de ESA hoja).
 * Usa el mismo permiso mínimo de la app (drive.file): no puede ver otros archivos.
 */
export type ResultadoCompartir =
  | { estado: 'privada' }
  | { estado: 'enlace'; rol: string }
  | { estado: 'personas'; correos: string[] }
  | { estado: 'error'; motivo: string };

interface Permiso { type?: string; role?: string; emailAddress?: string; domain?: string }

export function evaluarPermisos(permisos: Permiso[], propietario: string | undefined): ResultadoCompartir {
  const publico = permisos.find((p) => p.type === 'anyone' || p.type === 'domain');
  if (publico) return { estado: 'enlace', rol: publico.role === 'reader' ? 'ver' : publico.role === 'commenter' ? 'comentar' : 'editar' };
  const otros = permisos.filter((p) => p.role !== 'owner' && (p.type === 'user' || p.type === 'group') && p.emailAddress?.toLowerCase() !== propietario?.toLowerCase());
  if (otros.length) return { estado: 'personas', correos: otros.map((p) => p.emailAddress ?? '(sin correo)') };
  return { estado: 'privada' };
}

export async function revisarCompartir(fileId: string, token: string, propietario?: string): Promise<ResultadoCompartir> {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=permissions(type,role,emailAddress,domain)&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { estado: 'error', motivo: r.status === 401 ? 'Conéctate con Google y vuelve a intentar.' : `Google respondió ${r.status}.` };
    const j = (await r.json()) as { permissions?: Permiso[] };
    if (!j.permissions) return { estado: 'error', motivo: 'Google no entregó los permisos de la hoja.' };
    return evaluarPermisos(j.permissions, propietario);
  } catch {
    return { estado: 'error', motivo: 'Sin conexión.' };
  }
}
