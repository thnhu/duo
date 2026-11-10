import { db } from '../db/schema';
import { SYNC_TABLES } from './types';

// Incremental sync (PO 2026-11-10): instead of reading every row of every table
// at each sync to find what changed, each table remembers a "watermark" - the
// newest version (updatedAt, or timestamp for review logs) that is known to be
// uploaded. The next sync looks only at rows from slightly before it.
//
// Anything that writes rows with OLD versions behind the engine's back (a backup
// restore) must call resetWatermarks(), so the next sync scans everything once.

export const WATERMARK_SLACK_MS = 24 * 60 * 60 * 1000;

export const watermarkKey = (table: string) => `wm:${table}`;

// The field that holds a row's version, when it is indexed (a cheap range scan).
// Tables not listed here are tiny and always read whole.
export const VERSION_INDEX: Partial<Record<(typeof SYNC_TABLES)[number][0], string>> = {
  concepts: 'updatedAt',
  examples: 'updatedAt',
  exampleLinks: 'updatedAt',
  conceptLinks: 'updatedAt',
  wordSets: 'updatedAt',
  lessons: 'updatedAt',
  passages: 'updatedAt',
  choiceSets: 'updatedAt',
  scheduleStates: 'updatedAt',
  reviewLogs: 'timestamp',
};

export async function resetWatermarks(): Promise<void> {
  await db.syncMeta.bulkDelete(SYNC_TABLES.map(([table]) => watermarkKey(table)));
}
