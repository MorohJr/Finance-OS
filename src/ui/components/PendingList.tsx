import type { Transaction } from '../../domain/schemas';
import { db } from '../../db/db';
import { resolvePending } from '../../services/recurring';
import { formatDisplayDate } from '../../calc/dates';
import { Money } from './Money';
import { displayAmount } from '../format';
import { he } from '../strings.he';

/** Auto-created recurring transactions waiting for the user (SPEC 10.4). */
export function PendingList({ items }: { items: Transaction[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-1 px-1 text-sm font-medium text-muted">{he.recurring.pendingTitle}</h2>
      <p className="mb-2 px-1 text-xs text-muted">{he.recurring.pendingHint}</p>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-warning/40 bg-surface">
        {items.map((t) => {
          const { agorot, tone } = displayAmount(t);
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.description ?? he.kind[t.kind]}</span>
                <span className="num block text-xs text-muted">{formatDisplayDate(t.date)}</span>
              </span>
              <Money agorot={agorot} tone={tone} className="text-sm" />
              <button type="button" onClick={() => void resolvePending(db, t.id, true)} className="min-h-10 rounded-full bg-brand px-3 text-sm text-on-brand">
                {he.recurring.confirm}
              </button>
              <button type="button" onClick={() => void resolvePending(db, t.id, false)} className="min-h-10 rounded-full bg-surface-2 px-3 text-sm text-muted">
                {he.recurring.cancelTx}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
