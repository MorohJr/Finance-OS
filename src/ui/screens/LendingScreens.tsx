import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { Field, MoneyInput, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useAccounts, useLendings, useTransactions } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import type { Lending } from '../../domain/schemas';
import { createLending, deleteLending, recordRepayment, updateLending } from '../../services/debts';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { parseAmountToAgorot, parsePercentToBp } from '../../calc/money';
import { agorotToInput, bpToInput } from '../format';
import { he } from '../strings.he';

const D = he.debts;

export function LendingFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/debts?tab=given');
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const [existing, setExisting] = useState<Lending>();
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({ borrowerName: '', principal: '', rate: '', date: todayIL(), fromAccountId: '', expectedEndDate: '', note: '' });
  const [error, setError] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      const l = await db.lendings.get(id);
      if (!l) return navigate('/debts?tab=given', { replace: true });
      setExisting(l);
      setF({ borrowerName: l.borrowerName, principal: agorotToInput(l.principalAgorot), rate: bpToInput(l.ratePct), date: l.date, fromAccountId: l.fromAccountId, expectedEndDate: l.expectedEndDate ?? '', note: l.note ?? '' });
      setLoaded(true);
    })();
  }, [id, navigate]);

  const fromAccountId = f.fromAccountId || accounts[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const principal = parseAmountToAgorot(f.principal);
    const rate = f.rate.trim() ? parsePercentToBp(f.rate) : undefined;
    if (!principal || principal <= 0 || rate === null || !f.borrowerName.trim()) return setError(he.txForm.errors.amount);
    const input = { borrowerName: f.borrowerName.trim(), principalAgorot: principal, ratePct: rate ?? undefined, date: f.date, fromAccountId, expectedEndDate: f.expectedEndDate || undefined, note: f.note.trim() || undefined };
    const saved = existing ? await updateLending(db, existing.id, input) : await createLending(db, input);
    navigate(`/debts/lendings/${saved.id}`, { replace: true });
  }

  if (!loaded) return <ScreenHeader title={D.editLending} back />;
  return (
    <>
      <ScreenHeader title={existing ? D.editLending : D.addLending} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={D.borrower}>{(p) => <input {...p} className={inputCls} value={f.borrowerName} onChange={(e) => set({ borrowerName: e.target.value })} />}</Field>
        <Field label={D.principal}>{(p) => <MoneyInput {...p} value={f.principal} onChange={(principal) => set({ principal })} />}</Field>
        <Field label={D.lendingRate}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.rate} onChange={(e) => set({ rate: e.target.value })} />}</Field>
        <Field label={D.lendingDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
        <Field label={D.fromAccount}>
          {(p) => (
            <select {...p} className={inputCls} value={fromAccountId} onChange={(e) => set({ fromAccountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={D.expectedEnd}>{(p) => <input {...p} type="date" className={inputCls} value={f.expectedEndDate} onChange={(e) => set({ expectedEndDate: e.target.value })} />}</Field>
        <Field label={D.note}>{(p) => <textarea {...p} rows={2} className={`${inputCls} py-2`} value={f.note} onChange={(e) => set({ note: e.target.value })} />}</Field>
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
        {existing && (
          <button
            type="button"
            className={dangerBtn}
            onClick={async () => {
              await deleteLending(db, existing.id);
              goBack();
            }}
          >
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}

export function LendingDetailScreen() {
  const { id } = useParams();
  const lendings = useLendings();
  const txs = useTransactions();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayIL());
  const [error, setError] = useState('');
  const entry = lendings?.find((l) => l.lending.id === id);
  if (!lendings) return <ScreenHeader title="" back />;
  if (!entry) return <ScreenHeader title={D.title} back />;
  const { lending, status } = entry;
  const repayments = (txs ?? []).filter((t) => t.links?.lendingId === lending.id && t.kind === 'lending_repayment').sort((a, b) => b.date.localeCompare(a.date));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0) return setError(he.txForm.errors.amount);
    await recordRepayment(db, lending.id, a, accountId || lending.fromAccountId, date);
    setOpen(false);
    toast({ message: D.repaymentRecorded });
  }

  return (
    <>
      <ScreenHeader title={lending.borrowerName} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-on-brand-muted">{D.toCollect}</p>
              <Money agorot={status.remaining} className="text-3xl font-bold" />
            </div>
            <Link to={`/debts/lendings/${lending.id}/edit`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <Icon name="edit" size={20} />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-on-brand-muted">{D.totalDue}</p>
              <Money agorot={status.totalDue} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{D.repaid}</p>
              <Money agorot={status.repaid} className="font-medium" />
            </div>
          </div>
        </section>
        {!status.isPaidOff && (
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              setAmount(agorotToInput(status.remaining));
              setAccountId(lending.fromAccountId);
              setError('');
              setOpen(true);
            }}
          >
            {D.recordRepayment}
          </button>
        )}
        {repayments.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {repayments.map((t) => (
              <Link key={t.id} to={`/transactions/${t.id}`} className="flex min-h-12 items-center justify-between px-4 text-sm">
                <span className="num text-muted">{formatDisplayDate(t.date)}</span>
                <Money agorot={t.amountAgorot} tone="income" />
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomSheet open={open} title={D.recordRepayment} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={D.paymentAmount} error={error}>
            {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
          </Field>
          <Field label={D.repaymentTo}>
            {(p) => (
              <select {...p} className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
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
