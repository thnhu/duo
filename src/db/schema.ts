import Dexie, { type EntityTable } from 'dexie';
import type {
  Concept,
  Dictionary,
  Example,
  ExampleLink,
  ImportBatch,
  ImportMapping,
  ReviewLog,
  ScheduleState,
  Settings,
  SyncMetaRow,
} from './types';

export class DuoDB extends Dexie {
  dictionaries!: EntityTable<Dictionary, 'id'>;
  concepts!: EntityTable<Concept, 'id'>;
  examples!: EntityTable<Example, 'id'>;
  exampleLinks!: EntityTable<ExampleLink, 'id'>;
  scheduleStates!: EntityTable<ScheduleState, 'exampleId'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  importMappings!: EntityTable<ImportMapping, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  syncMeta!: EntityTable<SyncMetaRow, 'key'>;

  constructor(name = 'duo') {
    super(name);
    this.version(1).stores({
      dictionaries: 'id, lang',
      concepts: 'id, dictionaryId, lang, status, [dictionaryId+text], updatedAt, deletedAt',
      examples: 'id, dictionaryId, targetConceptId, attributesStatus, updatedAt, deletedAt',
      scheduleStates: 'exampleId, due, updatedAt',
      reviewLogs: 'id, conceptId, exampleId, timestamp',
      importMappings: 'id, name',
      settings: 'id',
    });
    // v2 (M3): adds the importBatches table. Existing rows are untouched;
    // only the stored schemaVersion in Settings is bumped.
    this.version(2)
      .stores({ importBatches: 'id, createdAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 2;
          });
      });
    // v3 (M7b): adds syncMeta, the sync engine's own bookkeeping (what was
    // already synced, pull cursor). Existing rows are untouched.
    this.version(3)
      .stores({ syncMeta: 'key' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 3;
          });
      });
    // v4 (M11a): adds exampleLinks (example -> concept links, depth mode).
    // Existing rows are untouched.
    this.version(4)
      .stores({ exampleLinks: 'id, exampleId, conceptId, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 4;
          });
      });
  }
}

export const db = new DuoDB();
