import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { ProgressBar } from '../components/ProgressBar';
import { Field, MoneyInput, Toggle, primaryBtn } from '../components/Form';
import { byId, categoryLabel, useBudget, useCategories } from '../data';
import { useSettings } from '../hooks';
import { db } from '../../db/db';
import type { BudgetLine } from '../../calc/budget';
import { budgetState } from '../../calc/budget';
import { nextMonth, previousMonth } from '../../calc/cashflow';
import { currentMonthIL, formatDisplayMonth } from '../../calc/dates';
import { formatBp, parseAmountToAgorot } from '../../calc/money';
import { setBudgetOverride, setCategoryBudget } from '../../services/recurring';
import { updateSettings } from '../../services/settings';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const B = he.budget;

function EditBudget({ categoryId, month, onDone }: { categoryId: string; month: string; onDone: () => void }) {
  const categories = byId(useCategories());
  const c = categories.get(categoryId);
  const [monthly, setMonthly] = useState(agorotToInput(c?.monthlyBudget));
  const [override, setOverride] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const m = monthly.trim() ? parseAmountToAgorot(monthly) : undefined;
    const o = override.trim() ? parseAmountToAgorot(override) : undefined;
    if (m === null || o === null || (m ?? 0) < 0 || (o ?? 0) < 0) return setError(he.txForm.errors.amount);
    await setCategoryBudget(db, categoryId, m);
    await setBudgetOverride(db, categoryId, month, o ?? null);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="font-medium">{categoryLabel(c, categories)}</p>
      <Field label={B.monthly}>{(p) => <MoneyInput {...p} value={monthly} onChange={setMonthly} />}</Field>
      <Field label={B.thisMonth(formatDisplayMonth(month))} hint={B.thisMonthHint} error={error}>
        {(p) => <MoneyInput {...p} value={override} onChange={setOverride} />}
      </Field>
      <button type="submit" className={primaryBtn}>
        {he.common.save}
      </button>
    </form>
  );
}

function Line({ line, name, onEdit, child = false }: { line: BudgetLine; name: string; onEdit: () => void; child?: boolean }) {
  return (
    <button type="button" onClick={onEdit} className={`flex w-full flex-col gap-1.5 px-4 py-3 text-start active:bg-surface-2 ${child ? 'ps-8' : ''}`}>
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className={child ? 'text-sm' : 'font-medium'}>{child ? `› ${name}` : name}</span>
        <span className="flex items-baseline gap-1 text-sm">
          <Money agorot={line.spent} className="font-medium" />
          {line.budget !== null && (
            <span className="text-muted">
              {B.of('')}
              <Money agorot={line.budget} />
            </span>
          )}
        </span>
      </div>
      {line.budget !== null && <ProgressBar usedBp={line.usedBp} state={line.state} label={name} />}
      {line.budget !== null && (
        <span className={`text-xs ${line.state === 'over' ? 'text-expense' : line.state === 'near' ? 'text-warning' : 'text-muted'}`}>
          {line.state === 'over' ? (
            <>
              {B.over} <Money agorot={line.overBudget} />
            </>
          ) : (
            <>
              {B.left} <Money agorot={line.remaining ?? 0} />
              {line.usedBp !== null && ` · ${formatBp(line.usedBp)}`}
            </>
          )}
        </span>
      )}
    </button>
  );
}

export function BudgetScreen() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? currentMonthIL();
  const budget = useBudget(month);
  const categories = byId(useCategories());
  const settings = useSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const setMonth = (m: string) => setParams({ month: m }, { replace: true });

  const total = budget ? budgetState(budget.totalSpent, budget.totalBudget || null) : undefined;
  const budgeted = budget?.lines.filter((l) => l.budget !== null || l.children.some((c) => c.budget !== null)) ?? [];
  const unbudgeted = budget?.lines.filter((l) => !budgeted.includes(l)) ?? [];

  return (
    <>
      <ScreenHeader title={B.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(previousMonth(month))} aria-label={B.prev} className="flex size-11 items-center justify-center rounded-full bg-surface">
            <Icon name="back" />
          </button>
          <span className="num text-lg font-bold">{formatDisplayMonth(month)}</span>
          <button type="button" onClick={() => setMonth(nextMonth(month))} aria-label={B.next} className="flex size-11 items-center justify-center rounded-full bg-surface">
            <Icon name="chevron" />
          </button>
        </div>

        {budget && total && (
          <section className="rounded-card bg-brand p-5 text-on-brand">
            <p className="text-sm text-on-brand-muted">{B.total}</p>
            <div className="flex items-baseline gap-2">
              <Money agorot={budget.totalSpent} className="text-3xl font-bold" />
              {budget.totalBudget > 0 && (
                <span className="text-on-brand-muted">
                  {B.of('')}
                  <Money agorot={budget.totalBudget} />
                </span>
              )}
            </div>
            {budget.totalBudget > 0 && (
              <>
                <div className="mt-3 h-2 rounded-full bg-white/20">
                  <div className="h-2 rounded-full bg-white" style={{ width: `${Math.min(100, Math.round((total.usedBp ?? 0) / 100))}%` }} />
                </div>
                <p className="mt-2 text-sm text-on-brand-muted">
                  {budget.totalRemaining >= 0 ? B.left : B.over} <Money agorot={Math.abs(budget.totalRemaining)} className="text-on-brand" />
                </p>
              </>
            )}
          </section>
        )}

        {budget && budget.lines.length === 0 && budget.uncategorizedSpent === 0 && <p className="text-center text-sm text-muted">{B.empty}</p>}

        {budgeted.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {budgeted.map((l) => [
              <Line key={l.categoryId} line={l} name={categoryLabel(categories.get(l.categoryId), categories)} onEdit={() => setEditing(l.categoryId)} />,
              ...l.children
                .filter((c) => c.budget !== null || c.spent !== 0)
                .map((c) => <Line key={c.categoryId} child line={c} name={categories.get(c.categoryId)?.name ?? ''} onEdit={() => setEditing(c.categoryId)} />),
            ])}
          </div>
        )}

        {(unbudgeted.length > 0 || (budget?.uncategorizedSpent ?? 0) !== 0) && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{B.notInBudget}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {unbudgeted.map((l) => (
                <Line key={l.categoryId} line={l} name={categoryLabel(categories.get(l.categoryId), categories)} onEdit={() => setEditing(l.categoryId)} />
              ))}
              {budget && budget.uncategorizedSpent !== 0 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span>{B.uncategorized}</span>
                  <Money agorot={budget.uncategorizedSpent} className="font-medium" />
                </div>
              )}
            </div>
          </section>
        )}

        <Link to="/settings/categories" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-soft px-4 text-sm font-medium text-brand-text">
          {B.setBudgets}
        </Link>

        {settings && (
          <div className="rounded-card border border-line bg-surface px-4 py-2">
            <Toggle label={B.includeRecurring} hint={B.includeRecurringHint} checked={settings.includeRecurringInBudget} onChange={(v) => void updateSettings(db, { includeRecurringInBudget: v })} />
          </div>
        )}
      </div>
      <BottomSheet open={!!editing} title={B.edit} onClose={() => setEditing(null)}>
        {editing && <EditBudget key={editing} categoryId={editing} month={month} onDone={() => setEditing(null)} />}
      </BottomSheet>
    </>
  );
}
