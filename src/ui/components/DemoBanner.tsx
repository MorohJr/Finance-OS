import { useState } from 'react';
import { useDemoMode } from '../data';
import { useToast } from './Toast';
import { db } from '../../db/db';
import { exitDemo } from '../../services/demo/demo';
import { he } from '../strings.he';

/** Always visible while demo data is shown, with the way back (like the Fitness App). */
export function DemoBanner() {
  const demo = useDemoMode();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!demo) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center gap-3 bg-warning px-4 pt-[calc(env(safe-area-inset-top)+6px)] pb-1.5 text-sm text-white">
      <span className="flex-1">
        <span className="font-bold">{he.demo.active}</span> · {he.demo.activeBody}
      </span>
      <button
        type="button"
        disabled={busy}
        className="min-h-9 shrink-0 rounded-full bg-white px-3 text-xs font-medium text-warning"
        onClick={async () => {
          setBusy(true);
          try {
            await exitDemo(db);
            toast({ message: he.demo.restored });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? he.demo.exiting : he.demo.exit}
      </button>
    </div>
  );
}
