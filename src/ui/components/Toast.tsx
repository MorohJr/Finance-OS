import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastState {
  message: string;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(t: ToastState) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** One toast at a time, above the bottom nav. Used for "deleted — undo". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((t: ToastState) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
        {toast && (
          <div className="pointer-events-auto flex min-h-12 w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-text px-4 py-2 text-bg shadow-lg">
            <span className="text-sm">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-10 rounded-full px-3 text-sm font-medium text-brand-soft"
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
