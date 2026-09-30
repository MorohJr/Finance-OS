import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Segmented, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { useAccounts } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import type { Loan } from '../../domain/schemas';
import { createLoan, deleteLoan, updateLoan, type LoanInput } from '../../services/debts';
import { ValidationError } from '../../services/entity';
import { amortizationSchedule, scheduleTotal } from '../../calc/loans';
import { addMonths, todayIL } from '../../calc/dates';
import { formatAgorot, parseAmountToAgorot, parsePercentToBp } from '../../calc/money';
import { agorotToInput, bpToInput } from '../format';
import { he } from '../strings.he';

const D = he.debts;
const LENDERS: Loan['lenderType'][] = ['bank', 'card_company', 'check_discounting', 'pension_fund', 'private', 'other'];
const METHODS: Loan['amortization'][] = ['spitzer', 'equal_principal', 'flat', 'bullet'];

export function LoanFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/debts');
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const [existing, setExisting] = useState<Loan>();
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    name: '',
    lenderType: 'bank' as Loan['lenderType'],
    principal: '',
    rateType: 'annual' as Loan['rateType'],
    rate: '',
    term: '36',
    amortization: 'spitzer' as Loan['amortization'],
    startDate: todayIL(),
    firstPaymentDate: addMonths(todayIL(), 1),
    fees: '',
    accountId: '',
    receivedToAccountId: '',
  });
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      const l = await db.loans.get(id);
      if (!l) return navigate('/debts', { replace: true });
      setExisting(l);
      setF({
        name: l.name,
        lenderType: l.lenderType,
        principal: agorotToInput(l.principalAgorot),
        rateType: l.rateType,
        rate: bpToInput(l.ratePct),
        term: String(l.termMonths),
        amortization: l.amortization,
        startDate: l.startDate,
        firstPaymentDate: l.firstPaymentDate,
        fees: agorotToInput(l.feesAgorot),
        accountId: l.accountId,
        receivedToAccountId: l.receivedToAccountId ?? '',
      });
      setLoaded(true);
    })();
  }, [id, navigate]);

  const accountId = f.accountId || accounts[0]?.id || '';
  const principal = parseAmountToAgorot(f.principal);
  const rate = parsePercentToBp(f.rate || '0');
  const term = Number(f.term);
  const preview =
    principal && principal > 0 && rate !== null && Number.isInteger(term) && term > 0 && term <= 480
      ? amortizationSchedule({ principalAgorot: principal, ratePct: rate, termMonths: term, rateType: f.rateType, amortization: f.amortization, firstPaymentDate: f.firstPaymentDate })
      : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const fees = f.fees.trim() ? parseAmountToAgorot(f.fees) : undefined;
    if (!principal || principal <= 0 || rate === null || fees === null) return setError(he.txForm.errors.amount);
    const input: LoanInput = {
      name: f.name.trim(),
      lenderType: f.lenderType,
      principalAgorot: principal,
      rateType: f.rateType,
      ratePct: rate,
      termMonths: f.amortization === 'bullet' ? Math.max(1, term) : term,
      amortization: f.amortization,
      startDate: f.startDate,
      firstPaymentDate: f.firstPaymentDate,
      feesAgorot: fees ?? undefined,
      accountId,
      receivedToAccountId: f.receivedToAccountId || undefined,
    };
    try {
      const saved = existing ? await updateLoan(db, existing.id, input) : await createLoan(db, input);
      navigate(`/debts/loans/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded) return <ScreenHeader title={D.editLoan} back />;
  return (
    <>
      <ScreenHeader title={existing ? D.editLoan : D.addLoan} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={D.name}>{(p) => <input {...p} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={D.namePlaceholder} />}</Field>
        <Field label={D.lenderType}>
          {(p) => (
            <select {...p} className={inputCls} value={f.lenderType} onChange={(e) => set({ lenderType: e.target.value as Loan['lenderType'], ...(e.target.value === 'check_discounting' ? { amortization: 'bullet', rateType: 'total' } : {}) })}>
              {LENDERS.map((l) => (
                <option key={l} value={l}>
                  {D.lenderTypes[l]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={D.principal}>{(p) => <MoneyInput {...p} value={f.principal} onChange={(principal) => set({ principal })} />}</Field>
        <Segmented label={D.rateType} value={f.rateType} onChange={(rateType) => set({ rateType })} options={(['annual', 'total'] as const).map((v) => ({ value: v, label: D.rateTypes[v] }))} />
        <p className="-mt-2 text-xs text-muted">{D.rateHint}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={D.rate}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.rate} onChange={(e) => set({ rate: e.target.value })} />}</Field>
          <Field label={D.term}>{(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={f.term} onChange={(e) => set({ term: e.target.value.replace(/\D/g, '') })} />}</Field>
        </div>
        <Field label={D.amortization}>
          {(p) => (
            <select {...p} className={inputCls} value={f.amortization} onChange={(e) => set({ amortization: e.target.value as Loan['amortization'] })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {D.methods[m]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={D.startDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />}</Field>
          <Field label={f.amortization === 'bullet' ? D.maturity : D.firstPayment}>{(p) => <input {...p} type="date" className={inputCls} value={f.firstPaymentDate} onChange={(e) => set({ firstPaymentDate: e.target.value })} />}</Field>
        </div>
        <Field label={D.fees}>{(p) => <MoneyInput {...p} value={f.fees} onChange={(fees) => set({ fees })} />}</Field>
        <Field label={D.payFrom}>
          {(p) => (
            <select {...p} className={inputCls} value={accountId} onChange={(e) => set({ accountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {!existing && (
          <Field label={D.receivedTo}>
            {(p) => (
              <select {...p} className={inputCls} value={f.receivedToAccountId} onChange={(e) => set({ receivedToAccountId: e.target.value })}>
                <option value="">{D.notReceived}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {preview && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 text-sm">
            <span className="text-muted">{he.recurring.amount}</span>
            <span className="num text-end">{formatAgorot(preview[0]!.payment)}</span>
            <span className="text-muted">{D.totalWithInterest}</span>
            <span className="num text-end">{formatAgorot(scheduleTotal(preview))}</span>
          </div>
        )}
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
              await deleteLoan(db, existing.id);
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
