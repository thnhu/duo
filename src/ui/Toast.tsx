import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

// Toasts replace blocking confirm()/alert() boxes: a small badge that says
// what happened ("Đã lưu"), can carry one action ("Hoàn tác") and goes away
// by itself. It lives above the router, so it survives a redirect: save, go to
// the Library, and the badge is still there.

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastOptions {
  kind?: ToastKind;
  // One optional action, e.g. "Hoàn tác" after a delete.
  action?: { label: string; onClick: () => void | Promise<void> };
  // Milliseconds; default 4 s, 7 s when there is an action or it is an error.
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  text: string;
}

interface ToastApi {
  show: (text: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 2;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((text: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    // A new badge replaces the old plain ones, so confirmations never pile up
    // over the page; one that carries an action ("Hoàn tác") stays until it ends.
    setItems((current) => [...current.filter((t) => t.action), { ...options, id, text }].slice(-MAX_VISIBLE));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="region" aria-label="Thông báo">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const kind = item.kind ?? 'success';
  const duration = item.duration ?? (item.action || kind === 'error' ? 7000 : 4000);

  // The timer stops while the pointer or focus is on the toast, so a user
  // reading it or reaching for "Hoàn tác" is never raced.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, duration, onDismiss]);

  return (
    <div
      className={[styles.toast, styles[kind]].join(' ')}
      role={kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon} aria-hidden>
        {kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'}
      </span>
      <span className={styles.text}>{item.text}</span>
      {item.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            void item.action!.onClick();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Đóng thông báo" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
