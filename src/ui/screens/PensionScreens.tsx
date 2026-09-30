import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { Field, MoneyInput, Toggle, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useAccounts, usePension } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { PensionFund as FundSchema, type PensionFund } from '../../domain/schemas';
import { deleteFund, deleteSnapshot, saveFund, saveSnapshot, selfDeposit } from '../../services/investments';
import { ValidationError } from '../../services/entity';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { formatBp, parseAmountToAgorot, parsePercentToBp, sumAgorot } from '../../calc/money';
import { bpToInput } from '../format';
import { he } from '../strings.he';

const P = he.pension;

export function PensionScreen() {
  const funds = usePension();
  const total = sumAgorot((funds ?? []).map((f) => f.balance));
  const liquid = sumAgorot((funds ?? []).filter((f) => f.fund.isLiquid).map((f) => f.balance));
  return (
    <>
      <ScreenHeader title={P.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="grid grid-cols-2 gap-3 rounded-card bg-brand p-5 text-on-brand">
          <div>
            <p className="text-sm text-on-brand-muted">{P.total}</p>
            <Money agorot={total} className="text-2xl font-bold" />
          </div>
          <div>
            <p className="text-sm text-on-brand-muted">{P.liquid}</p>
            <Money agorot={liquid} className="text-2xl font-bold" />
          </div>
        </section>
        <Link to="/pension/new" className={primaryBtn}>
          <Icon name="plus" size={18} />
          {P.add}
        </Link>
        {funds?.length === 0 && <p className="text-center text-sm text-muted">{P.empty}</p>}
        {(funds ?? []).length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {(funds ?? []).map((f) => (
              <Link key={f.fund.id} to={`/pension/${f.fund.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.fund.name}</span>
                  <span className="block text-xs text-muted">
                    {P.products[f.fund.productType]} · {f.fund.provider}
                    {f.asOf && ` · ${P.asOf(formatDisplayDate(f.asOf))}`}
                  </span>
                </span>
                <Money agorot={f.balance} className="font-medium" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function FundScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/pension');
  const toast = useToast();
  const isNew = !id || id === 'new';
  const views = usePension();
  const view = views?.find((v) => v.fund.id === id);
  const snapshots = useLiveQuery(async () => (isNew ? [] : (await db.pensionSnapshots.where('fundId').equals(id!).filter((s) => !s.deletedAt).toArray()).sort((a, b) => b.date.localeCompare(a.date))), [id, isNew]);
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({ name: '', productType: 'pension_fund' as PensionFund['productType'], provider: '', track: '', policyLast4: '', feeDeposit: '', feeBalance: '', source: 'employer' as PensionFund['source'], isLiquid: false });
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<null | 'snapshot' | 'deposit'>(null);
  const [s, setS] = useState({ date: todayIL(), balance: '', employee: '', employer: '', severance: '', self: '', ret: '', amount: '', accountId: '' });
  const set = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => {
    if (isNew) return;
    void db.pensionFunds.get(id!).then((fund) => {
      if (!fund) return navigate('/pension', { replace: true });
      setF({ name: fund.name, productType: fund.productType, provider: fund.provider, track: fund.track ?? '', policyLast4: fund.policyLast4 ?? '', feeDeposit: bpToInput(fund.feeFromDepositPct), feeBalance: bpToInput(fund.feeFromBalancePct), source: fund.source, isLiquid: fund.isLiquid });
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const feeDeposit = f.feeDeposit.trim() ? parsePercentToBp(f.feeDeposit) : undefined;
    const feeBalance = f.feeBalance.trim() ? parsePercentToBp(f.feeBalance) : undefined;
    if (feeDeposit === null || feeBalance === null) return setError(he.txForm.errors.amount);
    try {
      const saved = await saveFund(
        db,
        { name: f.name.trim(), productType: f.productType, provider: f.provider.trim(), track: f.track.trim() || undefined, policyLast4: f.policyLast4 || undefined, feeFromDepositPct: feeDeposit ?? undefined, feeFromBalancePct: feeBalance ?? undefined, source: f.source, isLiquid: f.isLiquid },
        isNew ? undefined : id,
      );
      if (isNew) navigate(`/pension/${saved.id}`, { replace: true });
      else toast({ message: he.common.saved });
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  async function onSheet(e: FormEvent) {
    e.preventDefault();
    const amt = (v: string) => (v.trim() ? parseAmountToAgorot(v) : undefined);
    if (sheet === 'snapshot') {
      const vals = [amt(s.balance), amt(s.employee), amt(s.employer), amt(s.severance), amt(s.self)];
      const ret = s.ret.trim() ? parsePercentToBp(s.ret.replace('-', '')) : undefined;
      if (vals.some((v) => v === null) || vals[0] === undefined || ret === null) return setError(he.txForm.errors.amount);
      await saveSnapshot(db, {
        fundId: id!,
        date: s.date,
        balanceAgorot: vals[0]!,
        depositsEmployeeAgorot: vals[1] ?? undefined,
        depositsEmployerAgorot: vals[2] ?? undefined,
        depositsSeveranceAgorot: vals[3] ?? undefined,
        depositsSelfAgorot: vals[4] ?? undefined,
        returnPct: ret === undefined ? undefined : s.ret.trim().startsWith('-') ? -ret : ret,
      });
    } else {
      const a = amt(s.amount);
      if (!a || a <= 0) return setError(he.txForm.errors.amount);
      await selfDeposit(db, id!, s.accountId || accounts[0]!.id, a, s.date);
      toast({ message: P.deposited });
    }
    setSheet(null);
    setError('');
  }

  if (!loaded) return <ScreenHeader title={P.edit} back />;
  return (
    <>
      <ScreenHeader title={isNew ? P.add : f.name} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        {view && (
          <section className="rounded-card bg-brand p-5 text-on-brand">
            <p className="text-sm text-on-brand-muted">
              {P.balance}
              {view.asOf && ` · ${P.asOf(formatDisplayDate(view.asOf))}`}
            </p>
            <Money agorot={view.balance} className="text-3xl font-bold" />
            <p className="mt-3 text-sm text-on-brand-muted">{P.depositsYtd}</p>
            <div className="mt-1 grid grid-cols-4 gap-2 text-xs">
              {(['employee', 'employer', 'severance', 'self'] as const).map((k) => (
                <div key={k}>
                  <p className="text-on-brand-muted">{P[k]}</p>
                  <Money agorot={view.depositsYtd[k]} className="text-sm font-medium" />
                </div>
              ))}
            </div>
            {(view.fund.feeFromDepositPct !== undefined || view.fund.feeFromBalancePct !== undefined) && (
              <p className="num mt-2 text-xs text-on-brand-muted">
                {view.fund.feeFromDepositPct !== undefined && `${P.feeDeposit}: ${formatBp(view.fund.feeFromDepositPct)}`}
                {view.fund.feeFromBalancePct !== undefined && ` · ${P.feeBalance}: ${formatBp(view.fund.feeFromBalancePct)}`}
              </p>
            )}
          </section>
        )}
        {!isNew && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primaryBtn} onClick={() => (setS({ ...s, date: todayIL(), balance: '' }), setSheet('snapshot'))}>
              {P.addSnapshot}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => (setS({ ...s, date: todayIL(), amount: '' }), setSheet('deposit'))}>
              {P.selfDeposit}
            </button>
          </div>
        )}
        {(snapshots ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{P.snapshots}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(snapshots ?? []).map((x) => (
                <div key={x.id} className="flex min-h-12 items-center gap-3 px-4 text-sm">
                  <span className="num w-24 text-xs text-muted">{formatDisplayDate(x.date)}</span>
                  <span className="flex-1">
                    <Money agorot={x.balanceAgorot} />
                  </span>
                  {x.returnPct !== undefined && <span className="num text-xs text-muted">{formatBp(x.returnPct)}</span>}
                  <button type="button" aria-label={he.common.delete} onClick={() => void deleteSnapshot(db, x.id)} className="flex size-10 items-center justify-center text-muted">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label={P.name}>{(p) => <input {...p} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label={P.productType}>
            {(p) => (
              <select {...p} className={inputCls} value={f.productType} onChange={(e) => set({ productType: e.target.value as PensionFund['productType'], isLiquid: e.target.value === 'investment_provident' })}>
                {FundSchema.shape.productType.options.map((x) => (
                  <option key={x} value={x}>
                    {P.products[x]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={P.provider}>{(p) => <input {...p} list="pension-providers" className={inputCls} value={f.provider} onChange={(e) => set({ provider: e.target.value })} />}</Field>
            <Field label={P.track}>{(p) => <input {...p} className={inputCls} value={f.track} onChange={(e) => set({ track: e.target.value })} />}</Field>
          </div>
          <ProvidersList />
          <div className="grid grid-cols-2 gap-3">
            <Field label={P.feeDeposit}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.feeDeposit} onChange={(e) => set({ feeDeposit: e.target.value })} />}</Field>
            <Field label={P.feeBalance}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.feeBalance} onChange={(e) => set({ feeBalance: e.target.value })} />}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={P.source}>
              {(p) => (
                <select {...p} className={inputCls} value={f.source} onChange={(e) => set({ source: e.target.value as PensionFund['source'] })}>
                  {FundSchema.shape.source.options.map((x) => (
                    <option key={x} value={x}>
                      {P.sources[x]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={P.policyLast4}>
              {(p) => <input {...p} inputMode="numeric" maxLength={4} dir="ltr" className={`${inputCls} num text-start`} value={f.policyLast4} onChange={(e) => set({ policyLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />}
            </Field>
          </div>
          <Toggle label={P.isLiquid} checked={f.isLiquid} onChange={(isLiquid) => set({ isLiquid })} />
          {error && !sheet && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <button type="submit" className={isNew ? primaryBtn : secondaryBtn}>
            {he.common.save}
          </button>
          {!isNew && (
            <button
              type="button"
              className={dangerBtn}
              onClick={async () => {
                await deleteFund(db, id!);
                goBack();
              }}
            >
              {he.common.delete}
            </button>
          )}
        </form>
      </div>
      <BottomSheet open={!!sheet} title={sheet === 'snapshot' ? P.addSnapshot : P.selfDeposit} onClose={() => setSheet(null)}>
        <form onSubmit={onSheet} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
          <Field label={P.date}>{(p) => <input {...p} type="date" className={inputCls} value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />}</Field>
          {sheet === 'snapshot' ? (
            <>
              <p className="text-xs text-muted">{P.snapshotHint}</p>
              <Field label={P.balance}>{(p) => <MoneyInput {...p} value={s.balance} onChange={(balance) => setS({ ...s, balance })} />}</Field>
              <div className="grid grid-cols-2 gap-3">
                {(['employee', 'employer', 'severance', 'self'] as const).map((k) => (
                  <Field key={k} label={P[k]}>
                    {(p) => <MoneyInput {...p} value={s[k]} onChange={(v) => setS({ ...s, [k]: v })} />}
                  </Field>
                ))}
              </div>
              <Field label={P.returnPct}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={s.ret} onChange={(e) => setS({ ...s, ret: e.target.value })} />}</Field>
            </>
          ) : (
            <>
              <Field label={he.txForm.amount}>{(p) => <MoneyInput {...p} value={s.amount} onChange={(amount) => setS({ ...s, amount })} />}</Field>
              <Field label={P.fromAccount}>
                {(p) => (
                  <select {...p} className={inputCls} value={s.accountId || accounts[0]?.id} onChange={(e) => setS({ ...s, accountId: e.target.value })}>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <button type="submit" className={primaryBtn}>
            {he.common.save}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}

function ProvidersList() {
  const providers = useLiveQuery(() => db.institutions.where('kind').equals('pension_provider').toArray(), []);
  return (
    <datalist id="pension-providers">
      {(providers ?? []).map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}
