// Device-local AI state (spec 8 `LocalSecrets`). Kept in localStorage on
// purpose: Dexie tables are exported in backups and pushed by sync, and the
// API key must do neither (principle 10).

const KEY_STORAGE = 'duo.ai.apiKey';
const USAGE_STORAGE = 'duo.ai.usage';

export function loadApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() || null;
  } catch {
    return null;
  }
}

export function saveApiKey(key: string | null): void {
  const trimmed = key?.trim();
  if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
  else localStorage.removeItem(KEY_STORAGE);
}

interface Usage {
  day: string;
  count: number;
}

// Local calendar day, matching how acquisition counts days.
function today(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function readUsage(): Usage {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_STORAGE) ?? 'null') as Usage | null;
    if (raw && raw.day === today() && Number.isFinite(raw.count)) return raw;
  } catch {
    // fall through to a fresh counter
  }
  return { day: today(), count: 0 };
}

// Calls made today on this device, shown so PO can watch the free quota.
export function callsToday(): number {
  return readUsage().count;
}

export function recordCall(): void {
  const usage = readUsage();
  localStorage.setItem(USAGE_STORAGE, JSON.stringify({ day: usage.day, count: usage.count + 1 }));
}
