import Dexie, { type Table } from 'dexie';
import type { Row } from '../lib/rows';

/** Cambio pendiente de enviar a la BD (modo sin internet). */
export interface OutboxItem {
  seq?: number;
  table: string;
  op: 'append' | 'update';
  id: string;
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

/** Base local del teléfono (IndexedDB). Toda escritura pasa primero por aquí. */
class LocalDb extends Dexie {
  cache!: Table<CachedTable, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super('finanzas');
    this.version(1).stores({ cache: 'table', outbox: 'id, createdAt' });
    // v2: la cola se ordena por número de secuencia para enviar en el mismo orden en que se guardó.
    this.version(2).stores({ cache: 'table', outbox: '++seq, createdAt' }).upgrade((tx) => tx.table('outbox').clear());
  }
}

export const localDb = new LocalDb();
