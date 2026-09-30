import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { ProgressBar } from '../components/ProgressBar';
import { Field, MoneyInput, Segmented, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useAccounts, useAttachmentUrl, useCards, useWishes } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { WishCategory, type WishItem } from '../../domain/schemas';
import type { WishStatus } from '../../calc/wish';
import { createWish, deleteWish, addSaving, recordWishPurchase, updateWish, type WishInput } from '../../services/wish';
import { deleteAttachment, saveAttachment } from '../../services/attachments';
import { ValidationError } from '../../services/entity';
import { currentMonthIL, formatDisplayMonth, todayIL } from '../../calc/dates';
import { parseAmountToAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const W = he.wish;

function WishImage({ id, className = '' }: { id?: string; className?: string }) {
  const url = useAttachmentUrl(id);
  return url ? (
    <img src={url} alt="" className={`object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-brand-soft text-brand-text ${className}`}>
      <Icon name="gift" size={32} />
    </div>
  );
}

function WishCard({ item, status }: { item: WishItem; status: WishStatus }) {
  return (
    <Link to={`/plan/wish/${item.id}`} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface active:bg-surface-2">
      <WishImage id={item.imageAttachmentId} className="aspect-[4/3] w-full" />
      <div className="flex flex-col gap-1.5 p-3">
        <span className="truncate font-medium">{item.name}</span>
        <Money agorot={item.priceAgorot} className="text-sm text-muted" />
        <ProgressBar usedBp={status.progressBp} state={status.label === 'behind' ? 'near' : 'ok'} label={item.name} />
        <span className="flex justify-between text-xs text-muted">
          <span>{W.labels[status.label]}</span>
          {status.monthlyNeeded !== null && status.label !== 'done' && (
            <span>
              <Money agorot={status.monthlyNeeded} /> {W.monthly}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function WishListScreen() {
  const wishes = useWishes();
  const [filter, setFilter] = useState<'all' | WishItem['fundingMethod']>('all');
  const list = (wishes ?? []).filter((w) => filter === 'all' || w.item.fundingMethod === filter);
  const active = list.filter((w) => w.item.status !== 'done' && w.item.status !== 'inactive');
  const rest = list.filter((w) => !active.includes(w));
  return (
    <>
      <ScreenHeader title={W.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Segmented
          label={W.funding}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: W.filterAll },
            { value: 'saving', label: W.fundings.saving },
            { value: 'installments', label: W.fundings.installments },
          ]}
        />
        <Link to="/plan/wish/new" className={primaryBtn}>
          <Icon name="plus" size={18} />
          {W.add}
        </Link>
        {list.length === 0 && <p className="text-center text-sm text-muted">{W.empty}</p>}
        <div className="grid grid-cols-2 gap-3">
          {[...active, ...rest].map((w) => (
            <WishCard key={w.item.id} item={w.item} status={w.status} />
          ))}
        </div>
      </div>
    </>
  );
}

export function WishDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/plan/wish');
  const toast = useToast();
  const wishes = useWishes();
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const cards = (useCards() ?? []).filter((c) => c.status === 'active');
  const isNew = !id || id === 'new';
  const entry = wishes?.find((w) => w.item.id === id);
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({ name: '', price: '', category: '', priority: 'medium' as WishItem['priority'], status: 'active' as WishItem['status'], fundingMethod: 'saving' as WishItem['fundingMethod'], startMonth: currentMonthIL(), goalMonth: '', savingsAccountId: '', store: '', link: '', imageAttachmentId: '' });
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<null | 'save' | 'buy'>(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (isNew) return;
    void db.wishItems.get(id!).then((w) => {
      if (!w) return;
      setF({ name: w.name, price: agorotToInput(w.priceAgorot), category: w.category ?? '', priority: w.priority, status: w.status, fundingMethod: w.fundingMethod, startMonth: w.startMonth ?? '', goalMonth: w.goalMonth ?? '', savingsAccountId: w.savingsAccountId ?? '', store: w.store ?? '', link: w.link ?? '', imageAttachmentId: w.imageAttachmentId ?? '' });
      setLoaded(true);
    });
  }, [id, isNew]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const price = parseAmountToAgorot(f.price);
    if (!price || price <= 0) return setError(he.txForm.errors.amount);
    const input: WishInput = {
      name: f.name.trim(),
      priceAgorot: price,
      category: (f.category || undefined) as WishItem['category'],
      priority: f.priority,
      status: f.status,
      fundingMethod: f.fundingMethod,
      startMonth: f.startMonth || undefined,
      goalMonth: f.goalMonth || undefined,
      savingsAccountId: f.fundingMethod === 'saving' ? f.savingsAccountId || undefined : undefined,
      store: f.store.trim() || undefined,
      link: f.link.trim() || undefined,
      imageAttachmentId: f.imageAttachmentId || undefined,
    };
    try {
      if (isNew) await createWish(db, input);
      else await updateWish(db, id!, input);
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    if (f.imageAttachmentId) await deleteAttachment(db, f.imageAttachmentId);
    set({ imageAttachmentId: await saveAttachment(db, file) });
  }

  async function onMoney(e: FormEvent) {
    e.preventDefault();
    const a = parseAmountToAgorot(amount);
    if (!a || a <= 0 || !id) return setError(he.txForm.errors.amount);
    const [type, sid = ''] = (source || moneyOptions[0]?.value || '').split(':');
    if (!sid) return setError(he.txForm.errors.account);
    if (sheet === 'save') {
      await addSaving(db, id, sid, a);
      toast({ message: W.savingAdded });
    } else {
      await recordWishPurchase(db, id, type === 'card' ? { cardId: sid } : { accountId: sid }, a, todayIL());
      toast({ message: W.purchaseAdded });
    }
    setSheet(null);
  }

  if (!isNew && !entry) return <ScreenHeader title={W.title} back />;
  if (!loaded) return <ScreenHeader title={W.edit} back />;
  const status = entry?.status;
  const savings = accounts.filter((a) => a.kind === 'savings' || a.kind === 'deposit' || a.kind === 'bank');
  const moneyOptions = [
    ...accounts.filter((a) => a.id !== entry?.item.savingsAccountId).map((a) => ({ value: `acc:${a.id}`, label: a.name })),
    ...(sheet === 'buy' ? cards.map((c) => ({ value: `card:${c.id}`, label: `${c.name} ·· ${c.last4}` })) : []),
  ];

  return (
    <>
      <ScreenHeader title={isNew ? W.add : f.name} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        {status && entry && (
          <section className="flex flex-col gap-3 rounded-card bg-brand p-5 text-on-brand">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-on-brand-muted">{entry.item.fundingMethod === 'saving' ? W.saved : W.paidSoFar}</span>
              <span className="text-sm text-on-brand-muted">{W.labels[status.label]}</span>
            </div>
            <p>
              <Money agorot={status.savedOrPaid} className="text-3xl font-bold" /> <span className="text-on-brand-muted">/ </span>
              <Money agorot={entry.item.priceAgorot} className="text-on-brand-muted" />
            </p>
            <div className="h-2 rounded-full bg-white/20">
              <div className="h-2 rounded-full bg-white" style={{ width: `${Math.round(status.progressBp / 100)}%` }} />
            </div>
            {status.monthlyNeeded !== null && status.monthsLeft !== null && status.label !== 'done' && (
              <p className="text-sm text-on-brand-muted">
                <Money agorot={status.monthlyNeeded} className="text-on-brand" /> {W.monthly} · {W.monthsLeft(status.monthsLeft)}
              </p>
            )}
            <div className="flex gap-2">
              {entry.item.fundingMethod === 'saving' && (
                <button type="button" className="min-h-11 flex-1 rounded-full bg-white/15 text-sm font-medium" onClick={() => (entry.item.savingsAccountId ? (setAmount(''), setSheet('save')) : setError(W.needSavings))}>
                  {W.addSaving}
                </button>
              )}
              <button type="button" className="min-h-11 flex-1 rounded-full bg-white/15 text-sm font-medium" onClick={() => (setAmount(agorotToInput(entry.item.priceAgorot)), setSheet('buy'))}>
                {W.buy}
              </button>
            </div>
          </section>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex items-center gap-3">
            <WishImage id={f.imageAttachmentId || undefined} className="size-20 shrink-0 rounded-2xl" />
            <label className={`${secondaryBtn} cursor-pointer`}>
              {W.pickImage}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onImage(e.target.files?.[0])} />
            </label>
            {f.imageAttachmentId && (
              <button type="button" className="text-sm text-muted" onClick={() => set({ imageAttachmentId: '' })}>
                {W.removeImage}
              </button>
            )}
          </div>
          <Field label={W.name}>{(p) => <input {...p} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label={W.price}>{(p) => <MoneyInput {...p} value={f.price} onChange={(price) => set({ price })} />}</Field>
          <Segmented label={W.funding} value={f.fundingMethod} onChange={(fundingMethod) => set({ fundingMethod })} options={(['saving', 'installments'] as const).map((v) => ({ value: v, label: W.fundings[v] }))} />
          {f.fundingMethod === 'saving' && (
            <Field label={W.savingsAccount}>
              {(p) => (
                <select {...p} className={inputCls} value={f.savingsAccountId} onChange={(e) => set({ savingsAccountId: e.target.value })}>
                  <option value="">—</option>
                  {savings.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={W.startMonth}>{(p) => <input {...p} type="month" className={inputCls} value={f.startMonth} onChange={(e) => set({ startMonth: e.target.value })} />}</Field>
            <Field label={W.goalMonth}>{(p) => <input {...p} type="month" className={inputCls} value={f.goalMonth} onChange={(e) => set({ goalMonth: e.target.value })} />}</Field>
          </div>
          {f.goalMonth && <p className="-mt-2 text-xs text-muted">{formatDisplayMonth(f.goalMonth)}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={W.priority}>
              {(p) => (
                <select {...p} className={inputCls} value={f.priority} onChange={(e) => set({ priority: e.target.value as WishItem['priority'] })}>
                  {(['must', 'high', 'medium', 'low'] as const).map((v) => (
                    <option key={v} value={v}>
                      {W.priorities[v]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={W.status}>
              {(p) => (
                <select {...p} className={inputCls} value={f.status} onChange={(e) => set({ status: e.target.value as WishItem['status'] })}>
                  {(['active', 'paused', 'inactive', 'done'] as const).map((v) => (
                    <option key={v} value={v}>
                      {W.statuses[v]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field label={W.category}>
            {(p) => (
              <select {...p} className={inputCls} value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">—</option>
                {WishCategory.options.map((c) => (
                  <option key={c} value={c}>
                    {W.categories[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={W.store}>{(p) => <input {...p} className={inputCls} value={f.store} onChange={(e) => set({ store: e.target.value })} />}</Field>
          <Field label={W.link}>{(p) => <input {...p} type="url" dir="ltr" className={inputCls} value={f.link} onChange={(e) => set({ link: e.target.value })} />}</Field>
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
                await deleteWish(db, id!);
                navigate('/plan/wish', { replace: true });
              }}
            >
              {he.common.delete}
            </button>
          )}
        </form>
      </div>
      <BottomSheet open={!!sheet} title={sheet === 'save' ? W.addSaving : W.buy} onClose={() => setSheet(null)}>
        <form onSubmit={onMoney} className="flex flex-col gap-4">
          <Field label={he.txForm.amount}>{(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}</Field>
          <Field label={sheet === 'save' ? W.fromAccount : W.buyFrom}>
            {(p) => (
              <select {...p} className={inputCls} value={source || moneyOptions[0]?.value} onChange={(e) => setSource(e.target.value)}>
                {moneyOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button type="submit" className={primaryBtn}>
            {he.common.save}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
