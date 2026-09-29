import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { BottomSheet } from '../components/BottomSheet';
import { Field, inputCls, secondaryBtn, Segmented } from '../components/Form';
import { TransactionRow } from '../components/TransactionRow';
import { byId, categoryLabel, useAccounts, useCards, useCategories, usePayees, useTransactions } from '../data';
import { allTags, filterTransactions, groupByDay, sortTransactions, type TransactionFilter } from '../../calc/transactionFilter';
import { summarizeFlows } from '../../calc/cashflow';
import { formatDayHeader } from '../dates';
import type { TransactionKind } from '../../domain/schemas';
import { he } from '../strings.he';

const T = he.transactions;
const PAGE = 100;

/** Filters live in the URL, so back/forward and links keep them. */
function useFilter(): [TransactionFilter, (f: TransactionFilter) => void] {
  const [params, setParams] = useSearchParams();
  const filter: TransactionFilter = {
    text: params.get('q') ?? undefined,
    accountId: params.get('account') ?? undefined,
    cardId: params.get('card') ?? undefined,
    categoryId: params.get('category') ?? undefined,
    tag: params.get('tag') ?? undefined,
    context: (params.get('context') as TransactionFilter['context']) ?? undefined,
    kinds: params.get('kind') ? (params.get('kind')!.split(',') as TransactionKind[]) : undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
  const set = (f: TransactionFilter) => {
    const next = new URLSearchParams();
    if (f.text) next.set('q', f.text);
    if (f.accountId) next.set('account', f.accountId);
    if (f.cardId) next.set('card', f.cardId);
    if (f.categoryId) next.set('category', f.categoryId);
    if (f.tag) next.set('tag', f.tag);
    if (f.context) next.set('context', f.context);
    if (f.kinds?.length) next.set('kind', f.kinds.join(','));
    if (f.from) next.set('from', f.from);
    if (f.to) next.set('to', f.to);
    setParams(next, { replace: true });
  };
  return [filter, set];
}

export function TransactionsScreen() {
  const txs = useTransactions();
  const accountsList = useAccounts();
  const categoriesList = useCategories();
  const accounts = byId(accountsList);
  const categories = byId(categoriesList);
  const payees = byId(usePayees());
  const cardsList = useCards();
  const cards = byId(cardsList);
  const [filter, setFilter] = useFilter();
  const [sheet, setSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    if (!txs) return [];
    const extra = (t: (typeof txs)[number]) =>
      [t.payeeId && payees.get(t.payeeId)?.name, categoryLabel(t.categoryId ? categories.get(t.categoryId) : undefined, categories), t.accountId && accounts.get(t.accountId)?.name, t.cardId && cards.get(t.cardId)?.name].filter(Boolean).join(' ');
    return sortTransactions(filterTransactions(txs, filter, extra));
  }, [txs, filter, payees, categories, accounts, cards]);

  const flows = useMemo(() => summarizeFlows(filtered, { from: '0000-01-01', to: '9999-12-31' }), [filtered]);
  const groups = groupByDay(filtered.slice(0, limit));
  const tags = useMemo(() => allTags(txs ?? []), [txs]);
  const activeFilters = [filter.accountId, filter.cardId, filter.categoryId, filter.tag, filter.context, filter.kinds?.length, filter.from, filter.to].filter(Boolean).length;

  return (
    <>
      <ScreenHeader title={T.title} />
      <div className="flex flex-col gap-3 px-4">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">{T.search}</span>
            <Icon name="search" size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
            <input
              type="search"
              className={`${inputCls} ps-10`}
              placeholder={T.searchPlaceholder}
              value={filter.text ?? ''}
              onChange={(e) => {
                setFilter({ ...filter, text: e.target.value || undefined });
                setLimit(PAGE);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-label={T.filters}
            className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl ${activeFilters ? 'bg-brand text-on-brand' : 'bg-surface text-muted'}`}
          >
            <Icon name="filter" size={20} />
            {activeFilters > 0 && <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-expense text-[11px] text-white">{activeFilters}</span>}
          </button>
        </div>

        {txs && txs.length > 0 && (
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <span>{T.count(filtered.length)}</span>
            <span className="flex gap-3">
              <Money agorot={flows.income} tone="income" />
              <Money agorot={-flows.expense} tone="expense" />
            </span>
          </div>
        )}

        {txs && txs.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="list" size={32} className="text-brand-text" />
            <p className="font-medium">{T.emptyTitle}</p>
            <p className="text-sm text-muted">{T.emptyBody}</p>
          </Card>
        )}
        {txs && txs.length > 0 && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">{T.noResults}</p>}

        {groups.map((g) => (
          <section key={g.date}>
            <h2 className="mb-1 px-1 text-xs font-medium text-muted">{formatDayHeader(g.date)}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {g.items.map((t) => (
                <TransactionRow key={t.id} t={t} accounts={accounts} categories={categories} payees={payees} cards={cards} accountId={filter.accountId} />
              ))}
            </div>
          </section>
        ))}
        {filtered.length > limit && (
          <button type="button" className={secondaryBtn} onClick={() => setLimit(limit + PAGE)}>
            {he.common.showMore}
          </button>
        )}
      </div>

      <BottomSheet open={sheet} title={T.filters} onClose={() => setSheet(false)}>
        <div className="flex max-h-[65dvh] flex-col gap-4 overflow-y-auto">
          <Field label={T.filterAccount}>
            {(p) => (
              <select {...p} className={inputCls} value={filter.accountId ?? ''} onChange={(e) => setFilter({ ...filter, accountId: e.target.value || undefined })}>
                <option value="">{he.common.all}</option>
                {(accountsList ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {(cardsList ?? []).length > 0 && (
            <Field label={he.transactions.filterCard}>
              {(p) => (
                <select {...p} className={inputCls} value={filter.cardId ?? ''} onChange={(e) => setFilter({ ...filter, cardId: e.target.value || undefined })}>
                  <option value="">{he.common.all}</option>
                  {(cardsList ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.name} ·· ${c.last4}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label={T.filterCategory}>
            {(p) => (
              <select {...p} className={inputCls} value={filter.categoryId ?? ''} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value || undefined })}>
                <option value="">{he.common.all}</option>
                {(categoriesList ?? [])
                  .filter((c) => !c.deletedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(c, categories)}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          {tags.length > 0 && (
            <Field label={T.filterTag}>
              {(p) => (
                <select {...p} className={inputCls} value={filter.tag ?? ''} onChange={(e) => setFilter({ ...filter, tag: e.target.value || undefined })}>
                  <option value="">{he.common.all}</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label={T.filterKind}>
            {(p) => (
              <select {...p} className={inputCls} value={filter.kinds?.join(',') ?? ''} onChange={(e) => setFilter({ ...filter, kinds: e.target.value ? (e.target.value.split(',') as TransactionKind[]) : undefined })}>
                <option value="">{he.common.all}</option>
                <option value="income">{he.kind.income}</option>
                <option value="expense">{he.kind.expense}</option>
                <option value="refund">{he.kind.refund}</option>
                <option value="transfer">{he.kind.transfer}</option>
                <option value="opening_balance,adjustment">{`${he.kind.opening_balance}, ${he.kind.adjustment}`}</option>
              </select>
            )}
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">{T.filterContext}</p>
            <Segmented
              label={T.filterContext}
              value={filter.context ?? 'all'}
              onChange={(v) => setFilter({ ...filter, context: v === 'all' ? undefined : v })}
              options={[
                { value: 'all', label: he.context.all },
                { value: 'personal', label: he.context.personal },
                { value: 'business', label: he.context.business },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={T.filterFrom}>{(p) => <input {...p} type="date" className={inputCls} value={filter.from ?? ''} onChange={(e) => setFilter({ ...filter, from: e.target.value || undefined })} />}</Field>
            <Field label={T.filterTo}>{(p) => <input {...p} type="date" className={inputCls} value={filter.to ?? ''} onChange={(e) => setFilter({ ...filter, to: e.target.value || undefined })} />}</Field>
          </div>
          <button type="button" className={secondaryBtn} onClick={() => setFilter({ text: filter.text })}>
            {T.clearFilters}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
