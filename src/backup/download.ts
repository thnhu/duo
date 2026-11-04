const LAST_BACKUP_KEY = 'duo.lastBackupAt';

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function dateStamp(now: number = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Per-device note of the last JSON backup, so Settings can remind PO.
export function getLastBackupAt(): number | null {
  const value = Number(localStorage.getItem(LAST_BACKUP_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function setLastBackupAt(now: number = Date.now()): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
}
