import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { TransactionRow } from '../components/TransactionRow';
import { byId, useAccounts, useCategories, usePayees, useTransactions } from '../data';
import { accountBalance, balanceSeries, overdraftStatus } from '../../calc/balance';
import { monthRange, summarizeFlows } from '../../calc/cashflow';
import { currentMonthIL, todayIL } from '../../calc/dates';
import { formatBp } from '../../calc/money';
import { groupByDay, sortTransactions } from '../../calc/transactionFilter';
import { formatDayHeader } from '../dates';
import type { TransactionKind } from '../../domain/schemas';
import { he } from '../strings.he';

const BalanceChart = lazy(() => import('../components/BalanceChart'));
const A = he.accounts;

const KIND_FILTERS: { key: string; label: string; kinds?: TransactionKind[] }[] = [
  { key: 'all', label: A.kindFilterAll },
  { key: 'income', label: he.kind.income, kinds: ['income', 'refund'] },
  { key: 'expense', label: he.kind.expense, kinds: ['expense', 'card_payment'] },
  { key: 'transfer', label: he.kind.transfer, kinds: ['transfer'] },
  { key: 'other', label: he.txForm.moreKinds, kinds: ['opening_balance', 'adjustment', 'loan_disbursement', 'loan_payment', 'lending_out', 'lending_repayment', 'investment_trade'] },
];

function daysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function AccountDetailScreen() {
  const { id = '' } = useParams();
  const accounts = useAccounts();
  const txs = useTransactions();
  const categories = byId(useCategories());
  const payees = byId(usePayees());
  const accountMap = byId(accounts);
  const [filter, setFilter] = useState('all');
  const account = accountMap.get(id);

  const mine = useMemo(() => (txs ?? []).filter((t) => t.accountId === id || t.toAccountId === id), [txs, id]);
  const balance = useMemo(() => accountBalance(id, mine), [id, mine]);
  const today = todayIL();
  const series = useMemo(() => balanceSeries(id, mine, daysAgo(today, 90), today), [id, mine, today]);
  const month = useMemo(() => {
    // Account view: income/expense that touched this account this month.
    const own = mine.filter((t) => t.accountId === id);
    return summarizeFlows(own, monthRange(currentMonthIL()));
  }, [mine, id]);

  if (!accounts || !txs) return <ScreenHeader title="" back />;
  if (!account) return <ScreenHeader title={A.title} back />;

  const od = overdraftStatus(balance, account);
  const kinds = KIND_FILTERS.find((f) => f.key === filter)?.kinds;
  const list = groupByDay(sortTransactions(kinds ? mine.filter((t) => kinds.includes(t.kind)) : mine));

  return (
    <>
      <ScreenHeader title={account.name} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-on-brand-muted">
                {A.balance}
                {od.isOverdrawn && ` · ${A.overdrawn}`}
              </p>
              <Money agorot={balance} className="text-4xl font-bold" />
            </div>
            <Link to={`/accounts/${id}/edit`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <Icon name="edit" size={20} />
            </Link>
          </div>
          {(account.overdraftLimit ?? 0) > 0 && (
            <p className="mt-2 text-sm text-on-brand-muted">
              {A.availableWithOverdraft}: <Money agorot={od.availableWithOverdraft} className="text-on-brand" />
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-on-brand-muted">{A.incomeThisMonth}</p>
              <Money agorot={month.income} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{A.expenseThisMonth}</p>
              <Money agorot={month.expense} className="font-medium" />
            </div>
          </div>
        </section>

        {od.alert && (
          <div role="alert" className="flex gap-3 rounded-card bg-warning-soft p-4 text-warning">
            <Icon name="alert" className="shrink-0" />
            <div className="text-sm text-text">
              <p className="font-medium text-warning">{(account.overdraftLimit ?? 0) > 0 ? A.overdraftAlert(formatBp(od.utilizationBp)) : A.overdrawn}</p>
              {od.estimatedMonthlyInterest > 0 && (
                <p>
                  {A.monthlyInterest}: <Money agorot={od.estimatedMonthlyInterest} />
                </p>
              )}
            </div>
          </div>
        )}

        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-muted">{A.balanceChart}</h2>
          <Suspense fallback={<div className="h-44" />}>
            <BalanceChart points={series} />
          </Suspense>
        </section>

        <div className="flex items-center justify-between">
          <h2 className="px-1 text-sm font-medium text-muted">{A.transactions}</h2>
          <Link to={`/transactions/new?accountId=${id}`} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-brand-soft px-4 text-sm font-medium text-brand-text">
            <Icon name="plus" size={18} />
            {A.addTransaction}
          </Link>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label={he.transactions.filterKind}>
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${filter === f.key ? 'bg-brand text-on-brand' : 'bg-surface text-muted'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {list.map((g) => (
          <section key={g.date}>
            <h3 className="mb-1 px-1 text-xs font-medium text-muted">{formatDayHeader(g.date)}</h3>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {g.items.map((t) => (
                <TransactionRow key={t.id} t={t} accounts={accountMap} categories={categories} payees={payees} accountId={id} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
