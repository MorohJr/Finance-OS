import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Field, MoneyInput, Segmented, Toggle, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useInstitutions } from '../data';
import { db } from '../../db/db';
import type { Account } from '../../domain/schemas';
import { createAccount, deleteAccount, openingBalanceOf, setAccountStatus, setOpeningBalance, updateAccount, type AccountInput } from '../../services/accounts';
import { parseAmountToAgorot, parsePercentToBp } from '../../calc/money';
import { todayIL } from '../../calc/dates';
import { agorotToInput, bpToInput } from '../format';
import { he } from '../strings.he';

const A = he.accounts;
const KINDS: Account['kind'][] = ['bank', 'savings', 'deposit', 'cash', 'brokerage', 'prepaid', 'platform'];
const INSTITUTION_KINDS: Record<Account['kind'], string[]> = {
  bank: ['bank'],
  savings: ['bank', 'pension_provider'],
  deposit: ['bank'],
  cash: [],
  brokerage: ['bank', 'broker', 'pension_provider'],
  prepaid: ['card_issuer', 'bank', 'other'],
  platform: ['other'],
};

export function AccountFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const institutions = useInstitutions();
  const [loaded, setLoaded] = useState(!id);
  const [existing, setExisting] = useState<Account | undefined>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('bank');
  const [institutionId, setInstitutionId] = useState('');
  const [context, setContext] = useState<Account['context']>('personal');
  const [opening, setOpening] = useState('');
  const [openingDate, setOpeningDate] = useState(todayIL());
  const [overdraft, setOverdraft] = useState('');
  const [overdraftRate, setOverdraftRate] = useState('');
  const [visible, setVisible] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const a = await db.accounts.get(id);
      if (!a) return navigate('/accounts', { replace: true });
      setExisting(a);
      setName(a.name);
      setKind(a.kind);
      setInstitutionId(a.institutionId ?? '');
      setContext(a.context);
      setOverdraft(agorotToInput(a.overdraftLimit));
      setOverdraftRate(bpToInput(a.overdraftRatePct));
      setVisible(a.isVisibleOnDashboard);
      const ob = await openingBalanceOf(db, id);
      if (ob) {
        setOpening(agorotToInput(ob.amount));
        setOpeningDate(ob.date);
      }
      setLoaded(true);
    })();
  }, [id, navigate]);

  const instOptions = (institutions ?? []).filter((i) => INSTITUTION_KINDS[kind].includes(i.kind));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = A.namePlaceholder;
    const openingAgorot = opening.trim() ? parseAmountToAgorot(opening) : 0;
    if (openingAgorot === null) errs.opening = he.txForm.errors.amount;
    const overdraftAgorot = overdraft.trim() ? parseAmountToAgorot(overdraft) : undefined;
    if (overdraftAgorot === null || (overdraftAgorot !== undefined && overdraftAgorot < 0)) errs.overdraft = he.txForm.errors.amount;
    const rateBp = overdraftRate.trim() ? parsePercentToBp(overdraftRate) : undefined;
    if (rateBp === null) errs.overdraftRate = he.txForm.errors.amount;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const input: AccountInput = {
      name: name.trim(),
      kind,
      context,
      institutionId: institutionId || undefined,
      overdraftLimit: kind === 'bank' ? (overdraftAgorot ?? undefined) : undefined,
      overdraftRatePct: kind === 'bank' ? (rateBp ?? undefined) : undefined,
      isVisibleOnDashboard: visible,
    };
    if (existing) {
      await updateAccount(db, existing.id, input);
      await setOpeningBalance(db, existing.id, openingAgorot ?? 0, openingDate);
      navigate(`/accounts/${existing.id}`, { replace: true });
    } else {
      const created = await createAccount(db, input, openingAgorot ?? 0, openingDate);
      navigate(`/accounts/${created.id}`, { replace: true });
    }
  }

  async function onStatus() {
    if (!existing) return;
    setActionError('');
    try {
      await setAccountStatus(db, existing.id, existing.status === 'active' ? 'closed' : 'active');
      navigate(`/accounts/${existing.id}`, { replace: true });
    } catch {
      setActionError(A.closeNotZero);
    }
  }

  async function onDelete() {
    if (!existing) return;
    setActionError('');
    try {
      await deleteAccount(db, existing.id);
      navigate('/accounts', { replace: true });
    } catch (err) {
      setActionError((err as Error).message === 'has_cards' ? A.deleteHasCards : A.deleteHasTx);
    }
  }

  if (!loaded) return <ScreenHeader title={A.edit} back />;

  return (
    <>
      <ScreenHeader title={existing ? A.edit : A.add} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={A.name} error={errors.name}>
          {(p) => <input {...p} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={A.namePlaceholder} autoFocus={!existing} />}
        </Field>

        <Field label={A.kind}>
          {(p) => (
            <select {...p} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {he.accountKind[k]}
                </option>
              ))}
            </select>
          )}
        </Field>

        {instOptions.length > 0 && (
          <Field label={A.institution}>
            {(p) => (
              <select {...p} className={inputCls} value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
                <option value="">{A.noInstitution}</option>
                {instOptions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
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

        <Field label={A.openingBalance} error={errors.opening} hint={A.openingBalanceHint}>
          {(p) => <MoneyInput {...p} value={opening} onChange={setOpening} allowNegative />}
        </Field>
        <Field label={A.openingDate}>{(p) => <input {...p} type="date" className={inputCls} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />}</Field>

        {kind === 'bank' && (
          <>
            <Field label={A.overdraftLimit} error={errors.overdraft}>
              {(p) => <MoneyInput {...p} value={overdraft} onChange={setOverdraft} />}
            </Field>
            <Field label={A.overdraftRate} error={errors.overdraftRate}>
              {(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={overdraftRate} onChange={(e) => setOverdraftRate(e.target.value)} />}
            </Field>
          </>
        )}

        <Toggle label={A.visibleOnDashboard} checked={visible} onChange={setVisible} />

        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>

        {existing && (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <button type="button" onClick={onStatus} className={secondaryBtn}>
              {existing.status === 'active' ? A.closeAccount : A.reopenAccount}
            </button>
            <button type="button" onClick={onDelete} className={dangerBtn}>
              {A.deleteAccount}
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
