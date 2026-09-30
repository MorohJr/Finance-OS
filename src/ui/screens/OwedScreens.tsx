import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { ProgressBar } from '../components/ProgressBar';
import { Field, MoneyInput, Segmented, Toggle, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useAccounts, useCategories, useDebts } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { Debt as DebtSchema, DebtCharge as ChargeSchema, type Debt } from '../../domain/schemas';
import { addDebtCharge, deleteDebt, recordDebtPayment, removeDebtCharge, saveDebt } from '../../services/debts2';
import { ValidationError } from '../../services/entity';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { formatAgorot, parseAmountToAgorot, sumAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const O = he.owed;

/** The "חובות" tab of the debts screen (owner request 01/10/2026). */
export function OwedList() {
  const debts = useDebts();
  const open = (debts ?? []).filter((d) => !d.status.isSettled);
  const closed = (debts ?? []).filter((d) => d.status.isSettled);
  return (
    <>
      <section className="grid grid-cols-2 gap-2 rounded-card bg-brand p-4 text-on-brand">
        <div>
          <p className="text-xs text-on-brand-muted">{O.totalRemaining}</p>
          <Money agorot={sumAgorot(open.map((d) => d.status.remaining))} className="text-xl font-bold" />
        </div>
        <div>
          <p className="text-xs text-on-brand-muted">{O.monthly}</p>
          <Money agorot={sumAgorot(open.map((d) => d.status.nextPayment?.amount ?? 0))} className="text-xl font-bold" />
        </div>
      </section>
      <Link to="/debts/owed/new" className={primaryBtn}>
        <Icon name="plus" size={18} />
        {O.add}
      </Link>
      {debts?.length === 0 && <p className="text-center text-sm text-muted">{O.empty}</p>}
      {[...open, ...closed].map(({ debt, status }) => (
        <Link key={debt.id} to={`/debts/owed/${debt.id}`} className={`flex flex-col gap-2 rounded-card border border-line bg-surface p-4 ${status.isSettled ? 'opacity-60' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{debt.creditor}</span>
            <span className={`shrink-0 text-xs ${status.overdue ? 'text-expense' : 'text-muted'}`}>
              {O.kinds[debt.kind]} · {status.isSettled ? O.settled : O.statuses[debt.status]}
            </span>
          </div>
          <ProgressBar usedBp={status.progressBp} state={status.overdue ? 'over' : 'ok'} label={debt.creditor} />
          <div className="flex justify-between text-sm text-muted">
            <span>
              {O.remaining} <Money agorot={status.remaining} className="text-text" />
            </span>
            {status.nextPayment && (
              <span>
                <Money agorot={status.nextPayment.amount} className="text-text" /> · <span className="num">{formatDisplayDate(status.nextPayment.date)}</span>
              </span>
            )}
          </div>
        </Link>
      ))}
    </>
  );
}

export function DebtFormScreen() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const goBack = useGoBack('/debts?tab=owed');
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const categories = (useCategories() ?? []).filter((c) => !c.deletedAt && c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({
    creditor: '',
    kind: 'utility' as Debt['kind'],
    original: '',
    date: todayIL(),
    status: 'open' as Debt['status'],
    hasPlan: false,
    monthly: '',
    paymentDay: '10',
    planStart: todayIL(),
    accountId: '',
    categoryId: '',
    caseNumber: '',
    context: 'personal' as Debt['context'],
    note: '',
  });
  const [error, setError] = useState('');
  const set = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => {
    if (isNew) return;
    void db.debts.get(id!).then((d) => {
      if (!d) return navigate('/debts?tab=owed', { replace: true });
      setF({
        creditor: d.creditor,
        kind: d.kind,
        original: agorotToInput(d.originalAmountAgorot),
        date: d.date,
        status: d.status,
        hasPlan: !!d.monthlyPaymentAgorot,
        monthly: agorotToInput(d.monthlyPaymentAgorot),
        paymentDay: String(d.paymentDay ?? 10),
        planStart: d.planStartDate ?? d.date,
        accountId: d.accountId ?? '',
        categoryId: d.categoryId ?? '',
        caseNumber: d.caseNumber ?? '',
        context: d.context,
        note: d.note ?? '',
      });
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const original = parseAmountToAgorot(f.original);
    const monthly = f.hasPlan ? parseAmountToAgorot(f.monthly) : undefined;
    if (!original || original <= 0 || monthly === null || (f.hasPlan && (!monthly || monthly <= 0))) return setError(he.txForm.errors.amount);
    try {
      const saved = await saveDebt(
        db,
        {
          creditor: f.creditor.trim(),
          kind: f.kind,
          originalAmountAgorot: original,
          date: f.date,
          status: f.hasPlan && f.status === 'open' ? 'arrangement' : f.status,
          monthlyPaymentAgorot: monthly ?? undefined,
          paymentDay: f.hasPlan ? Number(f.paymentDay) : undefined,
          planStartDate: f.hasPlan ? f.planStart : undefined,
          accountId: f.accountId || accounts[0]?.id,
          categoryId: f.categoryId || undefined,
          caseNumber: f.caseNumber.trim() || undefined,
          context: f.context,
          note: f.note.trim() || undefined,
        },
        isNew ? undefined : id,
      );
      navigate(`/debts/owed/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded) return <ScreenHeader title={O.edit} back />;
  return (
    <>
      <ScreenHeader title={isNew ? O.add : O.edit} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={O.creditor}>{(p) => <input {...p} className={inputCls} value={f.creditor} onChange={(e) => set({ creditor: e.target.value })} placeholder={O.creditorPlaceholder} />}</Field>
        <Field label={O.kind}>
          {(p) => (
            <select {...p} className={inputCls} value={f.kind} onChange={(e) => set({ kind: e.target.value as Debt['kind'] })}>
              {DebtSchema.shape.kind.options.map((k) => (
                <option key={k} value={k}>
                  {O.kinds[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={O.original}>{(p) => <MoneyInput {...p} value={f.original} onChange={(original) => set({ original })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={O.date}>{(p) => <input {...p} type="date" className={inputCls} value={f.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
          <Field label={O.status}>
            {(p) => (
              <select {...p} className={inputCls} value={f.status} onChange={(e) => set({ status: e.target.value as Debt['status'] })}>
                {DebtSchema.shape.status.options.map((k) => (
                  <option key={k} value={k}>
                    {O.statuses[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <Toggle label={O.plan} hint={O.planHint} checked={f.hasPlan} onChange={(hasPlan) => set({ hasPlan })} />
          {f.hasPlan && (
            <>
              <Field label={O.monthlyPayment}>{(p) => <MoneyInput {...p} value={f.monthly} onChange={(monthly) => set({ monthly })} />}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={O.paymentDay}>
                  {(p) => (
                    <select {...p} className={inputCls} value={f.paymentDay} onChange={(e) => set({ paymentDay: e.target.value })}>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label={O.planStart}>{(p) => <input {...p} type="date" className={inputCls} value={f.planStart} onChange={(e) => set({ planStart: e.target.value })} />}</Field>
              </div>
            </>
          )}
        </div>
        <Field label={O.account}>
          {(p) => (
            <select {...p} className={inputCls} value={f.accountId || accounts[0]?.id} onChange={(e) => set({ accountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={O.category}>
          {(p) => (
            <select {...p} className={inputCls} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">{he.txForm.noCategory}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={O.caseNumber}>{(p) => <input {...p} dir="ltr" className={`${inputCls} text-start`} value={f.caseNumber} onChange={(e) => set({ caseNumber: e.target.value })} />}</Field>
        <Segmented label={he.txForm.context} value={f.context} onChange={(context) => set({ context })} options={[{ value: 'personal', label: he.context.personal }, { value: 'business', label: he.context.business }]} />
        <Field label={O.note}>{(p) => <textarea {...p} rows={2} className={`${inputCls} py-2`} value={f.note} onChange={(e) => set({ note: e.target.value })} />}</Field>
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
        {!isNew && (
          <button
            type="button"
            className={dangerBtn}
            onClick={async () => {
              await deleteDebt(db, id!);
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

export function DebtDetailScreen() {
  const { id } = useParams();
  const toast = useToast();
  const debts = useDebts();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const payments = useLiveQuery(async () => (await db.transactions.filter((t) => t.links?.debtId === id && !t.deletedAt).toArray()).sort((a, b) => b.date.localeCompare(a.date)), [id]);
  const [sheet, setSheet] = useState<null | 'pay' | 'charge'>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIL());
  const [accountId, setAccountId] = useState('');
  const [chargeKind, setChargeKind] = useState<'fine' | 'interest' | 'fee' | 'legal' | 'other'>('fine');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const entry = debts?.find((d) => d.debt.id === id);
  if (!debts) return <ScreenHeader title="" back />;
  if (!entry) return <ScreenHeader title={he.debts.title} back />;
  const { debt, status } = entry;

  async function onSheet(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0) return setError(he.txForm.errors.amount);
    if (sheet === 'pay') {
      await recordDebtPayment(db, debt.id, a, accountId || debt.accountId || accounts[0]!.id, date);
      toast({ message: O.paymentRecorded });
    } else {
      await addDebtCharge(db, debt.id, { date, kind: chargeKind, amountAgorot: a, note: note.trim() || undefined });
      toast({ message: O.chargeAdded });
    }
    setSheet(null);
    setError('');
  }

  const open = (kind: 'pay' | 'charge') => {
    setAmount(kind === 'pay' ? agorotToInput(status.nextPayment?.amount ?? status.remaining) : '');
    setDate(todayIL());
    setNote('');
    setError('');
    setSheet(kind);
  };

  return (
    <>
      <ScreenHeader title={debt.creditor} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-on-brand-muted">
                {O.remaining} · {status.isSettled ? O.settled : O.statuses[debt.status]}
              </p>
              <Money agorot={status.remaining} className="text-3xl font-bold" />
            </div>
            <Link to={`/debts/owed/${debt.id}/edit`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <Icon name="edit" size={20} />
            </Link>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/20">
            <div className="h-2 rounded-full bg-white" style={{ width: `${Math.round(status.progressBp / 100)}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-on-brand-muted">{O.original}</p>
              <Money agorot={debt.originalAmountAgorot} className="text-sm font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{O.charges}</p>
              <Money agorot={status.chargesTotal} className="text-sm font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{O.paid}</p>
              <Money agorot={status.paid} className="text-sm font-medium" />
            </div>
          </div>
          {status.nextPayment && (
            <p className="mt-3 text-sm text-on-brand-muted">
              {O.next(formatDisplayDate(status.nextPayment.date))} · <Money agorot={status.nextPayment.amount} className="text-on-brand" />
              {status.paymentsLeft !== null && status.payoffDate && <span className="block">{O.left(status.paymentsLeft, formatDisplayDate(status.payoffDate))}</span>}
            </p>
          )}
          {debt.caseNumber && <p className="num mt-1 text-xs text-on-brand-muted">{`${O.caseNumber.replace(' (לא חובה)', '')}: ${debt.caseNumber}`}</p>}
        </section>

        {status.overdue && (
          <p role="alert" className="flex gap-2 rounded-card bg-warning-soft p-4 text-sm">
            <Icon name="alert" className="shrink-0 text-warning" />
            {O.behind(formatAgorot(status.behind))}
          </p>
        )}

        {!status.isSettled && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primaryBtn} onClick={() => open('pay')}>
              {O.pay}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => open('charge')}>
              {O.addCharge}
            </button>
          </div>
        )}

        {debt.charges.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{O.charges}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {debt.charges.map((c) => (
                <div key={c.id} className="flex min-h-12 items-center gap-3 px-4 text-sm">
                  <span className="num w-20 text-xs text-muted">{formatDisplayDate(c.date)}</span>
                  <span className="flex-1 truncate">
                    {O.chargeKinds[c.kind]}
                    {c.note && <span className="text-muted"> · {c.note}</span>}
                  </span>
                  <Money agorot={c.amountAgorot} tone="expense" />
                  <button type="button" aria-label={O.remove} onClick={() => void removeDebtCharge(db, debt.id, c.id)} className="flex size-10 items-center justify-center text-muted">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {(payments ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{O.payments}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(payments ?? []).map((t) => (
                <Link key={t.id} to={`/transactions/${t.id}`} className="flex min-h-12 items-center justify-between px-4 text-sm">
                  <span className="num text-xs text-muted">{formatDisplayDate(t.date)}</span>
                  <Money agorot={-t.amountAgorot} tone="expense" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <BottomSheet open={!!sheet} title={sheet === 'pay' ? O.pay : O.addCharge} onClose={() => setSheet(null)}>
        <form onSubmit={onSheet} className="flex flex-col gap-4">
          {sheet === 'charge' && (
            <Field label={O.kind}>
              {(p) => (
                <select {...p} className={inputCls} value={chargeKind} onChange={(e) => setChargeKind(e.target.value as typeof chargeKind)}>
                  {ChargeSchema.shape.kind.options.map((k) => (
                    <option key={k} value={k}>
                      {O.chargeKinds[k]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label={sheet === 'pay' ? he.txForm.amount : O.chargeAmount} error={error}>
            {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
          </Field>
          <Field label={he.txForm.date}>{(p) => <input {...p} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          {sheet === 'pay' ? (
            <Field label={O.account}>
              {(p) => (
                <select {...p} className={inputCls} value={accountId || debt.accountId || accounts[0]?.id} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <Field label={O.note}>{(p) => <input {...p} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          )}
          <button type="submit" className={primaryBtn}>
            {he.common.save}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
