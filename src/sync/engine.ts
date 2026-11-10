import { db } from '../db/schema';
import { SYNC_TABLES, SyncError, type RemoteRecord, type SyncAdapter, type SyncTableName } from './types';

// Sync engine (spec 6.3). Local-first: IndexedDB stays the source of truth
// on each device; this only copies changes to and from the cloud.
//
// A cycle = pull, then push.
//  - Conflicts: per record, the newer `updatedAt` wins.
//  - ReviewLog is append-only, so it never conflicts: add if missing.
//  - Deletes are soft (`deletedAt`), so they travel as ordinary updates.
//  - "What still needs pushing" is the rows whose current version differs
//    from the version recorded in `syncMeta`. Rows that arrived from the
//    cloud are recorded there too, so they are never sent back.

const recordKey = (table: string, id: string) => `r:${table}:${id}`;
const cursorKey = (userId: string) => `cursor:${userId}`;

type Row = Record<string, unknown>;

const TABLES_KEY = 'tables-signature';

// Small number derived from the synced table names (syncMeta values are numbers).
function tablesSignature(): number {
  let hash = 7;
  for (const char of SYNC_TABLES.map(([name]) => name).join('|')) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
}

// Version used for last-write-wins; review logs have only a timestamp.
function versionOf(table: SyncTableName, row: Row): number {
  const value = table === 'reviewLogs' ? row.timestamp : row.updatedAt;
  return typeof value === 'number' ? value : 0;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
}

async function applyRemote(records: RemoteRecord[]): Promise<number> {
  let applied = 0;
  for (const [table, key] of SYNC_TABLES) {
    const incoming = records.filter((r) => r.table === table);
    if (incoming.length === 0) continue;
    const rows = incoming.map((r) => ({ remote: r, row: JSON.parse(r.payload) as Row }));
    const store = db.table(table);
    const locals = (await store.bulkGet(rows.map((r) => r.row[key] as string))) as Array<Row | undefined>;

    const toWrite: Row[] = [];
    const meta: Array<{ key: string; value: number }> = [];
    rows.forEach(({ row }, i) => {
      const local = locals[i];
      const remoteVersion = versionOf(table, row);
      const id = row[key] as string;
      if (!local) {
        toWrite.push(row);
        meta.push({ key: recordKey(table, id), value: remoteVersion });
        applied++;
      } else if (table === 'reviewLogs') {
        meta.push({ key: recordKey(table, id), value: remoteVersion });
      } else if (remoteVersion > versionOf(table, local)) {
        toWrite.push(row);
        meta.push({ key: recordKey(table, id), value: remoteVersion });
        applied++;
      } else if (remoteVersion === versionOf(table, local)) {
        meta.push({ key: recordKey(table, id), value: remoteVersion });
      }
      // Local is newer: leave it; it is still "dirty" and goes up in the push.
    });
    if (toWrite.length > 0) await store.bulkPut(toWrite);
    if (meta.length > 0) await db.syncMeta.bulkPut(meta);
  }
  return applied;
}

interface Dirty {
  record: RemoteRecord;
  version: number;
}

async function collectDirty(): Promise<Dirty[]> {
  const synced = new Map<string, number>();
  for (const row of await db.syncMeta.toArray()) synced.set(row.key, row.value);

  const dirty: Dirty[] = [];
  for (const [table, key] of SYNC_TABLES) {
    for (const row of (await db.table(table).toArray()) as Row[]) {
      const id = row[key] as string;
      const version = versionOf(table, row);
      if (synced.get(recordKey(table, id)) === version) continue;
      dirty.push({
        record: { table, id, updatedAt: version, payload: JSON.stringify(row) },
        version,
      });
    }
  }
  return dirty;
}

export async function syncOnce(adapter: SyncAdapter): Promise<SyncReport> {
  const user = await adapter.getUser();
  if (!user) throw new SyncError('auth', 'Chưa đăng nhập.');

  // An older build ignores tables it does not know yet but still moves its
  // cursor past their records, so after an app update those rows would never
  // arrive. When the set of synced tables differs from what the cursor was
  // recorded for, pull everything again (applying is idempotent: versions
  // are compared per record).
  const signature = tablesSignature();
  const signatureRow = await db.syncMeta.get(TABLES_KEY);
  const cursorRow = await db.syncMeta.get(cursorKey(user.id));
  const stale = signatureRow?.value !== signature;
  const pulledResult = await adapter.pull(stale ? 0 : (cursorRow?.value ?? 0));
  const pulled = await applyRemote(pulledResult.records);
  // Saved only after the pulled records are safely applied.
  await db.syncMeta.put({ key: cursorKey(user.id), value: pulledResult.cursor });
  if (stale) await db.syncMeta.put({ key: TABLES_KEY, value: signature });

  const dirty = await collectDirty();
  if (dirty.length > 0) {
    await adapter.push(dirty.map((d) => d.record));
    // Mark the versions that were sent (not whatever the row is now), so an
    // edit made while pushing is still picked up next time.
    await db.syncMeta.bulkPut(
      dirty.map((d) => ({ key: recordKey(d.record.table, d.record.id), value: d.version })),
    );
  }
  return { pushed: dirty.length, pulled };
}

// Forget what was synced (used when signing out of an account, so the next
// account starts clean and everything is offered to it again).
export async function resetSyncState(): Promise<void> {
  await db.syncMeta.clear();
}
