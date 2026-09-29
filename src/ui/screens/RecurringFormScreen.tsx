import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Toggle, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { useAccounts, useCards, useCategories } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { Frequency, type Recurring } from '../../domain/schemas';
import { createRecurring, deleteRecurring, updateRecurring, type RecurringInput } from '../../services/recurring';
import { ValidationError } from '../../services/entity';
import { parseAmountToAgorot } from '../../calc/money';
import { todayIL } from '../../calc/dates';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const R = he.recurring;
const KINDS: Recurring['kind'][] = ['bill', 'subscription', 'income', 'transfer'];

function statusesFor(kind: Recurring['kind']): Recurring['status'][] {
  if (kind === 'bill') return ['active', 'grace_period', 'inactive'];
  if (kind === 'subscription') return ['active', 'trial', 'inactive'];
  return ['active', 'inactive'];
}

export function RecurringFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/plan/recurring');
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const cards = (useCards() ?? []).filter((c) => c.status === 'active');
  const categories = useCategories() ?? [];
  const [loaded, setLoaded] = useState(!id);
  const [existing, setExisting] = useState<Recurring>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Recurring['kind']>('bill');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Recurring['frequency']>('monthly');
  const [nextDueDate, setNextDueDate] = useState(todayIL());
  const [source, setSource] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<Recurring['status']>('active');
  const [trialEndDate, setTrialEnd] = useState('');
  const [commitmentEndDate, setCommitmentEnd] = useState('');
  const [renewalDate, setRenewal] = useState('');
  const [autoCreate, setAutoCreate] = useState(false);
  const [reminder, setReminder] = useState('');
  const [cpi, setCpi] = useState(false);
  const [provider, setProvider] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await db.recurring.get(id);
      if (!r) return navigate('/plan/recurring', { replace: true });
      setExisting(r);
      setName(r.name);
      setKind(r.kind);
      setAmount(agorotToInput(r.amountAgorot));
      setFrequency(r.frequency);
      setNextDueDate(r.nextDueDate);
      setSource(r.cardId ? `card:${r.cardId}` : r.accountId ? `acc:${r.accountId}` : '');
      setToAccountId(r.toAccountId ?? '');
      setCategoryId(r.categoryId ?? '');
      setStatus(r.status);
      setTrialEnd(r.trialEndDate ?? '');
      setCommitmentEnd(r.commitmentEndDate ?? '');
      setRenewal(r.renewalDate ?? '');
      setAutoCreate(r.autoCreate);
      setReminder(r.reminderDaysBefore?.toString() ?? '');
      setCpi(!!r.linkedToCPI);
      setProvider(r.provider ?? '');
      setNote(r.note ?? '');
      setLoaded(true);
    })();
  }, [id, navigate]);

  const effectiveSource = source || (accounts[0] ? `acc:${accounts[0].id}` : '');
  const [srcType, srcId = ''] = effectiveSource.split(':');
  const catType = kind === 'income' ? 'income' : 'expense';
  const catOptions = categories.filter((c) => !c.deletedAt && c.type === catType).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const allowedStatuses = statusesFor(kind);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const a = amount.trim() ? parseAmountToAgorot(amount) : undefined;
    if (a === null || (a !== undefined && a <= 0)) return setError(he.txForm.errors.amount);
    const input: RecurringInput = {
      name: name.trim(),
      kind,
      amountAgorot: a,
      frequency,
      nextDueDate,
      accountId: srcType === 'acc' ? srcId : undefined,
      cardId: srcType === 'card' && kind !== 'income' && kind !== 'transfer' ? srcId : undefined,
      toAccountId: kind === 'transfer' ? toAccountId || undefined : undefined,
      categoryId: kind === 'transfer' ? undefined : categoryId || undefined,
      status: allowedStatuses.includes(status) ? status : 'active',
      trialEndDate: status === 'trial' ? trialEndDate || undefined : undefined,
      commitmentEndDate: commitmentEndDate || undefined,
      renewalDate: renewalDate || undefined,
      autoCreate,
      reminderDaysBefore: reminder ? Number(reminder) : undefined,
      linkedToCPI: cpi || undefined,
      provider: provider.trim() || undefined,
      note: note.trim() || undefined,
      paymentMethod: srcType === 'card' ? 'card' : kind === 'transfer' ? 'standing_order' : undefined,
    };
    try {
      if (existing) await updateRecurring(db, existing.id, input);
      else await createRecurring(db, input);
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded) return <ScreenHeader title={R.edit} back />;

  return (
    <>
      <ScreenHeader title={existing ? R.edit : R.new} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={R.name}>{(p) => <input {...p} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={R.namePlaceholder} />}</Field>
        <Field label={R.kind}>
          {(p) => (
            <select {...p} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Recurring['kind'])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {R.kinds[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={R.frequency}>
          {(p) => (
            <select {...p} className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as Recurring['frequency'])}>
              {Frequency.options.map((f) => (
                <option key={f} value={f}>
                  {R.frequencies[f]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={frequency === 'usage_based' ? R.amountUsage : R.amount}>{(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}</Field>
        <Field label={R.nextDue}>{(p) => <input {...p} type="date" className={inputCls} value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />}</Field>
        <Field label={R.source}>
          {(p) => (
            <select {...p} className={inputCls} value={effectiveSource} onChange={(e) => setSource(e.target.value)}>
              <optgroup label={he.txForm.accountsGroup}>
                {accounts.map((a) => (
                  <option key={a.id} value={`acc:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              {kind !== 'income' && kind !== 'transfer' && cards.length > 0 && (
                <optgroup label={he.txForm.cardsGroup}>
                  {cards.map((c) => (
                    <option key={c.id} value={`card:${c.id}`}>
                      {`${c.name} ·· ${c.last4}`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </Field>
        {kind === 'transfer' ? (
          <Field label={R.toAccount}>
            {(p) => (
              <select {...p} className={inputCls} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">—</option>
                {accounts
                  .filter((a) => a.id !== srcId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        ) : (
          <Field label={R.category}>
            {(p) => (
              <select {...p} className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{he.txForm.noCategory}</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label={R.status}>
          {(p) => (
            <select {...p} className={inputCls} value={allowedStatuses.includes(status) ? status : 'active'} onChange={(e) => setStatus(e.target.value as Recurring['status'])}>
              {allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {R.statuses[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {status === 'trial' && kind === 'subscription' && (
          <Field label={R.trialEnd}>{(p) => <input {...p} type="date" className={inputCls} value={trialEndDate} onChange={(e) => setTrialEnd(e.target.value)} />}</Field>
        )}
        <Toggle label={R.autoCreate} hint={R.autoCreateHint} checked={autoCreate} onChange={setAutoCreate} />

        <details className="rounded-xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{`${R.commitmentEnd}, ${R.renewal}, ${R.reminder}`}</summary>
          <div className="flex flex-col gap-4 p-3 pt-0">
            <Field label={R.commitmentEnd}>{(p) => <input {...p} type="date" className={inputCls} value={commitmentEndDate} onChange={(e) => setCommitmentEnd(e.target.value)} />}</Field>
            <Field label={R.renewal}>{(p) => <input {...p} type="date" className={inputCls} value={renewalDate} onChange={(e) => setRenewal(e.target.value)} />}</Field>
            <Field label={R.reminder}>
              {(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={reminder} onChange={(e) => setReminder(e.target.value.replace(/\D/g, '').slice(0, 3))} />}
            </Field>
            <Toggle label={R.cpi} hint={R.cpiHint} checked={cpi} onChange={setCpi} />
            <Field label={R.provider}>{(p) => <input {...p} className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} />}</Field>
            <Field label={R.note}>{(p) => <textarea {...p} rows={2} className={`${inputCls} py-2`} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
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
        {existing && (
          <button
            type="button"
            className={dangerBtn}
            onClick={async () => {
              await deleteRecurring(db, existing.id);
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
