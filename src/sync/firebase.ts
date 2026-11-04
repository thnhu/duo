import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { SyncError, type PullResult, type RemoteRecord, type SyncAdapter, type SyncUser } from './types';

// Firebase (Spark plan, free) implementation of SyncAdapter: Authentication
// (email or Google) + Firestore. No Cloud Storage, no phone auth (spec 6.3).
//
// Data layout: users/{uid}/records/{table}~{id} = { table, id, updatedAt,
// payload, syncedAt }. `syncedAt` is a SERVER timestamp, used as the pull
// cursor so a device with a wrong clock can never make others miss changes.
//
// The Firebase config is not baked into the build: PO pastes it in Settings
// and it stays on this device (a web config is not a secret, but this keeps
// the repo free of project details). The SDK is loaded on demand.

const CONFIG_KEY = 'duo.sync.firebaseConfig';
const PAGE = 500;
const BATCH = 400; // Firestore allows 500 writes per batch
const WRITE_TIMEOUT_MS = 30_000;

export function loadFirebaseConfig(): FirebaseOptions | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as FirebaseOptions) : null;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config: FirebaseOptions | null): void {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}

// Accepts what the Firebase console shows: either plain JSON or the
// `const firebaseConfig = { ... };` JavaScript snippet.
export function parseFirebaseConfig(text: string): FirebaseOptions {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new SyncError('other', 'Không tìm thấy cấu hình (cần có dấu { }).');
  let body = text.slice(start, end + 1);
  try {
    const config = JSON.parse(body) as FirebaseOptions;
    return check(config);
  } catch (error) {
    if (error instanceof SyncError) throw error;
  }
  // JavaScript object literal: quote the keys, drop trailing commas.
  body = body.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/,\s*}/g, '}');
  try {
    return check(JSON.parse(body) as FirebaseOptions);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError('other', 'Không đọc được cấu hình. Hãy dán nguyên khối firebaseConfig từ Firebase console.');
  }
}

function check(config: FirebaseOptions): FirebaseOptions {
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new SyncError('other', 'Cấu hình thiếu apiKey, projectId hoặc appId.');
  }
  return config;
}

interface Sdk {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  authMod: typeof import('firebase/auth');
  fsMod: typeof import('firebase/firestore');
}

let sdkPromise: Promise<Sdk> | null = null;

function loadSdk(config: FirebaseOptions): Promise<Sdk> {
  sdkPromise ??= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    const app = appMod.getApps()[0] ?? appMod.initializeApp(config);
    return { app, auth: authMod.getAuth(app), firestore: fsMod.getFirestore(app), authMod, fsMod };
  })().catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

// Turns SDK errors into the few kinds the app knows how to talk about.
export function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const code = (error as { code?: string })?.code ?? '';
  const message = (error as { message?: string })?.message ?? String(error);
  if (/network|unavailable|offline|deadline/i.test(code) || /offline|network/i.test(message)) {
    return new SyncError('offline', 'Không kết nối được tới dịch vụ đồng bộ. Dữ liệu trên máy vẫn nguyên vẹn.');
  }
  if (code === 'resource-exhausted') {
    return new SyncError('quota', 'Dịch vụ đồng bộ đã hết hạn mức miễn phí hôm nay. App vẫn dùng bình thường; thử lại sau.');
  }
  if (/auth\/(invalid|wrong|user-not-found|email|weak|too-many|popup|operation|unauthorized|api-key)/.test(code)) {
    return new SyncError('auth', authMessage(code));
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return new SyncError('auth', 'Không có quyền ghi dữ liệu. Kiểm tra Security Rules và đăng nhập lại.');
  }
  return new SyncError('other', message);
}

function authMessage(code: string): string {
  if (code.includes('api-key')) return 'Cấu hình Firebase không đúng (apiKey không hợp lệ). Hãy gỡ cấu hình và dán lại.';
  if (code.includes('email-already')) return 'Email này đã có tài khoản — hãy bấm Đăng nhập.';
  if (code.includes('invalid-email')) return 'Email không hợp lệ.';
  if (code.includes('weak-password')) return 'Mật khẩu quá yếu (cần ít nhất 6 ký tự).';
  if (code.includes('too-many')) return 'Thử quá nhiều lần, hãy đợi một lúc.';
  if (code.includes('popup')) return 'Cửa sổ đăng nhập Google bị đóng hoặc bị chặn.';
  if (code.includes('unauthorized-domain')) return 'Tên miền của app chưa được cho phép trong Firebase (Authentication → Settings → Authorized domains).';
  if (code.includes('operation-not-allowed')) return 'Cách đăng nhập này chưa được bật trong Firebase console.';
  return 'Email hoặc mật khẩu không đúng.';
}

function toUser(user: User): SyncUser {
  return { id: user.uid, label: user.email ?? user.displayName ?? user.uid };
}

function docId(record: Pick<RemoteRecord, 'table' | 'id'>): string {
  return `${record.table}~${record.id.replace(/\//g, '%2F')}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SyncError('offline', 'Hết thời gian chờ dịch vụ đồng bộ.')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function requireConfig(): FirebaseOptions {
  const config = loadFirebaseConfig();
  if (!config) throw new SyncError('other', 'Chưa cấu hình Firebase.');
  return config;
}

export const firebaseAdapter: SyncAdapter = {
  id: 'firebase',
  label: 'Firebase (Spark, miễn phí)',

  isConfigured: () => loadFirebaseConfig() !== null,

  configure(text) {
    saveFirebaseConfig(parseFirebaseConfig(text));
    sdkPromise = null;
  },

  clearConfiguration() {
    saveFirebaseConfig(null);
    sdkPromise = null;
  },

  async getUser() {
    try {
      const { auth } = await loadSdk(requireConfig());
      await auth.authStateReady();
      return auth.currentUser ? toUser(auth.currentUser) : null;
    } catch (error) {
      throw toSyncError(error);
    }
  },

  async signInWithEmail(email, password, createAccount) {
    try {
      const { auth, authMod } = await loadSdk(requireConfig());
      const credential = createAccount
        ? await authMod.createUserWithEmailAndPassword(auth, email, password)
        : await authMod.signInWithEmailAndPassword(auth, email, password);
      return toUser(credential.user);
    } catch (error) {
      throw toSyncError(error);
    }
  },

  async signInWithGoogle() {
    try {
      const { auth, authMod } = await loadSdk(requireConfig());
      const credential = await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
      return toUser(credential.user);
    } catch (error) {
      throw toSyncError(error);
    }
  },

  async signOut() {
    try {
      const { auth } = await loadSdk(requireConfig());
      await auth.signOut();
    } catch (error) {
      throw toSyncError(error);
    }
  },

  async push(records) {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new SyncError('offline', 'Đang offline.');
      }
      const { auth, firestore, fsMod } = await loadSdk(requireConfig());
      const uid = auth.currentUser?.uid;
      if (!uid) throw new SyncError('auth', 'Chưa đăng nhập.');
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = fsMod.writeBatch(firestore);
        for (const record of records.slice(i, i + BATCH)) {
          batch.set(fsMod.doc(firestore, 'users', uid, 'records', docId(record)), {
            table: record.table,
            id: record.id,
            updatedAt: record.updatedAt,
            payload: record.payload,
            syncedAt: fsMod.serverTimestamp(),
          });
        }
        // Offline, commit() would wait forever; give up after a while.
        await withTimeout(batch.commit(), WRITE_TIMEOUT_MS);
      }
    } catch (error) {
      throw toSyncError(error);
    }
  },

  async pull(cursor): Promise<PullResult> {
    try {
      const { auth, firestore, fsMod } = await loadSdk(requireConfig());
      const uid = auth.currentUser?.uid;
      if (!uid) throw new SyncError('auth', 'Chưa đăng nhập.');
      const records: RemoteRecord[] = [];
      let newest = cursor;
      let last: Awaited<ReturnType<typeof fsMod.getDocsFromServer>>['docs'][number] | undefined;
      for (;;) {
        const constraints = [
          fsMod.where('syncedAt', '>=', fsMod.Timestamp.fromMillis(cursor)),
          fsMod.orderBy('syncedAt'),
          ...(last ? [fsMod.startAfter(last)] : []),
          fsMod.limit(PAGE),
        ];
        const snapshot = await withTimeout(
          fsMod.getDocsFromServer(fsMod.query(fsMod.collection(firestore, 'users', uid, 'records'), ...constraints)),
          WRITE_TIMEOUT_MS,
        );
        for (const document of snapshot.docs) {
          const data = document.data();
          records.push({ table: data.table, id: data.id, updatedAt: data.updatedAt, payload: data.payload });
          const at = (data.syncedAt as { toMillis(): number } | null)?.toMillis();
          if (at !== undefined && at > newest) newest = at;
        }
        if (snapshot.docs.length < PAGE) break;
        last = snapshot.docs[snapshot.docs.length - 1];
      }
      return { records, cursor: newest };
    } catch (error) {
      throw toSyncError(error);
    }
  },
};
