import { useMemo } from 'react';
import { useStore } from './store';
import {
  toCategoria, toCuenta, toMovimiento, toRecurrente, toRegla, toSimple, toTipoCambio,
  type Categoria, type Cuenta, type Movimiento, type Recurrente, type Regla, type Simple, type TipoCambio,
} from '../domain/model';
import type { Row } from '../lib/rows';

export interface Data {
  movs: Movimiento[];
  cuentas: Cuenta[];
  cuentasById: Map<string, Cuenta>;
  categorias: Categoria[];
  categoriasById: Map<string, Categoria>;
  centros: Simple[];
  lugares: Simple[];
  instituciones: (Simple & { enUso: boolean })[];
  monedas: Simple[];
  recurrentes: Recurrente[];
  reglas: Regla[];
  tiposCambio: TipoCambio[];
  listas: Record<string, string[]>;
  cobertura: Map<string, string>;
  nombres: { categoria: Map<string, string>; centro: Map<string, string>; cuenta: Map<string, string>; lugar: Map<string, string> };
}

const byName = <T extends { nombre: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre, 'es');

/** Convierte las tablas crudas del almacén en objetos listos para usar en las pantallas. */
export function useData(): Data {
  const { tables, version } = useStore();
  return useMemo(() => {
    const t = (k: string): Row[] => tables[k] ?? [];
    const movs = t('MOVIMIENTOS').map(toMovimiento).filter((m): m is Movimiento => !!m);
    const cuentas = t('CUENTAS').map(toCuenta).filter((c) => c.id).sort((a, b) => a.orden - b.orden || byName(a, b));
    const categorias = t('CATEGORIAS').map(toCategoria).filter((c) => c.id).sort((a, b) => a.orden - b.orden);
    const centros = t('CENTROS').map(toSimple('CENTRO_ID')).filter((c) => c.id);
    const lugares = t('LUGARES').map(toSimple('LUGAR_ID')).filter((c) => c.id).sort(byName);
    const instituciones = t('INSTITUCIONES').filter((r) => r.INSTITUCION_ID).map((r) => ({
      ...toSimple('INSTITUCION_ID', 'ACTIVA')(r), enUso: String(r.EN_USO ?? '').toUpperCase().startsWith('S'),
    })).sort(byName);
    const monedas = t('MONEDAS').map(toSimple('MONEDA', 'ACTIVA')).filter((c) => c.id);
    const listas: Record<string, string[]> = {};
    for (const r of t('LISTAS')) for (const [k, v] of Object.entries(r)) if (v !== null && v !== '') (listas[k] ??= []).push(String(v));
    // La columna A de LISTAS también es un valor (rowsFromValues la usa como ID): ya incluida arriba.
    const cobertura = new Map<string, string>();
    for (const r of t('CIERRES_MES')) {
      const k = typeof r.MES === 'number' ? new Date(Date.UTC(1899, 11, 30) + r.MES * 86400000).toISOString().slice(0, 7) : String(r.MES ?? '').slice(0, 7);
      if (k) cobertura.set(k, String(r.COBERTURA_REGISTRO ?? ''));
    }
    return {
      movs,
      cuentas,
      cuentasById: new Map(cuentas.map((c) => [c.id, c])),
      categorias,
      categoriasById: new Map(categorias.map((c) => [c.id, c])),
      centros,
      lugares,
      instituciones,
      monedas,
      recurrentes: t('RECURRENTES').map(toRecurrente).filter((r) => r.id),
      reglas: t('REGLAS_CATEGORIZACION').map(toRegla).filter((r) => r.patron),
      tiposCambio: t('TIPO_CAMBIO').map(toTipoCambio).filter((x): x is TipoCambio => !!x).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      listas,
      cobertura,
      nombres: {
        categoria: new Map(categorias.map((c) => [c.id, c.nombre])),
        centro: new Map(centros.map((c) => [c.id, c.nombre])),
        cuenta: new Map(cuentas.map((c) => [c.id, c.nombre])),
        lugar: new Map(lugares.map((c) => [c.id, c.nombre])),
      },
    };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Último tipo de cambio conocido para una moneda en (o antes de) una fecha. */
export function tipoCambioPara(tcs: TipoCambio[], moneda: string, fecha: string): number | null {
  let best: TipoCambio | null = null;
  for (const t of tcs) if (t.moneda === moneda && t.fecha <= fecha) best = t;
  return best?.venta ?? null;
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Computadora Windows';
  if (/Mac/.test(ua)) return 'Computadora Mac';
  return 'Navegador';
}
