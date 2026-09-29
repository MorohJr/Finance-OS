import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Segmented, Toggle, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useAccounts, useInstitutions } from '../data';
import { db } from '../../db/db';
import type { Card } from '../../domain/schemas';
import { createCard, deleteCard, setCardStatus, updateCard, type CardInput } from '../../services/cards';
import { parseAmountToAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const C = he.cards;
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function CardFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const issuers = (useInstitutions() ?? []).filter((i) => i.kind === 'card_issuer');
  const [existing, setExisting] = useState<Card | undefined>();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [last4, setLast4] = useState('');
  const [kind, setKind] = useState<Card['kind']>('credit');
  const [billingAccountId, setBilling] = useState('');
  const [chargeDay, setChargeDay] = useState(10);
  const [calendar, setCalendar] = useState(true);
  const [cutoff, setCutoff] = useState(20);
  const [limit, setLimit] = useState('');
  const [context, setContext] = useState<Card['context']>('personal');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const c = await db.cards.get(id);
      if (!c) return navigate('/accounts', { replace: true });
      setExisting(c);
      setName(c.name);
      setIssuerId(c.issuerId);
      setLast4(c.last4);
      setKind(c.kind);
      setBilling(c.billingAccountId);
      setChargeDay(c.chargeDay);
      setCalendar(c.cycleCutoffDay === null);
      if (c.cycleCutoffDay !== null) setCutoff(c.cycleCutoffDay);
      setLimit(agorotToInput(c.creditLimit));
      setContext(c.context);
      setLoaded(true);
    })();
  }, [id, navigate]);

  const banks = (accounts ?? []).filter((a) => a.status === 'active' && (a.kind === 'bank' || a.kind === 'platform' || a.kind === 'prepaid'));
  const effectiveBilling = billingAccountId || banks[0]?.id || '';
  const effectiveIssuer = issuerId || issuers[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = C.namePlaceholder;
    if (!/^\d{4}$/.test(last4)) errs.last4 = C.last4Hint;
    if (!effectiveBilling) errs.billing = C.needAccount;
    const limitAgorot = kind === 'credit' && limit.trim() ? parseAmountToAgorot(limit) : undefined;
    if (limitAgorot === null || (limitAgorot !== undefined && limitAgorot < 0)) errs.limit = he.txForm.errors.amount;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input: CardInput = {
      name: name.trim(),
      issuerId: effectiveIssuer,
      last4,
      kind,
      billingAccountId: effectiveBilling,
      chargeDay,
      cycleCutoffDay: calendar ? null : cutoff,
      creditLimit: kind === 'credit' ? (limitAgorot ?? undefined) : undefined,
      context,
    };
    const saved = existing ? await updateCard(db, existing.id, input) : await createCard(db, input);
    navigate(`/cards/${saved.id}`, { replace: true });
  }

  if (!loaded || !accounts) return <ScreenHeader title={C.edit} back />;
  if (!banks.length && !existing)
    return (
      <>
        <ScreenHeader title={C.add} back />
        <div className="flex flex-col gap-3 px-4">
          <p className="text-sm text-muted">{C.needAccount}</p>
          <Link to="/accounts/new" className={primaryBtn}>
            {he.home.addAccount}
          </Link>
        </div>
      </>
    );

  return (
    <>
      <ScreenHeader title={existing ? C.edit : C.add} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={C.name} error={errors.name}>
          {(p) => <input {...p} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={C.namePlaceholder} />}
        </Field>
        <Field label={C.issuer}>
          {(p) => (
            <select {...p} className={inputCls} value={effectiveIssuer} onChange={(e) => setIssuerId(e.target.value)}>
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={C.last4} error={errors.last4} hint={C.last4Hint}>
          {(p) => (
            <input {...p} inputMode="numeric" maxLength={4} dir="ltr" autoComplete="off" className={`${inputCls} num text-start`} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          )}
        </Field>
        <Segmented
          label={C.kind}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'credit', label: C.credit },
            { value: 'debit', label: C.debit },
          ]}
        />
        <Field label={C.billingAccount} error={errors.billing}>
          {(p) => (
            <select {...p} className={inputCls} value={effectiveBilling} onChange={(e) => setBilling(e.target.value)}>
              {banks.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {kind === 'credit' && (
          <>
            <Field label={C.chargeDay}>
              {(p) => (
                <select {...p} className={inputCls} value={chargeDay} onChange={(e) => setChargeDay(Number(e.target.value))}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Toggle label={C.calendarCycle} hint={C.calendarCycleHint} checked={calendar} onChange={setCalendar} />
            {!calendar && (
              <Field label={C.cutoffDay}>
                {(p) => (
                  <select {...p} className={inputCls} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label={C.creditLimit} error={errors.limit}>
              {(p) => <MoneyInput {...p} value={limit} onChange={setLimit} />}
            </Field>
          </>
        )}
        <Segmented
          label={he.txForm.context}
          value={context}
          onChange={setContext}
          options={[
            { value: 'personal', label: he.context.personal },
            { value: 'business', label: he.context.business },
          ]}
        />
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
        {existing && (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <button
              type="button"
              className={secondaryBtn}
              onClick={async () => {
                await setCardStatus(db, existing.id, existing.status === 'active' ? 'closed' : 'active');
                navigate(`/cards/${existing.id}`, { replace: true });
              }}
            >
              {existing.status === 'active' ? C.closeCard : C.reopenCard}
            </button>
            <button
              type="button"
              className={dangerBtn}
              onClick={async () => {
                try {
                  await deleteCard(db, existing.id);
                  navigate('/accounts', { replace: true });
                } catch {
                  setActionError(C.deleteHasTx);
                }
              }}
            >
              {C.deleteCard}
            </button>
            {actionError && (
              <p role="alert" className="text-sm text-expense">
                {actionError}
              </p>
            )}
          </div>
        )}
      </form>
    </>
  );
}
