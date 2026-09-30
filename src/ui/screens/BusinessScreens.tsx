import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';
import { Field, MoneyInput, Segmented, Toggle, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { byId, useAccounts, useBusiness, useBusinessOverview, useCards, useTaxSettings } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import type { Business } from '../../domain/schemas';
import type { AmountMode } from '../../calc/business/vat';
import { businessExpense } from '../../calc/business/expenses';
import { formatDisplayDate, formatDisplayMonth, todayIL } from '../../calc/dates';
import { formatAgorot, formatBp, parseAmountToAgorot } from '../../calc/money';
import { defaultInputVat, markVatPaid, moveToTaxReserve, previewIncome, ratesReady, saveBusiness, saveBusinessExpense, saveBusinessIncome, type IncomePreview } from '../../services/business';
import { ValidationError } from '../../services/entity';
import { deleteTransaction } from '../../services/transactions';
import { agorotToInput } from '../format';
import { TaxSettingsScreen } from './TaxSettingsScreen';
import { he } from '../strings.he';

const B = he.business;

function Row({ label, children, strong = false }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex min-h-10 items-center justify-between gap-3 px-4 py-2 text-sm ${strong ? 'font-medium' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function BusinessSetupScreen() {
  const business = useBusiness();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const goBack = useGoBack('/business');
  const [f, setF] = useState<{ name: string; vatStatus: Business['vatStatus']; openDate: string; vatReportingPeriod: NonNullable<Business['vatReportingPeriod']>; isMicroBusiness: boolean; businessAccountId: string; taxReserveAccountId: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (business === undefined || f) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF({
      name: business?.name ?? '',
      vatStatus: business?.vatStatus ?? 'licensed',
      openDate: business?.openDate ?? '',
      vatReportingPeriod: business?.vatReportingPeriod ?? 'bimonthly',
      isMicroBusiness: !!business?.isMicroBusiness,
      businessAccountId: business?.businessAccountId ?? '',
      taxReserveAccountId: business?.taxReserveAccountId ?? '',
    });
  }, [business, f]);

  if (!f) return <ScreenHeader title={B.setup} back />;
  const set = (x: Partial<typeof f>) => setF({ ...f, ...x });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveBusiness(db, {
        name: f!.name.trim(),
        vatStatus: f!.vatStatus,
        openDate: f!.openDate || undefined,
        vatReportingPeriod: f!.vatStatus === 'licensed' ? f!.vatReportingPeriod : undefined,
        isMicroBusiness: f!.isMicroBusiness || undefined,
        businessAccountId: f!.businessAccountId || undefined,
        taxReserveAccountId: f!.taxReserveAccountId || undefined,
      });
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  return (
    <>
      <ScreenHeader title={B.setup} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <p className="text-sm text-muted">{B.setupHint}</p>
        <Field label={B.name}>{(p) => <input {...p} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Segmented label={B.vatStatus} value={f.vatStatus} onChange={(vatStatus) => set({ vatStatus })} options={(['licensed', 'exempt'] as const).map((v) => ({ value: v, label: B.statuses[v] }))} />
        {f.vatStatus === 'licensed' && (
          <Segmented label={B.period} value={f.vatReportingPeriod} onChange={(vatReportingPeriod) => set({ vatReportingPeriod })} options={(['bimonthly', 'monthly'] as const).map((v) => ({ value: v, label: B.periods[v] }))} />
        )}
        <Field label={B.openDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.openDate} onChange={(e) => set({ openDate: e.target.value })} />}</Field>
        <Toggle label={B.micro} checked={f.isMicroBusiness} onChange={(isMicroBusiness) => set({ isMicroBusiness })} />
        {(['businessAccountId', 'taxReserveAccountId'] as const).map((k) => (
          <Field key={k} label={k === 'businessAccountId' ? B.account : B.reserveAccount}>
            {(p) => (
              <select {...p} className={inputCls} value={f[k]} onChange={(e) => set({ [k]: e.target.value })}>
                <option value="">{B.none}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ))}
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function BusinessScreen() {
  const business = useBusiness();
  const o = useBusinessOverview();
  const tax = useTaxSettings();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const txs = byId(useLiveQuery(() => db.transactions.filter((t) => t.context === 'business' && !t.deletedAt).toArray(), []));
  const toast = useToast();

  if (business === undefined || o === undefined) return <ScreenHeader title={B.title} back />;
  if (business === null)
    return (
      <>
        <ScreenHeader title={B.title} back />
        <div className="flex flex-col gap-3 px-4">
          <p className="text-sm text-muted">{B.setupHint}</p>
          <Link to="/business/setup" className={primaryBtn}>
            {B.setupCta}
          </Link>
        </div>
      </>
    );

  const payFrom = business.businessAccountId ?? accounts[0]?.id;
  return (
    <>
      <ScreenHeader title={business.name} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className="flex items-center justify-between text-sm">
          <span className="rounded-full bg-brand-soft px-3 py-1 text-brand-text">{B.statuses[business.vatStatus]}</span>
          <div className="flex gap-3">
            <Link to="/tax" className="text-brand-text">
              {he.tax.title}
            </Link>
            <Link to="/business/setup" className="text-brand-text">
              {he.common.edit}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/business/income/new" className={primaryBtn}>
            <Icon name="plus" size={18} />
            {B.income}
          </Link>
          <Link to="/business/expense/new" className={secondaryBtn}>
            <Icon name="plus" size={18} />
            {B.expense}
          </Link>
        </div>

        {o && (
          <>
            <section className="grid grid-cols-2 gap-3 rounded-card bg-brand p-5 text-on-brand">
              <div>
                <p className="text-xs text-on-brand-muted">{B.incomeThisMonth}</p>
                <Money agorot={o.incomeThisMonth} className="text-xl font-bold" />
              </div>
              <div>
                <p className="text-xs text-on-brand-muted">{B.setAsideYtd}</p>
                <Money agorot={o.setAsideYtd} className="text-xl font-bold" />
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-sm font-medium text-muted">{B.ytd(o.year)}</h2>
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                <Row label={B.lines.revenue}>
                  <Money agorot={o.revenueYtd} />
                </Row>
                <Row label={B.lines.expenses}>
                  <Money agorot={o.recognizedExpensesYtd} />
                </Row>
                <Row label={B.lines.profit} strong>
                  <Money agorot={o.profitYtd} />
                </Row>
                <Row label={`${B.lines.incomeTax}${tax?.incomeTaxRateBp != null ? ` (${formatBp(tax.incomeTaxRateBp)})` : ''}`}>{o.estimatedIncomeTax === null ? <span className="text-warning">{B.rateMissing}</span> : <Money agorot={o.estimatedIncomeTax} />}</Row>
                <Row label={`${B.lines.ni}${tax?.nationalInsuranceRateBp != null ? ` (${formatBp(tax.nationalInsuranceRateBp)})` : ''}`}>{o.estimatedNi === null ? <span className="text-warning">{B.rateMissing}</span> : <Money agorot={o.estimatedNi} />}</Row>
                <Row label={B.lines.reserved}>
                  <Money agorot={o.reservedYtd} />
                </Row>
                <Row label={B.lines.paid}>
                  <Money agorot={o.paidYtd} />
                </Row>
                <Row label={B.lines.gap} strong>
                  {o.gap === null ? '—' : <Money agorot={o.gap} tone={o.gap > 0 ? 'expense' : 'plain'} />}
                </Row>
              </div>
              <p className="mt-2 px-1 text-xs text-muted">
                {B.gapHint} {B.reserveNote}
              </p>
              {o.unclassifiedExpenses > 0 && <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">{B.unclassified(o.unclassifiedExpenses)}</p>}
            </section>

            {o.vatReports.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-medium text-muted">{B.vatTitle}</h2>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {[...o.vatReports].reverse().map((r) => (
                    <div key={r.key} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="num font-medium">
                          {formatDisplayMonth(r.from.slice(0, 7))}
                          {r.to.slice(0, 7) !== r.from.slice(0, 7) && `–${formatDisplayMonth(r.to.slice(0, 7))}`}
                        </span>
                        <span className={r.paid ? 'text-income' : 'text-muted'}>{r.paid ? B.vatPaid : B.due(formatDisplayDate(r.dueDate))}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted">
                        <span>
                          {B.vatCols[1]} <Money agorot={r.outputVat} />
                        </span>
                        <span>
                          {B.vatCols[2]} <Money agorot={r.inputVat} />
                        </span>
                        <span className="font-medium text-text">
                          {r.vatDue >= 0 ? B.vatCols[3] : B.vatRefund} <Money agorot={Math.abs(r.vatDue)} />
                        </span>
                      </div>
                      {!r.paid && r.vatDue !== 0 && r.to < todayIL() && payFrom && (
                        <button
                          type="button"
                          className="self-start rounded-full bg-brand-soft px-3 py-1.5 text-xs text-brand-text"
                          onClick={async () => {
                            await markVatPaid(db, r.key, r.vatDue, payFrom);
                            toast({ message: he.common.saved });
                          }}
                        >
                          {B.markPaid}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {o.patur && tax && (
              <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
                <h2 className="text-sm font-medium text-muted">{B.patur}</h2>
                <div className="flex justify-between text-sm">
                  <span>
                    {B.turnover} <Money agorot={o.patur.turnoverYtd} className="font-medium" />
                  </span>
                  <span className="text-muted">
                    / <Money agorot={tax.paturCeilingAgorot} />
                  </span>
                </div>
                <ProgressBar usedBp={o.patur.pctOfCeilingBp} state={o.patur.alerts.includes('over') ? 'over' : o.patur.alerts.length ? 'near' : 'ok'} label={B.patur} />
                <p className="text-xs text-muted">
                  {B.projected} <Money agorot={o.patur.projected} />
                </p>
                {o.patur.alerts.length > 0 && (
                  <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                    {o.patur.alerts.map((a) => B.paturAlerts[a]).join(' ')} {B.paturAdvice}
                  </p>
                )}
              </section>
            )}

            <section>
              <h2 className="mb-2 px-1 text-sm font-medium text-muted">{B.pension}</h2>
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                <Row label={B.pensionMonthly}>
                  <Money agorot={o.pension.monthly} />
                </Row>
                <Row label={B.pensionYtd}>
                  <Money agorot={o.pension.ytdObligation} />
                </Row>
                <Row label={B.pensionDeposits}>
                  <Money agorot={o.pension.ytdDeposits} />
                </Row>
                <Row label={B.pensionGap} strong>
                  <Money agorot={o.pension.gap} tone={o.pension.gap > 0 ? 'expense' : 'plain'} />
                </Row>
              </div>
              <p className="mt-2 px-1 text-xs text-muted">{B.pensionNote}</p>
            </section>

            {o.incomes.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-medium text-muted">{B.recentIncome}</h2>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {[...o.incomes]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 8)
                    .map((i) => (
                      <Link key={i.id} to={`/business/income/${i.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm">
                        <span className="num text-xs text-muted">{formatDisplayDate(i.date)}</span>
                        <span className="flex-1 truncate">{txs.get(i.id)?.note ?? ''}</span>
                        {!i.cleared && <span className="text-xs text-warning">{B.pending}</span>}
                        <Money agorot={i.total} tone="income" />
                      </Link>
                    ))}
                </div>
              </section>
            )}
          </>
        )}
        <p className="px-1 text-xs text-muted">{he.tax.disclaimer}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Income calculator (11.2)
// ---------------------------------------------------------------------------

export function IncomeCalculatorScreen() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const business = useBusiness();
  const tax = useTaxSettings();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<AmountMode>('excl_vat');
  const [date, setDate] = useState(todayIL());
  const [accountId, setAccountId] = useState('');
  const [payee, setPayee] = useState('');
  const [received, setReceived] = useState(true);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<IncomePreview>();
  const [saved, setSaved] = useState<IncomePreview & { accountId: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    void db.transactions.get(id!).then(async (t) => {
      if (!t || !t.business || !('netAgorot' in t.business)) return navigate('/business', { replace: true });
      setAmount(agorotToInput(t.amountAgorot));
      setMode('incl_vat');
      setDate(t.date);
      setAccountId(t.accountId ?? '');
      setReceived(t.status === 'cleared');
      setNote(t.note ?? '');
      setPayee(t.payeeId ? ((await db.payees.get(t.payeeId))?.name ?? '') : '');
    });
  }, [id, isNew, navigate]);

  useEffect(() => {
    const a = parseAmountToAgorot(amount);
    let cancelled = false;
    if (a && a > 0) void previewIncome(db, a, mode, date).then((p) => !cancelled && setPreview(p));
    return () => {
      cancelled = true;
    };
  }, [amount, mode, date, tax]);
  const shownPreview = parseAmountToAgorot(amount) ? preview : undefined;

  const effectiveAccount = accountId || business?.businessAccountId || accounts[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0) return setError(he.txForm.errors.amount);
    const r = await saveBusinessIncome(db, { amountAgorot: a, mode, date, accountId: effectiveAccount, payeeName: payee, received, note: note.trim() || undefined }, isNew ? undefined : id);
    toast({ message: B.savedIncome });
    if (business?.taxReserveAccountId && isNew) setSaved({ ...r.preview, accountId: effectiveAccount });
    else navigate('/business', { replace: true });
  }

  if (business === undefined || !tax) return <ScreenHeader title={B.calcTitle} back />;
  if (business === null) return <Navigate to="/business/setup" replace />;

  if (!ratesReady(tax))
    return (
      <>
        <ScreenHeader title={B.calcTitle} back />
        <div className="flex flex-col gap-3 px-4 pb-8">
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm">{he.tax.needRates}</p>
          <TaxSettingsScreen embedded onSaved={() => undefined} />
        </div>
      </>
    );

  if (saved)
    return (
      <>
        <ScreenHeader title={B.calcTitle} back />
        <div className="flex flex-col gap-3 px-4">
          <p className="text-center font-medium">{B.savedIncome}</p>
          <button
            type="button"
            className={primaryBtn}
            onClick={async () => {
              await moveToTaxReserve(db, saved.accountId, saved.setAside, date);
              toast({ message: B.moved });
              navigate('/business', { replace: true });
            }}
          >
            {B.moveReserve(formatAgorot(saved.setAside))}
          </button>
          <Link to="/business" replace className={secondaryBtn}>
            {he.common.close}
          </Link>
        </div>
      </>
    );

  const L = B.breakdown;
  return (
    <>
      <ScreenHeader title={B.calcTitle} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={B.amount} error={error}>
          {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} autoFocus={isNew} />}
        </Field>
        {business.vatStatus === 'licensed' && <Segmented label={B.mode} value={mode} onChange={setMode} options={(['excl_vat', 'incl_vat'] as const).map((v) => ({ value: v, label: B.modes[v] }))} />}

        {shownPreview && (
          <section className="overflow-hidden rounded-card border border-line bg-surface" aria-live="polite">
            <div className="divide-y divide-line">
              <Row label={L.net}>
                <Money agorot={shownPreview.net} exact />
              </Row>
              {business.vatStatus === 'licensed' && (
                <Row label={`${L.vat} (${formatBp(tax.vatRateBp)})`}>
                  <Money agorot={shownPreview.vat} exact />
                </Row>
              )}
              <Row label={L.total} strong>
                <Money agorot={shownPreview.total} exact />
              </Row>
              {tax.reserveBasis === 'profit_ratio' && (
                <Row label={`${L.base} · ${B.ratio(formatBp(shownPreview.profitRatioBp))}`}>
                  <Money agorot={shownPreview.base} exact />
                </Row>
              )}
              <Row label={`${L.incomeTax} (${formatBp(tax.incomeTaxRateBp!)})`}>
                <Money agorot={shownPreview.incomeTaxReserve} exact />
              </Row>
              <Row label={`${L.ni} (${formatBp(tax.nationalInsuranceRateBp!)})`}>
                <Money agorot={shownPreview.niReserve} exact />
              </Row>
              {shownPreview.vatReserve > 0 && (
                <Row label={L.vatReserve}>
                  <Money agorot={shownPreview.vatReserve} exact />
                </Row>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 bg-brand p-4 text-on-brand">
              <div>
                <p className="text-xs text-on-brand-muted">{L.setAside}</p>
                <Money agorot={shownPreview.setAside} exact className="text-xl font-bold" />
              </div>
              <div>
                <p className="text-xs text-on-brand-muted">{L.left}</p>
                <Money agorot={shownPreview.leftForYou} exact className="text-xl font-bold" />
              </div>
            </div>
          </section>
        )}

        <Field label={B.date}>{(p) => <input {...p} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label={B.from}>{(p) => <input {...p} className={inputCls} value={payee} onChange={(e) => setPayee(e.target.value)} />}</Field>
        <Field label={B.toAccount}>
          {(p) => (
            <select {...p} className={inputCls} value={effectiveAccount} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Segmented label={B.status} value={received ? 'r' : 'p'} onChange={(v) => setReceived(v === 'r')} options={[{ value: 'r', label: B.received }, { value: 'p', label: B.pending }]} />
        <Field label={B.note}>{(p) => <input {...p} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <p className="text-xs text-muted">{he.tax.disclaimer}</p>
        <button type="submit" className={primaryBtn}>
          {B.saveIncome}
        </button>
        {!isNew && (
          <button
            type="button"
            className="min-h-11 rounded-full bg-danger-soft font-medium text-expense"
            onClick={async () => {
              await deleteTransaction(db, id!);
              navigate('/business', { replace: true });
            }}
          >
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Business expense (11.3)
// ---------------------------------------------------------------------------

export function BusinessExpenseScreen() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const business = useBusiness();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const cards = (useCards() ?? []).filter((c) => c.status === 'active');
  const classes = useLiveQuery(async () => (await db.expenseClasses.filter((c) => !c.deletedAt).toArray()).sort((a, b) => a.name.localeCompare(b.name, 'he')), []);
  const [amount, setAmount] = useState('');
  const [vat, setVat] = useState('');
  const [vatTouched, setVatTouched] = useState(false);
  const [classId, setClassId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(todayIL());
  const [source, setSource] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    void db.transactions.get(id!).then(async (t) => {
      if (!t || !t.business || !('expenseClassId' in t.business)) return navigate('/business', { replace: true });
      setAmount(agorotToInput(t.amountAgorot));
      setVat(agorotToInput(t.business.vatAgorot));
      setVatTouched(true);
      setClassId(t.business.expenseClassId);
      setInvoice(t.business.supplierInvoiceNumber ?? '');
      setDate(t.date);
      setSource(t.cardId ? `card:${t.cardId}` : `acc:${t.accountId}`);
      setNote(t.note ?? '');
      setSupplier(t.payeeId ? ((await db.payees.get(t.payeeId))?.name ?? '') : '');
    });
  }, [id, isNew, navigate]);

  // Auto VAT from the amount until the user edits it.
  useEffect(() => {
    if (vatTouched) return;
    const a = parseAmountToAgorot(amount);
    let cancelled = false;
    if (a && a > 0) void defaultInputVat(db, a, date).then((v) => !cancelled && setVat(agorotToInput(v)));
    return () => {
      cancelled = true;
    };
  }, [amount, date, vatTouched]);

  const cls = classes?.find((c) => c.id === (classId || classes[0]?.id));
  const a = parseAmountToAgorot(amount);
  const v = vat.trim() ? parseAmountToAgorot(vat) : 0;
  const breakdown = cls && a && a > 0 && v !== null && business ? businessExpense(a, v, cls, business.vatStatus) : undefined;
  const effectiveSource = source || (business?.businessAccountId ? `acc:${business.businessAccountId}` : accounts[0] ? `acc:${accounts[0].id}` : '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!a || a <= 0 || v === null || !cls) return setError(he.txForm.errors.amount);
    const [type, sid] = effectiveSource.split(':');
    try {
      await saveBusinessExpense(db, { amountAgorot: a, vatAgorot: business?.vatStatus === 'exempt' ? 0 : v, expenseClassId: cls.id, supplierInvoiceNumber: invoice, date, accountId: type === 'acc' ? sid : undefined, cardId: type === 'card' ? sid : undefined, payeeName: supplier, note: note.trim() || undefined }, isNew ? undefined : id);
      toast({ message: he.common.saved });
      navigate('/business', { replace: true });
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!classes || business === undefined) return <ScreenHeader title={B.expenseTitle} back />;
  return (
    <>
      <ScreenHeader title={B.expenseTitle} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={B.amountIncl} error={error}>
          {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} autoFocus={isNew} />}
        </Field>
        {business?.vatStatus !== 'exempt' && (
          <Field label={B.vatAmount} hint={B.vatAmountHint}>
            {(p) => (
              <MoneyInput
                {...p}
                value={vat}
                onChange={(x) => {
                  setVatTouched(true);
                  setVat(x);
                }}
              />
            )}
          </Field>
        )}
        <Field label={B.expenseClass}>
          {(p) => (
            <select {...p} className={inputCls} value={cls?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.name} · ${formatBp(c.incomeTaxRecognizedPct)}`}
                </option>
              ))}
            </select>
          )}
        </Field>
        {cls?.note && <p className="-mt-2 text-xs text-muted">{cls.note}</p>}
        {breakdown && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 text-sm">
            <span className="text-muted">{B.vatDeductible}</span>
            <Money agorot={breakdown.vatDeductible} exact className="text-end" />
            <span className="text-muted">{B.recognized}</span>
            <Money agorot={breakdown.recognizedExpense} exact className="text-end" />
          </div>
        )}
        <Field label={B.date}>{(p) => <input {...p} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label={B.supplier}>{(p) => <input {...p} className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}</Field>
        <Field label={B.invoiceNo}>{(p) => <input {...p} dir="ltr" className={`${inputCls} text-start`} value={invoice} onChange={(e) => setInvoice(e.target.value)} />}</Field>
        <Field label={B.payFrom}>
          {(p) => (
            <select {...p} className={inputCls} value={effectiveSource} onChange={(e) => setSource(e.target.value)}>
              {accounts.map((x) => (
                <option key={x.id} value={`acc:${x.id}`}>
                  {x.name}
                </option>
              ))}
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {`${c.name} ·· ${c.last4}`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={B.note}>{(p) => <input {...p} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
        {!isNew && (
          <button
            type="button"
            className="min-h-11 rounded-full bg-danger-soft font-medium text-expense"
            onClick={async () => {
              await deleteTransaction(db, id!);
              navigate('/business', { replace: true });
            }}
          >
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}
