import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Field, MoneyInput, Segmented, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { byId, useAccounts, useCategories, useChecks } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { Check as CheckSchema, type Check } from '../../domain/schemas';
import { createCheck, deleteCheck, setCheckStatus, updateCheck, type CheckInput } from '../../services/debts';
import { ValidationError } from '../../services/entity';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { parseAmountToAgorot, sumAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const C = he.checks;
const STATUSES = CheckSchema.shape.status.options;

export function ChecksScreen() {
  const [params, setParams] = useSearchParams();
  const tab: Check['direction'] = params.get('tab') === 'received' ? 'received' : 'issued';
  const checks = useChecks();
  const accounts = byId(useAccounts());
  const today = todayIL();
  const list = (checks ?? []).filter((c) => c.direction === tab).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = list.filter((c) => c.status === 'pending' || c.status === 'deposited');

  return (
    <>
      <ScreenHeader title={C.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Segmented
          label={C.direction}
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[
            { value: 'issued', label: C.issued },
            { value: 'received', label: C.received },
          ]}
        />
        <section className="rounded-card bg-brand p-4 text-on-brand">
          <p className="text-xs text-on-brand-muted">{C.pendingTotal}</p>
          <Money agorot={sumAgorot(pending.map((c) => c.amountAgorot))} className="text-2xl font-bold" />
        </section>
        <Link to={`/checks/new?direction=${tab}`} className={primaryBtn}>
          <Icon name="plus" size={18} />
          {C.add}
        </Link>
        {list.length === 0 && <p className="text-center text-sm text-muted">{C.empty}</p>}
        {list.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {list.map((c) => {
              const live = c.status === 'pending' || c.status === 'deposited';
              return (
                <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${live ? '' : 'opacity-60'}`}>
                  <Link to={`/checks/${c.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.counterparty}</span>
                    <span className="block text-xs text-muted">
                      #{c.number} · <span className="num">{formatDisplayDate(c.dueDate)}</span>
                      {c.dueDate > today && live && ` · ${C.postDated}`} · {C.statuses[c.status]}
                      {accounts.get(c.accountId) && ` · ${accounts.get(c.accountId)!.name}`}
                    </span>
                  </Link>
                  <Money agorot={c.direction === 'issued' ? -c.amountAgorot : c.amountAgorot} tone={c.direction === 'issued' ? 'expense' : 'income'} className="text-sm" />
                  {live && (
                    <button type="button" onClick={() => void setCheckStatus(db, c.id, 'cleared')} className="min-h-10 shrink-0 rounded-full bg-brand-soft px-3 text-sm text-brand-text">
                      {C.markCleared}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function CheckFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/checks');
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const categories = useCategories() ?? [];
  const [existing, setExisting] = useState<Check>();
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    direction: (params.get('direction') === 'received' ? 'received' : 'issued') as Check['direction'],
    number: '',
    bankName: '',
    branch: '',
    amount: '',
    issueDate: todayIL(),
    dueDate: todayIL(),
    counterparty: '',
    accountId: '',
    status: 'pending' as Check['status'],
    categoryId: '',
    context: 'personal' as Check['context'],
    note: '',
  });
  const [error, setError] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      const c = await db.checks.get(id);
      if (!c) return navigate('/checks', { replace: true });
      setExisting(c);
      setF({ direction: c.direction, number: c.number, bankName: c.bankName ?? '', branch: c.branch ?? '', amount: agorotToInput(c.amountAgorot), issueDate: c.issueDate, dueDate: c.dueDate, counterparty: c.counterparty, accountId: c.accountId, status: c.status, categoryId: c.categoryId ?? '', context: c.context, note: c.note ?? '' });
      setLoaded(true);
    })();
  }, [id, navigate]);

  const accountId = f.accountId || accounts[0]?.id || '';
  const catType = f.direction === 'issued' ? 'expense' : 'income';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const amount = parseAmountToAgorot(f.amount);
    if (!amount || amount <= 0) return setError(he.txForm.errors.amount);
    const input: CheckInput = {
      direction: f.direction,
      number: f.number.trim(),
      bankName: f.direction === 'received' ? f.bankName.trim() || undefined : undefined,
      branch: f.direction === 'received' ? f.branch.trim() || undefined : undefined,
      amountAgorot: amount,
      issueDate: f.issueDate,
      dueDate: f.dueDate,
      counterparty: f.counterparty.trim(),
      accountId,
      status: f.status,
      categoryId: f.categoryId || undefined,
      context: f.context,
      note: f.note.trim() || undefined,
    };
    try {
      if (existing) await updateCheck(db, existing.id, input);
      else await createCheck(db, input);
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded) return <ScreenHeader title={C.edit} back />;
  return (
    <>
      <ScreenHeader title={existing ? C.edit : C.add} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Segmented label={C.direction} value={f.direction} onChange={(direction) => set({ direction, categoryId: '' })} options={[{ value: 'issued', label: C.issued }, { value: 'received', label: C.received }]} />
        <Field label={C.counterparty}>{(p) => <input {...p} className={inputCls} value={f.counterparty} onChange={(e) => set({ counterparty: e.target.value })} />}</Field>
        <Field label={C.amount}>{(p) => <MoneyInput {...p} value={f.amount} onChange={(amount) => set({ amount })} />}</Field>
        <Field label={C.number}>{(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={f.number} onChange={(e) => set({ number: e.target.value })} />}</Field>
        {f.direction === 'received' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={C.bankName}>{(p) => <input {...p} className={inputCls} value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} />}</Field>
            <Field label={C.branch}>{(p) => <input {...p} inputMode="numeric" className={inputCls} value={f.branch} onChange={(e) => set({ branch: e.target.value })} />}</Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={C.issueDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />}</Field>
          <Field label={C.dueDate}>{(p) => <input {...p} type="date" className={inputCls} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />}</Field>
        </div>
        <Field label={C.account}>
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
        <Field label={C.category}>
          {(p) => (
            <select {...p} className={inputCls} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">{he.txForm.noCategory}</option>
              {categories
                .filter((c) => !c.deletedAt && c.type === catType)
                .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label={C.status}>
          {(p) => (
            <select {...p} className={inputCls} value={f.status} onChange={(e) => set({ status: e.target.value as Check['status'] })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {C.statuses[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Segmented label={he.txForm.context} value={f.context} onChange={(context) => set({ context })} options={[{ value: 'personal', label: he.context.personal }, { value: 'business', label: he.context.business }]} />
        <Field label={he.txForm.note}>{(p) => <textarea {...p} rows={2} className={`${inputCls} py-2`} value={f.note} onChange={(e) => set({ note: e.target.value })} />}</Field>
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
              await deleteCheck(db, existing.id);
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
