import { useRegisterSW } from 'virtual:pwa-register/react';
import { he } from '../strings.he';

/** New version available: update on the user's tap (never mid-form). Data lives in IndexedDB and is untouched. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-3 text-bg shadow-lg">
        <span className="flex-1 text-sm">
          <span className="block font-medium">{he.banners.updateTitle}</span>
          <span className="block text-xs opacity-80">{he.banners.updateBody}</span>
        </span>
        <button type="button" className="min-h-10 rounded-full bg-brand px-3 text-sm font-medium text-on-brand" onClick={() => void updateServiceWorker(true)}>
          {he.banners.updateAction}
        </button>
        <button type="button" aria-label={he.banners.dismiss} className="min-h-10 px-2 text-sm" onClick={() => setNeedRefresh(false)}>
          ✕
        </button>
      </div>
    </div>
  );
}
