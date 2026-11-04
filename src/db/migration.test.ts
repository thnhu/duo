import { describe, expect, it } from 'vitest';
import Dexie, { type EntityTable } from 'dexie';

// Demonstrates the migration mechanism required by spec section 6.2/9.1:
// a schema change must never lose data already on a user's device. This
// does not touch the app's real DuoDB — it is a self-contained proof that
// opening a database at a newer version than what's on disk runs Dexie's
// upgrade() and preserves existing rows while backfilling new fields.

interface ItemV1 {
  id: string;
  name: string;
}

interface ItemV2 extends ItemV1 {
  archived: boolean;
}

const DB_NAME = 'duo-migration-demo';

class DbV1 extends Dexie {
  items!: EntityTable<ItemV1, 'id'>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores({ items: 'id, name' });
  }
}

class DbV2 extends Dexie {
  items!: EntityTable<ItemV2, 'id'>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores({ items: 'id, name' });
    this.version(2)
      .stores({ items: 'id, name, archived' })
      .upgrade(async (tx) => {
        await tx
          .table<ItemV1, string>('items')
          .toCollection()
          .modify((item) => {
            (item as ItemV2).archived = false;
          });
      });
  }
}

describe('schema migration', () => {
  it('preserves existing rows and backfills new fields on upgrade', async () => {
    const dbV1 = new DbV1();
    await dbV1.open();
    await dbV1.items.add({ id: '1', name: 'swallow' });
    dbV1.close();

    const dbV2 = new DbV2();
    await dbV2.open();

    const migrated = await dbV2.items.get('1');
    expect(migrated).toEqual({ id: '1', name: 'swallow', archived: false });

    dbV2.close();
    await Dexie.delete(DB_NAME);
  });
});
