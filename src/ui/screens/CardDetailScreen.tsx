import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { byId, useCategories, usePayees, useTransactions } from '../data';
import { db } from '../../db/db';
import { cardStatus, futureInstallmentsByMonth, statementStatus, type ComputedStatement } from '../../calc/cards';
import { formatAgorot } from '../../calc/money';
import { formatDisplayDate, formatDisplayMonth, todayIL } from '../../calc/dates';
import { loadCardData, setStatementPayment } from '../../services/cards';
import { transactionTitle } from '../components/TransactionRow';
import { he } from '../strings.he';

const C = he.cards;

export function CardDetailScreen() {
  const { id = '' } = useParams();
  const today = todayIL();
  const data = useLiveQuery(async () => {
    const card = await db.cards.get(id);
    return card ? loadCardData(db, card) : null;
  }, [id]);
  const txs = byId(useTransactions());
  const payees = byId(usePayees());
  const categories = byId(useCategories());
  const payments = useLiveQuery(() => db.transactions.where('kind').equals('card_payment').toArray(), []);
  const paymentById = byId(payments);

  const status = useMemo(() => (data ? cardStatus(data.card, data.statements, data.paidChargeDates, today) : undefined), [data, today]);
  if (data === undefined) return <ScreenHeader title="" back />;
  if (data === null) return <ScreenHeader title={C.title} back />;
  const { card, statements, stored, paidChargeDates } = data;

  const started = statements.filter((s) => s.periodStart <= today).reverse();

  const statementCard = (s: ComputedStatement) => {
    const row = stored.get(s.chargeDate);
    const st = statementStatus(s, paidChargeDates.has(s.chargeDate), today);
    const payment = row?.paymentTransactionId ? paymentById.get(row.paymentTransactionId) : undefined;
    const mismatch = payment && payment.amountAgorot !== s.total && s.total > 0;
    return (
      <details key={s.chargeDate} className="group overflow-hidden rounded-card border border-line bg-surface" open={st !== 'paid' && s === started[0]}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2">
          <span className="flex-1">
            <span className="block font-medium">{C.statementOf(formatDisplayDate(s.chargeDate))}</span>
            <span className="block text-xs text-muted">
              {C.status[st]} · {C.period(formatDisplayDate(s.periodStart), formatDisplayDate(s.periodEnd))}
            </span>
          </span>
          <Money agorot={s.total} className="font-medium" />
          <Icon name="chevron" size={16} className="text-muted transition-transform group-open:-rotate-90" />
        </summary>
        <div className="divide-y divide-line border-t border-line">
          {s.items.map((i, idx) => {
            const t = txs.get(i.transactionId);
            return (
              <Link key={idx} to={`/transactions/${i.transactionId}`} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm active:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t ? transactionTitle(t, payees, categories) : '—'}</span>
                  <span className="block text-xs text-muted">
                    {formatDisplayDate(t?.date ?? i.date)}
                    {i.installment && ` · ${C.installmentOf(i.installment.number, i.installment.count)}`}
                  </span>
                </span>
                <Money agorot={i.amountAgorot} tone={i.amountAgorot < 0 ? 'income' : 'plain'} />
              </Link>
            );
          })}
          {s.carriedIn !== 0 && (
            <div className="flex min-h-10 items-center justify-between px-4 text-sm text-muted">
              <span>{C.carried}</span>
              <Money agorot={s.carriedIn} />
            </div>
          )}
          {mismatch && row && (
            <div className="flex flex-col gap-2 bg-warning-soft px-4 py-3 text-sm">
              <p>{C.paymentMismatch(formatAgorot(payment.amountAgorot), formatAgorot(s.total))}</p>
              <button type="button" className="self-start rounded-full bg-surface px-4 py-2 font-medium" onClick={() => void setStatementPayment(db, row.id, s.total)}>
                {C.alignPayment}
              </button>
            </div>
          )}
        </div>
      </details>
    );
  };

  // Future installments grouped by month.
  const futureByMonth = futureInstallmentsByMonth(statements, today);

  return (
    <>
      <ScreenHeader title={card.name} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-on-brand-muted">
                {C.nextCharge}
                {status?.nextCharge && ` · ${formatDisplayDate(status.nextCharge.chargeDate)}`}
              </p>
              {status?.nextCharge ? <Money agorot={status.nextCharge.total} className="text-4xl font-bold" /> : <p className="text-2xl font-bold">{C.noCharge}</p>}
              <p className="num mt-1 text-sm text-on-brand-muted">·· {card.last4}</p>
            </div>
            <Link to={`/cards/${id}/edit`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <Icon name="edit" size={20} />
            </Link>
          </div>
          {card.kind === 'credit' && status && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-on-brand-muted">{C.openTotal}</p>
                <Money agorot={status.openStatementTotal} className="font-medium" />
              </div>
              <div>
                <p className="text-on-brand-muted">{C.futureInstallments}</p>
                <Money agorot={status.futureInstallmentsTotal} className="font-medium" />
              </div>
              {status.availableCredit !== null && (
                <div>
                  <p className="text-on-brand-muted">{C.available}</p>
                  <Money agorot={status.availableCredit} className="font-medium" />
                </div>
              )}
            </div>
          )}
        </section>

        {card.kind === 'debit' && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{C.debitNote}</p>}

        <Link to={`/transactions/new?kind=expense&cardId=${id}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full bg-brand-soft px-4 text-sm font-medium text-brand-text">
          <Icon name="plus" size={18} />
          {C.addPurchase}
        </Link>

        {card.kind === 'credit' && (
          <>
            <h2 className="px-1 text-sm font-medium text-muted">{C.statements}</h2>
            {started.length === 0 && <p className="text-sm text-muted">{C.empty}</p>}
            {started.map(statementCard)}
            {futureByMonth.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-medium text-muted">{C.futureByMonth}</h2>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {futureByMonth.map((f) => (
                    <div key={f.month} className="flex min-h-12 items-center justify-between px-4 text-sm">
                      <span className="num">{formatDisplayMonth(f.month)}</span>
                      <Money agorot={f.total} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
