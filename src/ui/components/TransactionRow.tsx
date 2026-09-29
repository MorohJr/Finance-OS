import { Link } from 'react-router';
import type { Account, Card, Category, Payee, Transaction } from '../../domain/schemas';
import { Money } from './Money';
import { Icon, type IconName } from './Icon';
import { displayAmount } from '../format';
import { categoryLabel } from '../data';
import { he } from '../strings.he';

const KIND_ICON: Partial<Record<Transaction['kind'], IconName>> = {
  income: 'download',
  expense: 'upload',
  refund: 'download',
  transfer: 'repeat',
  opening_balance: 'wallet',
  adjustment: 'edit',
  card_payment: 'card',
};

interface Props {
  t: Transaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  payees: Map<string, Payee>;
  cards?: Map<string, Card>;
  /** Show the amount as its effect on this account. */
  accountId?: string;
}

export function transactionTitle(t: Transaction, payees: Map<string, Payee>, categories: Map<string, Category>): string {
  return (t.payeeId && payees.get(t.payeeId)?.name) || t.description || categoryLabel(t.categoryId ? categories.get(t.categoryId) : undefined, categories) || he.kind[t.kind];
}

export function TransactionRow({ t, accounts, categories, payees, cards, accountId }: Props) {
  const { agorot, tone } = displayAmount(t, accountId);
  const category = t.categoryId ? categories.get(t.categoryId) : undefined;
  const title = transactionTitle(t, payees, categories);
  const accountName = t.kind === 'transfer' ? `${accounts.get(t.accountId ?? '')?.name ?? ''} ← ${accounts.get(t.toAccountId ?? '')?.name ?? ''}` : t.cardId ? (cards?.get(t.cardId)?.name ?? '') : accounts.get(t.accountId ?? '')?.name;
  const sub = [t.kind === 'expense' || t.kind === 'income' ? categoryLabel(category, categories) || he.home.uncategorized : he.kind[t.kind], accountName]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link to={`/transactions/${t.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
        <Icon name={KIND_ICON[t.kind] ?? 'list'} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Money agorot={agorot} tone={tone} className="font-medium" />
        {t.status === 'pending' && <span className="text-[11px] text-warning">{he.transactions.pending}</span>}
      </span>
    </Link>
  );
}
