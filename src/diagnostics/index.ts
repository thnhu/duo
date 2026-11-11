// On-device log for problems that cannot be seen without devtools (a phone):
// script errors, rejected promises, the page freezing, and taps that do not
// turn into a click (with the element that actually sat on top of the tap).
// Stored only in this browser's localStorage; nothing is sent anywhere.

const KEY = 'duo:diag-log';
const MAX_ENTRIES = 80;
const FREEZE_MS = 3000;
const TAP_CHECK_MS = 700;

export interface DiagEntry {
  at: number;
  kind: 'error' | 'rejection' | 'freeze' | 'dead-tap';
  message: string;
}

export function readLog(): DiagEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

function record(kind: DiagEntry['kind'], message: string): void {
  try {
    const next = [...readLog(), { at: Date.now(), kind, message: message.slice(0, 400) }].slice(-MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable or full: diagnostics must never break the app
  }
}

function describe(el: Element | null): string {
  if (!el) return '(không có)';
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}>${text ? ` "${text}"` : ''}`;
}

let installed = false;

export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => record('error', `${e.message} @ ${e.filename?.split('/').pop() ?? ''}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | undefined;
    record('rejection', String(reason?.message ?? e.reason));
  });

  // Freeze: a 1 s timer that fires much later than 1 s means the main thread was busy.
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    last = Date.now();
  });
  setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (document.visibilityState === 'visible' && gap > FREEZE_MS) {
      record('freeze', `Trang đứng hình khoảng ${Math.round(gap / 1000)} giây`);
    }
  }, 1000);

  // Dead tap: a finger went down on a control and stayed put, yet no click came.
  // Drags, scrolls (pointercancel / page moved), text selection, native pickers and
  // the log box itself are not dead taps. Records what was really under the
  // finger plus how far it moved and how the page/viewport changed.
  const MOVE_PX = 10;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let cleanup: (() => void) | undefined;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const target = e.target as Element | null;
      const onControl = target?.closest('button, a, [role=button], select, input, textarea, label');
      if (!onControl) return;
      if (onControl.closest('[data-diag-ignore]')) return;
      clearTimeout(pending);
      cleanup?.();
      const startScroll = window.scrollY;
      const startViewport = window.visualViewport?.height ?? window.innerHeight;
      let clicked = false;
      let cancelled = false;
      let moved = 0;
      const onClick = () => {
        clicked = true;
      };
      const onMove = (m: PointerEvent) => {
        moved = Math.max(moved, Math.hypot(m.clientX - x, m.clientY - y));
      };
      const onCancel = () => {
        cancelled = true;
      };
      document.addEventListener('click', onClick, { once: true, capture: true });
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointercancel', onCancel, { once: true });
      cleanup = () => {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointercancel', onCancel);
      };
      pending = setTimeout(() => {
        cleanup?.();
        cleanup = undefined;
        if (clicked || cancelled || moved > MOVE_PX) return;
        const selection = window.getSelection?.()?.toString().length ?? 0;
        if (onControl.matches('select')) return;
        if (onControl.matches('textarea, input') && selection > 0) return;
        const scrolled = Math.round(window.scrollY - startScroll);
        const viewport = Math.round((window.visualViewport?.height ?? window.innerHeight) - startViewport);
        if (Math.abs(scrolled) > MOVE_PX) return;
        const top = document.elementFromPoint(x, y);
        record(
          'dead-tap',
          `Chạm ${describe(onControl)} không ra click. Phần tử trên cùng tại điểm chạm: ${describe(top)}. Đang bôi đen: ${selection} ký tự. Dịch ngón tay: ${Math.round(moved)}px, cuộn: ${scrolled}px, viewport đổi: ${viewport}px. Trang: ${location.hash}`,
        );
      }, TAP_CHECK_MS);
    },
    { capture: true, passive: true },
  );
}
