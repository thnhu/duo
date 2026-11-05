import { db } from '../db/schema';
import { CURRENT_SCHEMA_VERSION } from '../db/defaults';

// Full JSON backup (spec E2/E3). It is the backup that does not depend on any
// sync service: every table, including soft-deleted rows (so a restore keeps
// deletions) and the whole ReviewLog. LocalSecrets (API keys) never exist in
// these tables and are never exported.

export const BACKUP_APP = 'duo';
export const BACKUP_FORMAT = 1;

// Tables in the backup, with the field that identifies a row.
export const BACKUP_TABLES = [
  ['dictionaries', 'id'],
  ['concepts', 'id'],
  ['examples', 'id'],
  ['exampleLinks', 'id'],
  ['conceptLinks', 'id'],
  ['wordSets', 'id'],
  ['scheduleStates', 'exampleId'],
  ['reviewLogs', 'id'],
  ['importMappings', 'id'],
  ['importBatches', 'id'],
  ['settings', 'id'],
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number][0];

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: number;
  tables: Record<BackupTableName, Array<Record<string, unknown>>>;
}

export async function exportBackup(now: number = Date.now()): Promise<BackupFile> {
  const tables = {} as BackupFile['tables'];
  for (const [name] of BACKUP_TABLES) {
    tables[name] = (await db.table(name).toArray()) as Array<Record<string, unknown>>;
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now, tables };
}

export class BackupError extends Error {}

// Checks a parsed file before anything is written.
export function validateBackup(data: unknown): BackupFile {
  if (typeof data !== 'object' || data === null) throw new BackupError('File không phải bản sao lưu của app.');
  const file = data as Partial<BackupFile>;
  if (file.app !== BACKUP_APP || typeof file.tables !== 'object' || file.tables === null) {
    throw new BackupError('File không phải bản sao lưu của app.');
  }
  if (typeof file.format !== 'number' || file.format > BACKUP_FORMAT) {
    throw new BackupError('Bản sao lưu này tạo bởi phiên bản app mới hơn. Hãy cập nhật app rồi thử lại.');
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new BackupError('Bản sao lưu này có cấu trúc dữ liệu mới hơn app hiện tại. Hãy cập nhật app rồi thử lại.');
  }
  for (const [name, key] of BACKUP_TABLES) {
    const rows = (file.tables as Record<string, unknown>)[name];
    if (rows === undefined) continue; // older backups may lack newer tables
    if (!Array.isArray(rows)) throw new BackupError(`Bảng "${name}" trong file bị hỏng.`);
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || typeof (row as Record<string, unknown>)[key] !== 'string') {
        throw new BackupError(`Bảng "${name}" có dòng thiếu "${key}".`);
      }
    }
  }
  return file as BackupFile;
}

export interface RestoreSummary {
  added: number;
  updated: number;
  // Rows already on this device that were as new or newer.
  kept: number;
}

function updatedAtOf(row: Record<string, unknown>): number {
  return typeof row.updatedAt === 'number' ? row.updatedAt : 0;
}

// Restore = merge, never overwrite (principle 9, nothing is lost):
//  - a row missing here is added;
//  - a row present in both: the one with the newer `updatedAt` wins (the
//    same rule the sync will use);
//  - ReviewLog is append-only, so logs are only ever added.
// Rows are written as they are, keeping their original `updatedAt`.
export async function restoreBackup(data: unknown): Promise<RestoreSummary> {
  const file = validateBackup(data);
  const summary: RestoreSummary = { added: 0, updated: 0, kept: 0 };

  await db.transaction('rw', BACKUP_TABLES.map(([name]) => db.table(name)), async () => {
    for (const [name, key] of BACKUP_TABLES) {
      const incoming = file.tables[name] ?? [];
      if (incoming.length === 0) continue;
      const table = db.table(name);
      const existing = new Map<string, Record<string, unknown>>();
      for (const row of (await table.bulkGet(incoming.map((r) => r[key] as string))) as Array<
        Record<string, unknown> | undefined
      >) {
        if (row) existing.set(row[key] as string, row);
      }

      const toWrite: Array<Record<string, unknown>> = [];
      for (const row of incoming) {
        const current = existing.get(row[key] as string);
        if (!current) {
          toWrite.push(row);
          summary.added++;
        } else if (name !== 'reviewLogs' && updatedAtOf(row) > updatedAtOf(current)) {
          toWrite.push(row);
          summary.updated++;
        } else {
          summary.kept++;
        }
      }
      if (toWrite.length > 0) await table.bulkPut(toWrite);
    }
  });
  return summary;
}
