import Dexie, { type Table } from 'dexie';
import type { Row } from '../lib/rows';

/** Cambio pendiente de enviar a la BD (modo sin internet). Se usa desde la etapa 1. */
export interface OutboxItem {
  id: string;
  table: string;
  op: 'append' | 'update';
  payload: Row;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface CachedTable {
  table: string;
  rows: Row[];
  fetchedAt: string;
}

/** Base local del teléfono (IndexedDB). Toda escritura pasará primero por aquí. */
class LocalDb extends Dexie {
  cache!: Table<CachedTable, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super('finanzas');
    this.version(1).stores({
      cache: 'table',
      outbox: 'id, createdAt',
    });
  }
}

export const localDb = new LocalDb();
