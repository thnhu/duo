import type { Table } from 'dexie';
import { db } from './schema';
import { Repository } from './repository';
import type {
  Concept,
  Dictionary,
  Example,
  ImportMapping,
  ReviewLog,
  ScheduleState,
  Settings,
} from './types';

export const dictionaryRepository = new Repository<Dictionary, string>(
  db.dictionaries as unknown as Table<Dictionary, string>,
);
export const conceptRepository = new Repository<Concept, string>(
  db.concepts as unknown as Table<Concept, string>,
);
export const exampleRepository = new Repository<Example, string>(
  db.examples as unknown as Table<Example, string>,
);
export const scheduleStateRepository = new Repository<ScheduleState, string>(
  db.scheduleStates as unknown as Table<ScheduleState, string>,
);
export const importMappingRepository = new Repository<ImportMapping, string>(
  db.importMappings as unknown as Table<ImportMapping, string>,
);
export const settingsRepository = new Repository<Settings, string>(
  db.settings as unknown as Table<Settings, string>,
);

// ReviewLog is append-only (spec section 6.2/6.3: "ReviewLog chỉ thêm mới nên
// không xung đột") so it gets its own minimal repository instead of the
// generic update/soft-delete one.
export const reviewLogRepository = {
  async add(entity: ReviewLog): Promise<string> {
    return (await db.reviewLogs.add(entity)) as unknown as string;
  },
  async listByConceptId(conceptId: string) {
    return db.reviewLogs.where('conceptId').equals(conceptId).toArray();
  },
  async listByExampleId(exampleId: string) {
    return db.reviewLogs.where('exampleId').equals(exampleId).toArray();
  },
  async listAll() {
    return db.reviewLogs.toArray();
  },
};
