import Dexie, { type EntityTable } from 'dexie';
import type {
  Concept,
  ConceptLink,
  Dictionary,
  Example,
  ExampleLink,
  ImportBatch,
  ImportMapping,
  Lesson,
  Passage,
  ReviewLog,
  ScheduleState,
  Settings,
  SyncMetaRow,
  WordSet,
} from './types';

import { planLessonMigration } from './lessonMigration';

export class DuoDB extends Dexie {
  dictionaries!: EntityTable<Dictionary, 'id'>;
  concepts!: EntityTable<Concept, 'id'>;
  conceptLinks!: EntityTable<ConceptLink, 'id'>;
  examples!: EntityTable<Example, 'id'>;
  exampleLinks!: EntityTable<ExampleLink, 'id'>;
  scheduleStates!: EntityTable<ScheduleState, 'exampleId'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  importMappings!: EntityTable<ImportMapping, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  syncMeta!: EntityTable<SyncMetaRow, 'key'>;
  wordSets!: EntityTable<WordSet, 'id'>;
  passages!: EntityTable<Passage, 'id'>;
  lessons!: EntityTable<Lesson, 'id'>;

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
    // v5 (M11c): adds conceptLinks (concept -> concept, child -> parent).
    // Existing rows are untouched.
    this.version(5)
      .stores({ conceptLinks: 'id, childId, parentId, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 5;
          });
      });
    // v6 (M13): adds wordSets (named groups of concepts). Concepts get an
    // optional `setIds`; existing rows are untouched (in no set).
    this.version(6)
      .stores({ wordSets: 'id, lang, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 6;
          });
      });
    // v7: adds passages (texts studied as gap-fills). Gaps are examples with
    // an optional `passageId`; existing rows are untouched.
    this.version(7)
      .stores({ passages: 'id, lang, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 7;
          });
      });
    // v8 (Bản 8): adds lessons (named topics inside a deck) and the optional
    // `Concept.lessonId`. Lessons are made from the old free-text
    // `source.lesson`, which stays as the record of where the word came from.
    this.version(8)
      .stores({ lessons: 'id, lang, setId, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        const concepts = await tx.table('concepts').toArray();
        const sets = await tx.table('wordSets').toArray();
        const plan = planLessonMigration(concepts, sets, Date.now());
        if (plan.lessons.length > 0) await tx.table('lessons').bulkPut(plan.lessons);
        for (const [conceptId, lessonId] of plan.assignments) {
          await tx.table('concepts').update(conceptId, { lessonId, updatedAt: plan.now });
        }
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 8;
          });
      });
    // v9: an index on examples.passageId, so the gaps of one passage (and how
    // many there are) are looked up without reading every example. Rows are
    // untouched; Dexie builds the index.
    this.version(9)
      .stores({ examples: 'id, dictionaryId, targetConceptId, passageId, attributesStatus, updatedAt, deletedAt' })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((row: { schemaVersion?: number }) => {
            row.schemaVersion = 9;
          });
      });
  }
}

export const db = new DuoDB();
