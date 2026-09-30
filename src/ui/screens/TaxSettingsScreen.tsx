import { useEffect, useState, type FormEvent } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Segmented, primaryBtn, inputCls } from '../components/Form';
import { useToast } from '../components/Toast';
import { useTaxSettings } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import type { TaxSettings } from '../../domain/schemas';
import { saveTaxSettings } from '../../services/business';
import { parseAmountToAgorot, parsePercentToBp } from '../../calc/money';
import { agorotToInput, bpToInput } from '../format';
import { he } from '../strings.he';

const T = he.tax;
const PCT = [
  ['vatRateBp', 'vat'],
  ['incomeTaxRateBp', 'incomeTax'],
  ['nationalInsuranceRateBp', 'ni'],
  ['capitalGainsRateBp', 'capitalGains'],
  ['pensionLowRateBp', 'pensionLow'],
  ['pensionHighRateBp', 'pensionHigh'],
] as const;

/** Tax settings (SPEC 6.18, 11.1). Income tax and NI rates are the user's own (iron rule 4). */
export function TaxSettingsScreen({ embedded = false, onSaved }: { embedded?: boolean; onSaved?: () => void }) {
  const current = useTaxSettings();
  const toast = useToast();
  const goBack = useGoBack('/business');
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [basis, setBasis] = useState<TaxSettings['reserveBasis']>('net_income');
  const [niMode, setNiMode] = useState<NonNullable<TaxSettings['nationalInsuranceMode']>>('fixed_monthly');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!current || f) return;
    const init: Record<string, string> = Object.fromEntries(PCT.map(([k]) => [k, bpToInput(current[k] ?? undefined)]));
    init.paturCeilingAgorot = agorotToInput(current.paturCeilingAgorot);
    init.pensionAvgWageAgorot = agorotToInput(current.pensionAvgWageAgorot);
    init.vatDueDay = String(current.vatDueDay);
    init.niMonthly = agorotToInput(current.nationalInsuranceMonthlyAgorot);
    // Loading the stored version into the form once (external data → local state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF(init);
    setBasis(current.reserveBasis);
    // Rows saved before the choice existed are percent; new users default to the fixed monthly advance.
    setNiMode(current.nationalInsuranceMode ?? (current.nationalInsuranceRateBp !== null ? 'percent' : 'fixed_monthly'));
  }, [current, f]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    const pct = Object.fromEntries(PCT.map(([k]) => [k, f[k]!.trim() ? parsePercentToBp(f[k]!) : null]));
    const ceiling = parseAmountToAgorot(f.paturCeilingAgorot ?? '');
    const wage = parseAmountToAgorot(f.pensionAvgWageAgorot ?? '');
    const dueDay = Number(f.vatDueDay);
    const niMonthly = f.niMonthly?.trim() ? parseAmountToAgorot(f.niMonthly) : undefined;
    if (niMonthly === null || (niMonthly !== undefined && niMonthly < 0)) return setError(he.txForm.errors.amount);
    const required = ['vatRateBp', 'capitalGainsRateBp', 'pensionLowRateBp', 'pensionHighRateBp'];
    if (required.some((k) => pct[k] === null) || !ceiling || !wage || !(dueDay >= 1 && dueDay <= 28)) return setError(he.txForm.errors.amount);
    await saveTaxSettings(db, {
      vatRateBp: pct.vatRateBp!,
      incomeTaxRateBp: pct.incomeTaxRateBp ?? null,
      nationalInsuranceRateBp: pct.nationalInsuranceRateBp ?? null,
      nationalInsuranceMode: niMode,
      nationalInsuranceMonthlyAgorot: niMonthly,
      reserveBasis: basis,
      capitalGainsRateBp: pct.capitalGainsRateBp!,
      paturCeilingAgorot: ceiling,
      pensionAvgWageAgorot: wage,
      pensionLowRateBp: pct.pensionLowRateBp!,
      pensionHighRateBp: pct.pensionHighRateBp!,
      vatDueDay: dueDay,
    });
    toast({ message: T.saved });
    if (onSaved) onSaved();
    else goBack();
  }

  const body = !f ? null : (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-text">{T.disclaimer}</p>
      <div>
        <p className="mb-1.5 text-sm font-medium">{T.niMode}</p>
        <Segmented label={T.niMode} value={niMode} onChange={setNiMode} options={(['fixed_monthly', 'percent'] as const).map((v) => ({ value: v, label: T.niModes[v] }))} />
      </div>
      {niMode === 'fixed_monthly' && (
        <Field label={T.niMonthly} hint={T.niMonthlyHint}>
          {(p) => <MoneyInput {...p} value={f.niMonthly ?? ''} onChange={(v) => setF({ ...f, niMonthly: v })} />}
        </Field>
      )}
      {(embedded ? PCT.slice(1, 3) : PCT)
        .filter(([k]) => k !== 'nationalInsuranceRateBp' || niMode === 'percent')
        .map(([k, label]) => (
        <Field key={k} label={T[label]} hint={k === 'incomeTaxRateBp' ? T.incomeTaxHint : k === 'nationalInsuranceRateBp' ? T.niHint : undefined}>
          {(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
        </Field>
      ))}
      <div>
        <p className="mb-1.5 text-sm font-medium">{T.basis}</p>
        <Segmented label={T.basis} value={basis} onChange={setBasis} options={(['net_income', 'profit_ratio'] as const).map((v) => ({ value: v, label: T.bases[v] }))} />
      </div>
      {!embedded && (
        <>
          <Field label={T.patur}>{(p) => <MoneyInput {...p} value={f.paturCeilingAgorot ?? ''} onChange={(v) => setF({ ...f, paturCeilingAgorot: v })} />}</Field>
          <Field label={T.avgWage}>{(p) => <MoneyInput {...p} value={f.pensionAvgWageAgorot ?? ''} onChange={(v) => setF({ ...f, pensionAvgWageAgorot: v })} />}</Field>
          <Field label={T.vatDueDay}>{(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={f.vatDueDay} onChange={(e) => setF({ ...f, vatDueDay: e.target.value.replace(/\D/g, '') })} />}</Field>
        </>
      )}
      <p className="text-xs text-muted">{T.effective}</p>
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <button type="submit" className={primaryBtn}>
        {he.common.save}
      </button>
    </form>
  );

  if (embedded) return body;
  return (
    <>
      <ScreenHeader title={T.title} back />
      <div className="px-4 pb-8">{body}</div>
    </>
  );
}
