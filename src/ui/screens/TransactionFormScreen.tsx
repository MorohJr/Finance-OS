import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Segmented, Toggle, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { byId, categoryLabel, useAccounts, useCards, useCategories, usePayees } from '../data';
import { db } from '../../db/db';
import type { Category, Transaction, TransactionKind } from '../../domain/schemas';
import { PaymentMethod } from '../../domain/schemas';
import { deleteTransaction, findOpeningBalance, type TransactionInput } from '../../services/transactions';
import { deletePlanForTransaction, saveTransactionWithInstallments, syncCardStatements, type InstallmentInput } from '../../services/cards';
import { cycleForDate, splitInstallments } from '../../calc/cards';
import { formatAgorot } from '../../calc/money';
import { findOrCreatePayee, rememberPayeeCategory } from '../../services/payees';
import { ValidationError } from '../../services/entity';
import { suggestCategory } from '../../calc/categoryRules';
import { parseAmountToAgorot } from '../../calc/money';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { agorotToInput } from '../format';
import { he } from '../strings.he';
import { useGoBack, useSettings } from '../hooks';

const F = he.txForm;
const MAIN_KINDS = ['expense', 'income', 'transfer'] as const;
const EXTRA_KINDS = ['refund', 'adjustment', 'opening_balance'] as const;
const USER_KINDS: readonly TransactionKind[] = [...MAIN_KINDS, ...EXTRA_KINDS];

type Errors = Partial<Record<'amount' | 'account' | 'toAccount' | 'note' | 'direction' | 'date' | 'form', string>>;

const INDENT = String.fromCharCode(160).repeat(2);

function hasCategory(kind: TransactionKind) {
  return kind === 'expense' || kind === 'income' || kind === 'refund';
}

/** Categories that fit the kind and context, parents followed by their children (one level, SPEC 6.6). */
function categoryOptions(all: Category[], kind: TransactionKind, context: Transaction['context']) {
  const type = kind === 'income' ? 'income' : 'expense';
  const fits = (c: Category) => !c.deletedAt && c.type === type && (c.context === context || c.context === 'both');
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'he');
  const tops = all.filter((c) => fits(c) && !c.parentId).sort(byName);
  return tops.flatMap((p) => [
    { id: p.id, label: p.name },
    ...all.filter((c) => fits(c) && c.parentId === p.id).sort(byName).map((c) => ({ id: c.id, label: `${INDENT}› ${c.name}` })),
  ]);
}

export function TransactionFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const goBack = useGoBack('/transactions');
  const accounts = useAccounts();
  const categoriesList = useCategories();
  const categories = byId(categoriesList);
  const payees = usePayees();
  const rules = useLiveQuery(() => db.categoryRules.toArray(), []);

  const [existing, setExisting] = useState<Transaction | undefined>();
  const [loaded, setLoaded] = useState(!id);
  const [kind, setKind] = useState<TransactionKind>((params.get('kind') as TransactionKind) || 'expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIL());
  const [accountIdState, setAccountId] = useState(params.get('accountId') ?? '');
  const [cardId, setCardId] = useState(params.get('cardId') ?? '');
  const cards = useCards();
  const settings = useSettings();
  const [instOn, setInstOn] = useState(false);
  const [instCount, setInstCount] = useState('3');
  const [instKind, setInstKind] = useState<InstallmentInput['kind']>('installments');
  const [instInterest, setInstInterest] = useState('');
  const [instRecognition, setInstRecognition] = useState<InstallmentInput['budgetRecognition'] | undefined>();
  const [instFirst, setInstFirst] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [categoryId, setCategoryId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [contextState, setContext] = useState<Transaction['context'] | undefined>();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState<Transaction['status']>('cleared');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Defaults are derived, not stored: the first active account, and that account's context.
  const cardAllowed = kind === 'expense' || kind === 'refund';
  const card = cardAllowed && cardId ? (cards ?? []).find((c) => c.id === cardId) : undefined;
  const accountId = card ? '' : accountIdState || (id ? '' : ((accounts ?? []).find((a) => a.status === 'active')?.id ?? ''));
  const context: Transaction['context'] = contextState ?? card?.context ?? (accounts ?? []).find((a) => a.id === accountId)?.context ?? 'personal';
  const canInstall = card?.kind === 'credit' && kind === 'expense';
  const recognition = instRecognition ?? settings?.defaultBudgetRecognition ?? 'spread';
  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active' || a.id === accountId || a.id === toAccountId);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const t = await db.transactions.get(id);
      if (!t || t.deletedAt) return navigate('/transactions', { replace: true });
      setExisting(t);
      setKind(t.kind);
      setAmount(agorotToInput(t.amountAgorot));
      setDate(t.date);
      setAccountId(t.cardId ? '' : (t.accountId ?? ''));
      setCardId(t.cardId ?? '');
      const plan = await db.installmentPlans.where('transactionId').equals(t.id).filter((p) => !p.deletedAt).first();
      if (plan) {
        setInstOn(true);
        setInstCount(String(plan.count));
        setInstKind(plan.kind);
        setInstInterest(agorotToInput(plan.interestTotalAgorot));
        setInstRecognition(plan.budgetRecognition);
        setInstFirst(plan.firstChargeDate);
      }
      setToAccountId(t.toAccountId ?? '');
      setDirection(t.direction ?? 'in');
      setCategoryId(t.categoryId ?? '');
      setPayeeName(t.payeeId ? ((await db.payees.get(t.payeeId))?.name ?? '') : '');
      setDescription(t.description ?? '');
      setNote(t.note ?? '');
      setTags(t.tags.join(' '));
      setContext(t.context);
      setPaymentMethod(t.paymentMethod ?? '');
      setStatus(t.status);
      setLoaded(true);
    })();
  }, [id, navigate]);

  const options = useMemo(() => categoryOptions(categoriesList ?? [], kind, context), [categoriesList, kind, context]);

  // SPEC 6.7: in manual entry, a matching rule or payee default is only a suggestion.
  const suggestion = useMemo(() => {
    if (!hasCategory(kind) || categoryId) return undefined;
    const text = payeeName || description;
    if (!text.trim()) return undefined;
    const s = suggestCategory(text, rules ?? [], payees ?? []);
    return s && options.some((o) => o.id === s.categoryId) ? s : undefined;
  }, [kind, categoryId, payeeName, description, rules, payees, options]);

  const isSystemKind = !USER_KINDS.includes(kind);

  const installmentPreview = useMemo(() => {
    const total = parseAmountToAgorot(amount);
    const n = Number(instCount);
    if (!total || total <= 0 || !Number.isInteger(n) || n < 2 || n > 60) return '';
    const [first = 0, rest = 0] = splitInstallments(total, n);
    return he.installments.preview(formatAgorot(first), formatAgorot(rest), n);
  }, [amount, instCount]);

  // A transaction dated before the account's opening balance is usually double-counted:
  // the opening balance already includes it. Warn, don't block.
  const opening = useLiveQuery(async () => (accountId ? findOpeningBalance(db, accountId) : undefined), [accountId]);
  const beforeOpening = kind !== 'opening_balance' && !!opening && !!date && date < opening.date && opening.id !== existing?.id;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    const agorot = parseAmountToAgorot(amount);
    if (agorot === null || agorot <= 0) errs.amount = F.errors.amount;
    if (!accountId && !card) errs.account = F.errors.account;
    const count = Number(instCount);
    const useInst = canInstall && instOn;
    if (useInst && (!Number.isInteger(count) || count < 2 || count > 60)) errs.form = he.installments.countError;
    const interest = useInst && instKind === 'credit' && instInterest.trim() ? parseAmountToAgorot(instInterest) : undefined;
    if (interest === null) errs.form = he.txForm.errors.amount;
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) errs.toAccount = F.errors.toAccount;
    if (kind === 'adjustment' && !note.trim()) errs.note = F.errors.note;
    if (!date) errs.date = F.errors.date;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payee = hasCategory(kind) && payeeName.trim() ? await findOrCreatePayee(db, payeeName) : undefined;
      const signed = kind === 'opening_balance' || kind === 'adjustment' || kind === 'investment_trade';
      const input: TransactionInput = {
        kind,
        amountAgorot: agorot!,
        date,
        accountId: card ? undefined : accountId || undefined,
        cardId: card?.id,
        toAccountId: kind === 'transfer' ? toAccountId : undefined,
        direction: signed ? direction : undefined,
        categoryId: hasCategory(kind) ? categoryId || undefined : undefined,
        payeeId: payee?.id,
        description: description.trim() || undefined,
        note: note.trim() || undefined,
        tags: tags.split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter(Boolean),
        context,
        paymentMethod: (paymentMethod || undefined) as Transaction['paymentMethod'],
        status,
        business: existing?.business,
        source: existing?.source,
      };
      const inst: InstallmentInput | undefined = useInst
        ? { count, kind: instKind, interestTotalAgorot: interest ?? undefined, budgetRecognition: recognition, firstChargeDate: instFirst || undefined }
        : undefined;
      await saveTransactionWithInstallments(db, existing?.id, input, inst);
      if (card) await syncCardStatements(db);
      if (payee && categoryId) await rememberPayeeCategory(db, payee.id, categoryId);
      toast({ message: he.transactions.savedToast });
      goBack();
    } catch (err) {
      if (err instanceof ValidationError) {
        const FIELDS: Record<string, keyof Errors> = { toAccountId: 'toAccount', accountId: 'account', amountAgorot: 'amount', note: 'note', direction: 'direction', date: 'date' };
        const next: Errors = {};
        for (const i of err.issues) next[FIELDS[i.path] ?? 'form'] = i.message;
        setErrors(next);
      } else if ((err as Error).message === 'opening_balance_exists') {
        setErrors({ form: F.errors.opening_balance_exists });
      } else {
        setErrors({ form: he.common.errorGeneric });
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing) return;
    const undo = await deleteTransaction(db, existing.id);
    await deletePlanForTransaction(db, existing.id);
    toast({ message: he.transactions.deletedToast, action: { label: he.common.undo, run: () => void undo() } });
    goBack();
  }

  if (!loaded || !accounts) return <ScreenHeader title={F.kind} back />;

  const accountSelect = (label: string, value: string, onChange: (v: string) => void, error?: string, exclude?: string) => (
    <Field label={label} error={error}>
      {(p) => (
        <select
          {...p}
          className={inputCls}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          <option value="">—</option>
          {activeAccounts
            .filter((a) => a.id !== exclude)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      )}
    </Field>
  );

  return (
    <>
      <ScreenHeader title={existing ? he.transactions.editTitle : he.transactions.newTitle} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        {isSystemKind ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{he.kind[kind]}</p>
        ) : (
          <>
            <Segmented
              label={F.kind}
              value={(MAIN_KINDS as readonly string[]).includes(kind) ? kind : ('' as TransactionKind)}
              onChange={(k) => setKind(k)}
              options={MAIN_KINDS.map((k) => ({ value: k, label: he.kind[k] }))}
            />
            <div className="-mt-2 flex gap-2">
              {EXTRA_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-9 rounded-full px-3 text-xs ${kind === k ? 'bg-brand text-on-brand' : 'bg-surface text-muted'}`}
                >
                  {he.kind[k]}
                </button>
              ))}
            </div>
          </>
        )}

        <Field label={F.amount} error={errors.amount}>
          {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} autoFocus={!existing} />}
        </Field>

        {(kind === 'opening_balance' || kind === 'adjustment') && (
          <>
            <Segmented
              label={F.direction}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'in', label: he.direction.in },
                { value: 'out', label: he.direction.out },
              ]}
            />
            <p className="-mt-2 text-xs text-muted">{kind === 'adjustment' ? F.adjustmentHint : F.openingHint}</p>
          </>
        )}

        {kind === 'transfer' ? (
          <>
            {accountSelect(F.fromAccount, accountId, setAccountId, errors.account)}
            {accountSelect(F.toAccount, toAccountId, setToAccountId, errors.toAccount, accountId)}
          </>
        ) : cardAllowed && (cards ?? []).some((c) => c.status === 'active') ? (
          <Field label={F.source} error={errors.account}>
            {(p) => (
              <select
                {...p}
                className={inputCls}
                value={card ? `card:${card.id}` : accountId ? `acc:${accountId}` : ''}
                onChange={(e) => {
                  const [type, value = ''] = e.target.value.split(':');
                  if (type === 'card') {
                    setCardId(value);
                  } else {
                    setCardId('');
                    setAccountId(value);
                  }
                }}
              >
                <option value="">—</option>
                <optgroup label={F.accountsGroup}>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={`acc:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={F.cardsGroup}>
                  {(cards ?? [])
                    .filter((c) => c.status === 'active' || c.id === cardId)
                    .map((c) => (
                      <option key={c.id} value={`card:${c.id}`}>
                        {`${c.name} ·· ${c.last4}`}
                      </option>
                    ))}
                </optgroup>
              </select>
            )}
          </Field>
        ) : (
          accountSelect(F.account, accountId, setAccountId, errors.account)
        )}

        {canInstall && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
            <Toggle label={he.installments.toggle} checked={instOn} onChange={setInstOn} />
            {instOn && (
              <>
                <Field label={he.installments.count}>
                  {(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={instCount} onChange={(e) => setInstCount(e.target.value.replace(/\D/g, ''))} />}
                </Field>
                <Segmented
                  label={he.installments.kind}
                  value={instKind}
                  onChange={setInstKind}
                  options={[
                    { value: 'installments', label: he.installments.installments },
                    { value: 'credit', label: he.installments.credit },
                  ]}
                />
                {instKind === 'credit' && (
                  <Field label={he.installments.interest} hint={he.installments.interestHint}>
                    {(p) => <MoneyInput {...p} value={instInterest} onChange={setInstInterest} />}
                  </Field>
                )}
                <div>
                  <p className="mb-1.5 text-sm font-medium">{he.installments.recognition}</p>
                  <Segmented
                    label={he.installments.recognition}
                    value={recognition}
                    onChange={setInstRecognition}
                    options={[
                      { value: 'spread', label: he.installments.spread },
                      { value: 'upfront', label: he.installments.upfront },
                    ]}
                  />
                </div>
                <Field label={he.installments.firstCharge}>
                  {(p) => <input {...p} type="date" className={inputCls} value={instFirst || (card && date ? cycleForDate(date, card).chargeDate : '')} onChange={(e) => setInstFirst(e.target.value)} />}
                </Field>
                {installmentPreview && <p className="text-sm text-muted">{installmentPreview}</p>}
              </>
            )}
          </div>
        )}

        <Field label={F.date} error={errors.date} hint={beforeOpening && opening ? F.beforeOpening(formatDisplayDate(opening.date)) : undefined}>
          {(p) => <input {...p} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>

        {hasCategory(kind) && (
          <>
            <Field label={F.payee}>
              {(p) => (
                <>
                  <input {...p} list="payees" className={inputCls} value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder={F.payeePlaceholder} autoComplete="off" />
                  <datalist id="payees">
                    {(payees ?? []).map((x) => (
                      <option key={x.id} value={x.name} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label={F.category}>
              {(p) => (
                <select {...p} className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{F.noCategory}</option>
                  {categoryId && !options.some((o) => o.id === categoryId) && <option value={categoryId}>{categoryLabel(categories.get(categoryId), categories)}</option>}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {suggestion && (
              <button type="button" onClick={() => setCategoryId(suggestion.categoryId)} className="-mt-2 self-start rounded-full bg-brand-soft px-3 py-2 text-sm text-brand-text">
                {F.suggestion(categoryLabel(categories.get(suggestion.categoryId), categories))}
              </button>
            )}
          </>
        )}

        <Segmented
          label={F.context}
          value={context}
          onChange={setContext}
          options={[
            { value: 'personal', label: he.context.personal },
            { value: 'business', label: he.context.business },
          ]}
        />

        <Field label={F.description}>{(p) => <input {...p} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>

        <Field label={kind === 'adjustment' ? F.noteRequired : F.note} error={errors.note}>
          {(p) => <textarea {...p} rows={2} className={`${inputCls} py-2`} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>

        <details className="rounded-xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{`${F.paymentMethod}, ${F.tags}, ${F.status}`}</summary>
          <div className="flex flex-col gap-4 p-3 pt-0">
            <Field label={F.paymentMethod}>
              {(p) => (
                <select {...p} className={inputCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">—</option>
                  {PaymentMethod.options.map((m) => (
                    <option key={m} value={m}>
                      {he.paymentMethod[m]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={F.tags}>{(p) => <input {...p} className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={F.tagsPlaceholder} />}</Field>
            <Segmented
              label={F.status}
              value={status}
              onChange={setStatus}
              options={[
                { value: 'cleared', label: he.status.cleared },
                { value: 'pending', label: he.status.pending },
              ]}
            />
          </div>
        </details>

        {errors.form && (
          <p role="alert" className="text-sm text-expense">
            {errors.form}
          </p>
        )}

        <button type="submit" disabled={saving} className={primaryBtn}>
          {he.common.save}
        </button>
        {existing && (
          <button type="button" onClick={onDelete} className={dangerBtn}>
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}
