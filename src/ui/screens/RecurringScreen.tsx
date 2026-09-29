import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { PendingList } from '../components/PendingList';
import { Field, MoneyInput, primaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { usePending, useRecurring } from '../data';
import { db } from '../../db/db';
import type { Recurring } from '../../domain/schemas';
import { isLive, monthlyNormalized } from '../../calc/recurring';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { parseAmountToAgorot, sumAgorot } from '../../calc/money';
import { markRecurringPaid } from '../../services/recurring';
import { he } from '../strings.he';

const R = he.recurring;

function PayUsage({ item, onDone }: { item: Recurring; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0) return setError(he.txForm.errors.amount);
    await markRecurringPaid(db, item.id, { amountAgorot: a });
    onDone();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label={R.actualAmount} error={error}>
        {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} autoFocus />}
      </Field>
      <button type="submit" className={primaryBtn}>
        {R.markPaid}
      </button>
    </form>
  );
}

export function RecurringScreen() {
  const items = useRecurring();
  const pending = usePending();
  const toast = useToast();
  const [usage, setUsage] = useState<Recurring | null>(null);
  const today = todayIL();

  const live = useMemo(() => (items ?? []).filter(isLive).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)), [items]);
  const inactive = (items ?? []).filter((r) => !isLive(r));
  const totals = useMemo(
    () => ({
      expense: sumAgorot(live.filter((r) => r.kind === 'bill' || r.kind === 'subscription').map((r) => monthlyNormalized(r.amountAgorot, r.frequency))),
      income: sumAgorot(live.filter((r) => r.kind === 'income').map((r) => monthlyNormalized(r.amountAgorot, r.frequency))),
    }),
    [live],
  );
  const recurringPending = (pending ?? []).filter((t) => t.links?.recurringId).sort((a, b) => a.date.localeCompare(b.date));

  async function pay(r: Recurring) {
    if (r.frequency === 'usage_based' || !r.amountAgorot) return setUsage(r);
    await markRecurringPaid(db, r.id);
    toast({ message: R.paidToast });
  }

  const row = (r: Recurring) => (
    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
      <Link to={`/plan/recurring/${r.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-medium">{r.name}</span>
        <span className="block text-xs text-muted">
          {R.kinds[r.kind]} · {R.frequencies[r.frequency]} · <span className={r.nextDueDate < today ? 'text-expense' : ''}>{r.nextDueDate < today ? R.overdue : R.next}</span>{' '}
          <span className="num">{formatDisplayDate(r.nextDueDate)}</span>
        </span>
      </Link>
      {r.amountAgorot !== undefined && <Money agorot={r.kind === 'income' ? r.amountAgorot : -r.amountAgorot} tone={r.kind === 'income' ? 'income' : r.kind === 'transfer' ? 'transfer' : 'expense'} className="text-sm" />}
      {isLive(r) && (
        <button type="button" onClick={() => void pay(r)} className="min-h-10 shrink-0 rounded-full bg-brand-soft px-3 text-sm font-medium text-brand-text">
          {R.markPaid}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ScreenHeader title={R.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="grid grid-cols-2 gap-3 rounded-card bg-brand p-5 text-on-brand">
          <div>
            <p className="text-sm text-on-brand-muted">{R.monthlyExpenses}</p>
            <Money agorot={totals.expense} className="text-2xl font-bold" />
          </div>
          <div>
            <p className="text-sm text-on-brand-muted">{R.monthlyIncome}</p>
            <Money agorot={totals.income} className="text-2xl font-bold" />
          </div>
          <p className="col-span-2 text-xs text-on-brand-muted">{R.normalizedHint}</p>
        </section>

        <PendingList items={recurringPending} />

        <Link to="/plan/recurring/new" className={primaryBtn}>
          <Icon name="plus" size={18} />
          {R.add}
        </Link>

        {live.length === 0 && inactive.length === 0 && <p className="text-center text-sm text-muted">{R.empty}</p>}
        {live.length > 0 && <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{live.map(row)}</div>}
        {inactive.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer px-1 py-2 text-sm font-medium text-muted">
              {R.inactive} ({inactive.length})
            </summary>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface opacity-70">{inactive.map(row)}</div>
          </details>
        )}
      </div>
      <BottomSheet open={!!usage} title={usage?.name ?? ''} onClose={() => setUsage(null)}>
        {usage && <PayUsage key={usage.id} item={usage} onDone={() => setUsage(null)} />}
      </BottomSheet>
    </>
  );
}
