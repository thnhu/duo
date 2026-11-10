import { db } from '../db/schema';
import { BACKUP_TABLES } from '../backup/json';

// Settings -> Dung lượng: how much the kit holds and how much room the browser
// gives it. Sizes are estimated from a sample of rows per table (reading and
// measuring every row would itself be slow on a big kit).

export interface TableStat {
  name: string;
  rows: number;
  // Estimated bytes of the rows (JSON length), from up to SAMPLE rows.
  bytes: number;
}

export interface StorageStats {
  tables: TableStat[];
  totalRows: number;
  totalBytes: number;
  // The browser's own numbers; undefined where the browser does not tell.
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

const SAMPLE = 200;

export async function loadStorageStats(): Promise<StorageStats> {
  const tables: TableStat[] = [];
  for (const [name] of BACKUP_TABLES) {
    const table = db.table(name);
    const rows = await table.count();
    let bytes = 0;
    if (rows > 0) {
      const sample = await table.limit(SAMPLE).toArray();
      const average = sample.reduce((sum, row) => sum + JSON.stringify(row).length, 0) / sample.length;
      bytes = Math.round(average * rows);
    }
    tables.push({ name, rows, bytes });
  }
  tables.sort((a, b) => b.bytes - a.bytes);

  const stats: StorageStats = {
    tables,
    totalRows: tables.reduce((sum, t) => sum + t.rows, 0),
    totalBytes: tables.reduce((sum, t) => sum + t.bytes, 0),
  };
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      stats.usage = estimate.usage;
      stats.quota = estimate.quota;
    }
    stats.persisted = await navigator.storage?.persisted?.();
  } catch {
    // not supported: the table sizes above are still shown
  }
  return stats;
}

// Asks the browser not to evict this site's data when space or time runs out.
// It may say no (iOS decides by itself); returns what it answered.
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
