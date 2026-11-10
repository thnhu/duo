import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createDefaultAttributes } from '../db/defaults';
import { conceptRepository, exampleRepository, scheduleStateRepository } from '../db/repositories';
import type { Concept, Example } from '../db/types';
import { resetSyncState, syncOnce } from './engine';
import { parseFirebaseConfig, toSyncError } from './firebase';
import { SyncError, type PullResult, type RemoteRecord, type SyncAdapter } from './types';

// An in-memory "cloud" standing in for Firebase.
class FakeCloud implements SyncAdapter {
  id = 'fake';
  label = 'Fake';
  docs = new Map<string, { record: RemoteRecord; syncedAt: number }>();
  clock = 0;
  user: { id: string; label: string } | null = { id: 'u1', label: 'po@example.com' };
  failWith: SyncError | null = null;
  pushes: RemoteRecord[][] = [];

  isConfigured = () => true;
  configure() {}
  clearConfiguration() {}
  getUser = async () => this.user;
  signInWithEmail = async () => this.user!;
  signOut = async () => {};

  async push(records: RemoteRecord[]) {
    if (this.failWith) throw this.failWith;
    this.pushes.push(records);
    for (const record of records) {
      this.docs.set(`${record.table}~${record.id}`, { record, syncedAt: ++this.clock });
    }
  }

  async pull(cursor: number): Promise<PullResult> {
    if (this.failWith) throw this.failWith;
    const hits = [...this.docs.values()].filter((d) => d.syncedAt >= cursor);
    return { records: hits.map((d) => d.record), cursor: Math.max(cursor, ...hits.map((d) => d.syncedAt)) };
  }

  // Something another device uploaded.
  inject(table: RemoteRecord['table'], row: object, updatedAt: number) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? r.exampleId);
    this.docs.set(`${table}~${id}`, {
      record: { table, id, updatedAt, payload: JSON.stringify(row) },
      syncedAt: ++this.clock,
    });
  }
}

function concept(id: string, text: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'dict-de', lang: 'de', text, meanings: [], verification: 'unverified',
    source: { type: 'quick-add' }, status: 'loaded', createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function example(id: string, conceptId: string): Example {
  return {
    id, dictionaryId: 'dict-de', text: id, targetConceptId: conceptId,
    attributes: createDefaultAttributes(), attributesStatus: 'empty', verification: 'unverified',
    createdAt: 1, updatedAt: 1,
  };
}

let cloud: FakeCloud;

beforeEach(async () => {
  for (const table of db.tables) await table.clear();
  cloud = new FakeCloud();
});

describe('sync engine: push', () => {
  it('uploads local records once, then nothing until something changes', async () => {
    await conceptRepository.add(concept('c1', 'Apfel'));
    await exampleRepository.add(example('e1', 'c1'));
    await db.reviewLogs.add({
      id: 'l1', conceptId: 'c1', exampleId: 'e1', exerciseType: 'x', correct: true, responseTimeMs: 1, timestamp: 5,
    });

    expect(await syncOnce(cloud)).toEqual({ pushed: 3, pulled: 0 });
    expect([...cloud.docs.keys()].sort()).toEqual(['concepts~c1', 'examples~e1', 'reviewLogs~l1']);

    // Nothing changed: no writes at all (saves the free-tier quota).
    cloud.pushes = [];
    expect(await syncOnce(cloud)).toEqual({ pushed: 0, pulled: 0 });
    expect(cloud.pushes).toEqual([]);

    // Only the edited record goes up.
    await conceptRepository.update('c1', { text: 'Äpfel' });
    expect((await syncOnce(cloud)).pushed).toBe(1);
    expect(JSON.parse(cloud.docs.get('concepts~c1')!.record.payload).text).toBe('Äpfel');
  });

  it('syncs schedules and soft deletions as ordinary updates, never the settings', async () => {
    await conceptRepository.add(concept('c1', 'Apfel'));
    await scheduleStateRepository.add({ exampleId: 'e1', due: 9, intervalDays: 1, lapses: 0, updatedAt: 1 });
    await db.settings.add({ id: 'default' } as never);
    await db.importBatches.add({ id: 'b1' } as never);
    await syncOnce(cloud);
    expect([...cloud.docs.keys()].sort()).toEqual(['concepts~c1', 'scheduleStates~e1']);

    await conceptRepository.softDelete('c1');
    await syncOnce(cloud);
    expect(JSON.parse(cloud.docs.get('concepts~c1')!.record.payload).deletedAt).toBeTypeOf('number');
  });
});

describe('sync engine: pull', () => {
  it('adds what another device uploaded, and does not send it back', async () => {
    cloud.inject('concepts', concept('r1', 'Haus', { updatedAt: 500 }), 500);
    cloud.inject('reviewLogs', { id: 'rl', conceptId: 'r1', exampleId: 'x', exerciseType: 'y', correct: false, responseTimeMs: 9, timestamp: 600 }, 600);

    expect(await syncOnce(cloud)).toEqual({ pushed: 0, pulled: 2 });
    expect((await db.concepts.get('r1'))?.text).toBe('Haus');
    expect(await db.reviewLogs.get('rl')).toBeDefined();
    expect(cloud.pushes).toEqual([]);
  });

  it('newer record wins, in both directions', async () => {
    await conceptRepository.add(concept('c1', 'local-old'));
    await conceptRepository.add(concept('c2', 'local-new'));
    const local1 = (await db.concepts.get('c1'))!;
    const local2 = (await db.concepts.get('c2'))!;
    // c1: cloud is newer. c2: local is newer.
    cloud.inject('concepts', { ...local1, text: 'cloud-new', updatedAt: local1.updatedAt + 1000 }, local1.updatedAt + 1000);
    cloud.inject('concepts', { ...local2, text: 'cloud-old', updatedAt: local2.updatedAt - 1000 }, local2.updatedAt - 1000);

    const report = await syncOnce(cloud);
    expect((await db.concepts.get('c1'))?.text).toBe('cloud-new');
    expect((await db.concepts.get('c2'))?.text).toBe('local-new');
    expect(report.pulled).toBe(1);
    // The newer local version replaced the older cloud one.
    expect(JSON.parse(cloud.docs.get('concepts~c2')!.record.payload).text).toBe('local-new');
  });

  it('a deletion made on another device arrives and hides the word here', async () => {
    await conceptRepository.add(concept('c1', 'Apfel'));
    await syncOnce(cloud);
    const row = (await db.concepts.get('c1'))!;
    cloud.inject('concepts', { ...row, deletedAt: row.updatedAt + 10, updatedAt: row.updatedAt + 10 }, row.updatedAt + 10);
    await syncOnce(cloud);
    expect((await conceptRepository.listActive()).map((c) => c.id)).toEqual([]);
    expect((await db.concepts.get('c1'))?.deletedAt).toBeDefined(); // soft delete kept
  });

  it('only asks for what is new after the first sync (cursor)', async () => {
    cloud.inject('concepts', concept('r1', 'a', { updatedAt: 10 }), 10);
    await syncOnce(cloud);
    cloud.inject('concepts', concept('r2', 'b', { updatedAt: 11 }), 11);
    const report = await syncOnce(cloud);
    expect(report.pulled).toBe(1); // r1 is the cursor boundary echo and is a no-op
    expect(await db.concepts.count()).toBe(2);
  });

  it('re-pulls from the start when the synced tables changed (old build skipped a table)', async () => {
    cloud.inject('choiceSets', { id: 's1', lang: 'de', name: 'sein', items: ['bin'], createdAt: 1, updatedAt: 5 }, 5);
    // An old build already moved its cursor past the set without storing it.
    await db.syncMeta.put({ key: 'cursor:u1', value: 99 });
    const report = await syncOnce(cloud);
    expect(report.pulled).toBe(1);
    expect((await db.choiceSets.get('s1'))?.name).toBe('sein');
    // The next cycle uses the cursor again.
    cloud.inject('choiceSets', { id: 's2', lang: 'de', name: 'haben', items: ['habe'], createdAt: 1, updatedAt: 6 }, 6);
    expect((await syncOnce(cloud)).pulled).toBe(1);
  });
});

describe('sync engine: failures are soft', () => {
  it('offline: nothing is lost or half-marked, and the next try sends everything', async () => {
    await conceptRepository.add(concept('c1', 'Apfel'));
    cloud.failWith = new SyncError('offline', 'offline');
    await expect(syncOnce(cloud)).rejects.toMatchObject({ kind: 'offline' });
    expect(await db.concepts.count()).toBe(1);
    expect(await db.syncMeta.count()).toBe(0); // nothing marked as synced

    cloud.failWith = null;
    expect((await syncOnce(cloud)).pushed).toBe(1);
  });

  it('signed out: refuses to sync', async () => {
    cloud.user = null;
    await expect(syncOnce(cloud)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('a different account starts clean after resetSyncState', async () => {
    await conceptRepository.add(concept('c1', 'Apfel'));
    await syncOnce(cloud);
    await resetSyncState();
    cloud.docs.clear();
    cloud.pushes = [];
    expect((await syncOnce(cloud)).pushed).toBe(1);
  });
});

describe('firebase helpers', () => {
  it('reads the config as JSON or as the console snippet', () => {
    const json = '{"apiKey":"k","authDomain":"a.firebaseapp.com","projectId":"p","appId":"1:2:web:3"}';
    expect(parseFirebaseConfig(json).projectId).toBe('p');
    const snippet = `// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "k",
  authDomain: "a.firebaseapp.com",
  projectId: "p",
  storageBucket: "p.appspot.com",
  appId: "1:2:web:3",
};`;
    expect(parseFirebaseConfig(snippet)).toMatchObject({ apiKey: 'k', projectId: 'p', appId: '1:2:web:3' });
    expect(() => parseFirebaseConfig('hello')).toThrow(SyncError);
    expect(() => parseFirebaseConfig('{"apiKey":"k"}')).toThrow(/thiếu/);
  });

  it('maps provider errors to the few kinds the app handles', () => {
    expect(toSyncError({ code: 'unavailable' }).kind).toBe('offline');
    expect(toSyncError({ code: 'auth/network-request-failed' }).kind).toBe('offline');
    expect(toSyncError({ code: 'resource-exhausted' }).kind).toBe('quota');
    expect(toSyncError({ code: 'permission-denied' }).kind).toBe('auth');
    expect(toSyncError({ code: 'auth/wrong-password' }).kind).toBe('auth');
    expect(toSyncError({ code: 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' }).message).toMatch(/apiKey/);
    expect(toSyncError(new Error('boom')).kind).toBe('other');
  });
});
