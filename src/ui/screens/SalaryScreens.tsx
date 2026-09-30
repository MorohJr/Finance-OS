import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Field, MoneyInput, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useAccounts, usePension } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { PayslipComponent, type Employer, type Payslip } from '../../domain/schemas';
import { averages, netMismatch, payDate } from '../../calc/salary';
import { currentMonthIL, formatDisplayDate, formatDisplayMonth, todayIL } from '../../calc/dates';
import { formatAgorot, formatBp, parseAmountToAgorot } from '../../calc/money';
import { previousMonth } from '../../calc/cashflow';
import { deleteEmployer, deletePayslip, saveEmployer, savePayslip } from '../../services/salary';
import { ValidationError } from '../../services/entity';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const S = he.salary;
type ComponentKind = (typeof PayslipComponent.shape.kind.options)[number];

export function SalaryScreen() {
  const employers = useLiveQuery(() => db.employers.filter((e) => !e.deletedAt).toArray(), []);
  const payslips = useLiveQuery(() => db.payslips.filter((p) => !p.deletedAt).toArray(), []);
  return (
    <>
      <ScreenHeader title={S.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Link to="/salary/employer/new" className={secondaryBtn}>
          <Icon name="plus" size={18} />
          {S.addEmployer}
        </Link>
        {employers?.length === 0 && <p className="text-center text-sm text-muted">{S.empty}</p>}
        {(employers ?? []).map((e) => {
          const mine = (payslips ?? []).filter((p) => p.employerId === e.id).sort((a, b) => b.month.localeCompare(a.month));
          const a3 = averages(mine, 3);
          const a12 = averages(mine, 12);
          return (
            <section key={e.id} className="flex flex-col gap-3">
              <div className="rounded-card bg-brand p-5 text-on-brand">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold">{e.name}</p>
                    <p className="text-sm text-on-brand-muted">
                      {S.avg3}: <Money agorot={a3.net} className="text-on-brand" /> {S.net}
                    </p>
                  </div>
                  <Link to={`/salary/employer/${e.id}`} aria-label={he.common.edit} className="flex size-11 items-center justify-center rounded-full bg-white/15">
                    <Icon name="edit" size={20} />
                  </Link>
                </div>
                {a12.count > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-on-brand-muted">{`${S.avg12} · ${S.gross}`}</p>
                      <Money agorot={a12.gross} className="text-sm font-medium" />
                    </div>
                    <div>
                      <p className="text-on-brand-muted">{`${S.avg12} · ${S.net}`}</p>
                      <Money agorot={a12.net} className="text-sm font-medium" />
                    </div>
                    <div>
                      <p className="text-on-brand-muted">{S.taxRate}</p>
                      <p className="num text-sm font-medium">{a12.incomeTaxBp !== null ? formatBp(a12.incomeTaxBp) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-on-brand-muted">{S.deductionsRate}</p>
                      <p className="num text-sm font-medium">{a12.deductionsBp !== null ? formatBp(a12.deductionsBp) : '—'}</p>
                    </div>
                  </div>
                )}
              </div>
              <Link to={`/salary/payslip/new?employerId=${e.id}`} className={primaryBtn}>
                <Icon name="plus" size={18} />
                {S.addPayslip}
              </Link>
              {mine.length === 0 ? (
                <p className="text-center text-sm text-muted">{S.noPayslips}</p>
              ) : (
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {mine.map((p) => (
                    <Link key={p.id} to={`/salary/payslip/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-surface-2">
                      <span className="num w-20 font-medium">{formatDisplayMonth(p.month)}</span>
                      <span className="flex-1 text-xs text-muted">
                        {S.gross} <Money agorot={p.grossAgorot} />
                      </span>
                      <Money agorot={p.netAgorot} tone="income" className="font-medium" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function EmployerFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/salary');
  const isNew = !id || id === 'new';
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const funds = usePension() ?? [];
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({ name: '', employerVatId: '', startDate: '', endDate: '', payDay: '9', depositAccountId: '', pensionFundId: '' });
  const [error, setError] = useState('');
  const set = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => {
    if (isNew) return;
    void db.employers.get(id!).then((e) => {
      if (!e) return navigate('/salary', { replace: true });
      setF({ name: e.name, employerVatId: e.employerVatId ?? '', startDate: e.startDate ?? '', endDate: e.endDate ?? '', payDay: String(e.payDay), depositAccountId: e.depositAccountId ?? '', pensionFundId: e.pensionFundId ?? '' });
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input: Omit<Employer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
      name: f.name.trim(),
      employerVatId: f.employerVatId.trim() || undefined,
      startDate: f.startDate || undefined,
      endDate: f.endDate || undefined,
      payDay: Number(f.payDay) || 9,
      depositAccountId: f.depositAccountId || accounts[0]?.id,
      pensionFundId: f.pensionFundId || undefined,
    };
    try {
      await saveEmployer(db, input, isNew ? undefined : id);
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded) return <ScreenHeader title={S.editEmployer} back />;
  return (
    <>
      <ScreenHeader title={isNew ? S.addEmployer : S.editEmployer} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={S.name}>{(p) => <input {...p} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Field label={S.vatId}>{(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} text-start`} value={f.employerVatId} onChange={(e) => set({ employerVatId: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={S.startDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />}</Field>
          <Field label={S.endDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />}</Field>
        </div>
        <Field label={S.payDay}>
          {(p) => (
            <select {...p} className={inputCls} value={f.payDay} onChange={(e) => set({ payDay: e.target.value })}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={S.depositAccount}>
          {(p) => (
            <select {...p} className={inputCls} value={f.depositAccountId || accounts[0]?.id} onChange={(e) => set({ depositAccountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={S.pensionFund}>
          {(p) => (
            <select {...p} className={inputCls} value={f.pensionFundId} onChange={(e) => set({ pensionFundId: e.target.value })}>
              <option value="">{S.noFund}</option>
              {funds.map((x) => (
                <option key={x.fund.id} value={x.fund.id}>
                  {x.fund.name}
                </option>
              ))}
            </select>
          )}
        </Field>
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
              try {
                await deleteEmployer(db, id!);
                goBack();
              } catch {
                setError(S.deleteHas);
              }
            }}
          >
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}

const AMOUNT_FIELDS = [
  ['grossAgorot', 'gross'],
  ['taxableAgorot', 'taxable'],
  ['incomeTaxAgorot', 'incomeTax'],
  ['nationalInsuranceAgorot', 'ni'],
  ['healthTaxAgorot', 'health'],
  ['pensionEmployeeAgorot', 'pensionEmployee'],
  ['otherDeductionsAgorot', 'other'],
  ['pensionEmployerAgorot', 'pensionEmployer'],
  ['severanceAgorot', 'severance'],
  ['netAgorot', 'netPay'],
] as const;
type AmountKey = (typeof AMOUNT_FIELDS)[number][0];
const REQUIRED: AmountKey[] = ['grossAgorot', 'incomeTaxAgorot', 'nationalInsuranceAgorot', 'healthTaxAgorot', 'netAgorot'];

export function PayslipFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/salary');
  const isNew = !id || id === 'new';
  const employers = useLiveQuery(() => db.employers.filter((e) => !e.deletedAt).toArray(), []);
  const [loaded, setLoaded] = useState(isNew);
  const [employerId, setEmployerId] = useState(params.get('employerId') ?? '');
  const [month, setMonth] = useState(previousMonth(currentMonthIL()));
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(() => Object.fromEntries(AMOUNT_FIELDS.map(([k]) => [k, ''])) as Record<AmountKey, string>);
  const [components, setComponents] = useState<{ kind: ComponentKind; amount: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    void db.payslips.get(id!).then((p) => {
      if (!p) return navigate('/salary', { replace: true });
      setEmployerId(p.employerId);
      setMonth(p.month);
      setAmounts(Object.fromEntries(AMOUNT_FIELDS.map(([k]) => [k, agorotToInput(p[k])])) as Record<AmountKey, string>);
      setComponents((p.components ?? []).map((c) => ({ kind: c.kind, amount: agorotToInput(c.amountAgorot) })));
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  const effectiveEmployer = employerId || employers?.[0]?.id || '';
  const employer = employers?.find((e) => e.id === effectiveEmployer);
  const parsed = useMemo(() => Object.fromEntries(AMOUNT_FIELDS.map(([k]) => [k, amounts[k].trim() ? parseAmountToAgorot(amounts[k]) : undefined])) as Record<AmountKey, number | null | undefined>, [amounts]);
  const mismatch = REQUIRED.every((k) => typeof parsed[k] === 'number')
    ? netMismatch({
        grossAgorot: parsed.grossAgorot!,
        incomeTaxAgorot: parsed.incomeTaxAgorot!,
        nationalInsuranceAgorot: parsed.nationalInsuranceAgorot!,
        healthTaxAgorot: parsed.healthTaxAgorot!,
        pensionEmployeeAgorot: parsed.pensionEmployeeAgorot ?? undefined,
        otherDeductionsAgorot: parsed.otherDeductionsAgorot ?? undefined,
        netAgorot: parsed.netAgorot!,
      })
    : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (Object.values(parsed).some((v) => v === null) || REQUIRED.some((k) => parsed[k] === undefined)) return setError(he.txForm.errors.amount);
    const comps = components.filter((c) => c.amount.trim()).map((c) => ({ kind: c.kind, amountAgorot: parseAmountToAgorot(c.amount) }));
    if (comps.some((c) => c.amountAgorot === null)) return setError(he.txForm.errors.amount);
    const input: Omit<Payslip, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
      employerId: effectiveEmployer,
      month,
      grossAgorot: parsed.grossAgorot!,
      taxableAgorot: parsed.taxableAgorot ?? undefined,
      incomeTaxAgorot: parsed.incomeTaxAgorot!,
      nationalInsuranceAgorot: parsed.nationalInsuranceAgorot!,
      healthTaxAgorot: parsed.healthTaxAgorot!,
      pensionEmployeeAgorot: parsed.pensionEmployeeAgorot ?? undefined,
      pensionEmployerAgorot: parsed.pensionEmployerAgorot ?? undefined,
      severanceAgorot: parsed.severanceAgorot ?? undefined,
      otherDeductionsAgorot: parsed.otherDeductionsAgorot ?? undefined,
      netAgorot: parsed.netAgorot!,
      components: comps.length ? (comps as { kind: ComponentKind; amountAgorot: number }[]) : undefined,
    };
    try {
      await savePayslip(db, input, isNew ? undefined : id, todayIL());
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded || !employers) return <ScreenHeader title={S.editPayslip} back />;
  return (
    <>
      <ScreenHeader title={isNew ? S.addPayslip : S.editPayslip} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <p className="text-xs text-muted">{S.manualNote}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={S.employer}>
            {(p) => (
              <select {...p} className={inputCls} value={effectiveEmployer} onChange={(e) => setEmployerId(e.target.value)}>
                {employers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={S.month}>{(p) => <input {...p} type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />}</Field>
        </div>
        {employer && month && <p className="-mt-2 text-xs text-muted">{S.paidOn(formatDisplayDate(payDate(month, employer.payDay)))}</p>}
        <div className="grid grid-cols-2 gap-3">
          {AMOUNT_FIELDS.map(([k, label]) => (
            <Field key={k} label={S[label]} hint={k === 'taxableAgorot' ? S.taxableHint : undefined}>
              {(p) => <MoneyInput {...p} value={amounts[k]} onChange={(v) => setAmounts({ ...amounts, [k]: v })} />}
            </Field>
          ))}
        </div>
        {mismatch !== 0 && (
          <p role="status" className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            {S.mismatch(formatAgorot(mismatch))}
          </p>
        )}
        <details className="rounded-xl border border-line bg-surface" open={components.length > 0}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{S.components}</summary>
          <div className="flex flex-col gap-2 p-3 pt-0">
            {components.map((c, i) => (
              <div key={i} className="flex gap-2">
                <select aria-label={S.components} className={`${inputCls} w-36`} value={c.kind} onChange={(e) => setComponents(components.map((x, j) => (j === i ? { ...x, kind: e.target.value as ComponentKind } : x)))}>
                  {PayslipComponent.shape.kind.options.map((k) => (
                    <option key={k} value={k}>
                      {S.componentKinds[k]}
                    </option>
                  ))}
                </select>
                <input aria-label={he.txForm.amount} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={c.amount} onChange={(e) => setComponents(components.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              </div>
            ))}
            <button type="button" className="self-start text-sm text-brand-text" onClick={() => setComponents([...components, { kind: 'bonus', amount: '' }])}>
              + {S.addComponent}
            </button>
          </div>
        </details>
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
              await deletePayslip(db, id!);
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
