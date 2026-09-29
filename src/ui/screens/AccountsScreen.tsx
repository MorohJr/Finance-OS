import { Link } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionTitle } from '../components/Card';
import { Money } from '../components/Money';
import { Monogram } from '../components/Monogram';
import { Icon } from '../components/Icon';
import { byId, useAccounts, useBalances, useCards, useCardsData, useInstitutions, useTransactions } from '../data';
import { CardSummary } from '../components/CardSummary';
import { todayIL } from '../../calc/dates';
import type { Account } from '../../domain/schemas';
import { sumAgorot } from '../../calc/money';
import { he } from '../strings.he';

const GROUPS: { key: keyof typeof he.accountGroups; kinds: Account['kind'][] }[] = [
  { key: 'bank', kinds: ['bank'] },
  { key: 'savings', kinds: ['savings', 'deposit'] },
  { key: 'cash', kinds: ['cash'] },
  { key: 'brokerage', kinds: ['brokerage'] },
  { key: 'other', kinds: ['prepaid', 'platform'] },
];

function AccountRow({ a, balance, color, institution }: { a: Account; balance: number; color?: string; institution?: string }) {
  return (
    <Link to={`/accounts/${a.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
      <Monogram name={institution ?? a.name} color={a.color ?? color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block truncate text-xs text-muted">
          {[he.accountKind[a.kind], institution, a.context === 'business' ? he.context.business : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Money agorot={balance} tone={balance < 0 ? 'expense' : 'plain'} className="font-medium" />
    </Link>
  );
}

export function AccountsScreen() {
  const accounts = useAccounts();
  const txs = useTransactions();
  const balances = useBalances(accounts, txs);
  const institutions = byId(useInstitutions());
  const cards = useCards();
  const cardsData = useCardsData(todayIL());
  const statusByCard = new Map((cardsData ?? []).map((c) => [c.data.card.id, c.status]));
  if (!accounts) return <ScreenHeader title={he.accounts.title} back />;

  const active = accounts.filter((a) => a.status === 'active');
  const closed = accounts.filter((a) => a.status === 'closed');
  const total = sumAgorot(active.map((a) => balances.get(a.id) ?? 0));

  const row = (a: Account) => {
    const inst = a.institutionId ? institutions.get(a.institutionId) : undefined;
    return <AccountRow key={a.id} a={a} balance={balances.get(a.id) ?? 0} color={inst?.color} institution={inst?.name} />;
  };

  return (
    <>
      <ScreenHeader title={he.accounts.title} back />
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div className="flex items-end justify-between rounded-card bg-brand p-5 text-on-brand">
          <div>
            <p className="text-sm text-on-brand-muted">{he.accounts.total}</p>
            <Money agorot={total} className="text-3xl font-bold" />
          </div>
          <Link to="/accounts/new" className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/15 px-4 text-sm font-medium">
            <Icon name="plus" size={18} />
            {he.accounts.add}
          </Link>
        </div>

        {active.length === 0 && <p className="text-center text-sm text-muted">{he.accounts.empty}</p>}

        {GROUPS.map((g) => {
          const items = active.filter((a) => g.kinds.includes(a.kind));
          if (!items.length) return null;
          const subtotal = sumAgorot(items.map((a) => balances.get(a.id) ?? 0));
          return (
            <section key={g.key}>
              <div className="flex items-baseline justify-between px-1">
                <SectionTitle>{he.accountGroups[g.key]}</SectionTitle>
                <Money agorot={subtotal} className="text-sm text-muted" />
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{items.map(row)}</div>
            </section>
          );
        })}

        <section>
          <div className="flex items-center justify-between px-1">
            <SectionTitle>{he.cards.title}</SectionTitle>
            <Link to="/cards/new" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-text">
              <Icon name="plus" size={16} />
              {he.cards.add}
            </Link>
          </div>
          {(cards ?? []).filter((c) => c.status === 'active').length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(cards ?? [])
                .filter((c) => c.status === 'active')
                .map((c) => (
                  <CardSummary key={c.id} card={c} status={statusByCard.get(c.id)} issuer={institutions.get(c.issuerId)} />
                ))}
            </div>
          )}
        </section>

        {closed.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-sm font-medium text-muted">
              <Icon name="chevron" size={16} className="transition-transform group-open:-rotate-90" />
              {he.accounts.closed} ({closed.length})
            </summary>
            <div className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface opacity-70">{closed.map(row)}</div>
          </details>
        )}
      </div>
    </>
  );
}
