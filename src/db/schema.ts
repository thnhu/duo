import Dexie, { type EntityTable } from 'dexie';
import type {
  Concept,
  Dictionary,
  Example,
  ImportBatch,
  ImportMapping,
  ReviewLog,
  ScheduleState,
  Settings,
} from './types';

export class DuoDB extends Dexie {
  dictionaries!: EntityTable<Dictionary, 'id'>;
  concepts!: EntityTable<Concept, 'id'>;
  examples!: EntityTable<Example, 'id'>;
  scheduleStates!: EntityTable<ScheduleState, 'exampleId'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  importMappings!: EntityTable<ImportMapping, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

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
  }
}

export const db = new DuoDB();
