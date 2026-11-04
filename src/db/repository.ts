import type { Table } from 'dexie';

interface WithUpdatedAt {
  updatedAt: number;
  deletedAt?: number;
}

// All data access goes through a repository (spec section 6.2) so every
// write gets a consistent updatedAt stamp and deletes are always soft.
// Dexie's EntityTable type is invariant enough (via its hook signatures)
// that a generic wrapper can't accept every table's exact type; callers
// pass their EntityTable in as a plain Table<T, PK>.
export class Repository<T extends WithUpdatedAt, PK extends string> {
  private readonly table: Table<T, PK>;

  constructor(table: Table<T, PK>) {
    this.table = table;
  }

  async add(entity: T): Promise<PK> {
    const stamped = { ...entity, updatedAt: Date.now() } as T;
    return this.table.add(stamped);
  }

  async getById(id: PK): Promise<T | undefined> {
    return this.table.get(id);
  }

  async update(id: PK, patch: Partial<T>): Promise<void> {
    await this.table.update(id, { ...patch, updatedAt: Date.now() } as never);
  }

  async softDelete(id: PK): Promise<void> {
    await this.table.update(id, { deletedAt: Date.now(), updatedAt: Date.now() } as never);
  }

  async listActive(): Promise<T[]> {
    const all = await this.table.toArray();
    return all.filter((row) => row.deletedAt === undefined);
  }

  async listAll(): Promise<T[]> {
    return this.table.toArray();
  }
}
