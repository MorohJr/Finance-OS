import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { Field, MoneyInput, inputCls, primaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useLoans } from '../data';
import { db } from '../../db/db';
import { recordLoanPayment } from '../../services/debts';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { formatAgorot, formatBp, parseAmountToAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const D = he.debts;

export function LoanDetailScreen() {
  const { id } = useParams();
  const loans = useLoans();
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIL());
  const [error, setError] = useState('');
  const entry = loans?.find((l) => l.loan.id === id);
  if (!loans) return <ScreenHeader title="" back />;
  if (!entry) return <ScreenHeader title={D.title} back />;
  const { loan, status } = entry;

  async function onPay(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0) return setError(he.txForm.errors.amount);
    await recordLoanPayment(db, loan.id, { amountAgorot: a, date });
    setPaying(false);
    toast({ message: D.paymentRecorded });
  }

  return (
    <>
      <ScreenHeader title={loan.name} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-on-brand-muted">
                {D.remaining} · {D.status[status.status]}
              </p>
              <Money agorot={status.remainingPrincipal} className="text-3xl font-bold" />
            </div>
            <Link to={`/debts/loans/${loan.id}/edit`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <Icon name="edit" size={20} />
            </Link>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/20">
            <div className="h-2 rounded-full bg-white" style={{ width: `${Math.round(status.progressBp / 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-on-brand-muted">{formatBp(status.progressBp)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-on-brand-muted">{D.paidPrincipal}</p>
              <Money agorot={status.paidPrincipal} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{D.paidInterest}</p>
              <Money agorot={status.paidInterest} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{D.totalWithInterest}</p>
              <Money agorot={status.totalWithInterest} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{D.totalInterest}</p>
              <Money agorot={status.totalInterest} className="font-medium" />
            </div>
          </div>
        </section>

        {status.nextPayment && (
          <div className="flex items-center justify-between rounded-card border border-line bg-surface p-4">
            <div>
              <p className="text-sm text-muted">{D.next}</p>
              <p>
                <Money agorot={status.nextPayment.payment} className="font-medium" /> · <span className="num text-sm text-muted">{formatDisplayDate(status.nextPayment.date)}</span>
              </p>
            </div>
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                setAmount(agorotToInput(status.nextPayment!.payment));
                setDate(status.nextPayment!.date < todayIL() ? status.nextPayment!.date : todayIL());
                setError('');
                setPaying(true);
              }}
            >
              {D.recordPayment}
            </button>
          </div>
        )}

        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">{D.schedule}</h2>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  {D.scheduleHead.map((h) => (
                    <th key={h} className="px-2 py-2 text-start font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {status.schedule.map((r) => (
                  <tr key={r.n} className={r.n <= status.splits.length ? 'text-muted' : ''}>
                    <td className="px-2 py-1.5">{r.n <= status.splits.length ? '✓' : r.n}</td>
                    <td className="px-2 py-1.5">{formatDisplayDate(r.date)}</td>
                    <td className="px-2 py-1.5">{formatAgorot(r.payment)}</td>
                    <td className="px-2 py-1.5">{formatAgorot(r.interest)}</td>
                    <td className="px-2 py-1.5">{formatAgorot(r.principal)}</td>
                    <td className="px-2 py-1.5">{formatAgorot(r.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <BottomSheet open={paying} title={D.recordPayment} onClose={() => setPaying(false)}>
        <form onSubmit={onPay} className="flex flex-col gap-4">
          <Field label={D.paymentAmount} error={error}>
            {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
          </Field>
          <Field label={he.txForm.date}>{(p) => <input {...p} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <button type="submit" className={primaryBtn}>
            {he.common.save}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
