import type { Transaction, TransactionKind } from '../domain/schemas';
import { formatAgorot } from './money';

/** Transaction list filtering and grouping (SPEC 7.3 "תנועות"). Pure, no money math. */

export interface TransactionFilter {
  text?: string;
  accountId?: string;
  cardId?: string;
  categoryId?: string;
  tag?: string;
  context?: 'personal' | 'business';
  kinds?: TransactionKind[];
  from?: string;
  to?: string;
  status?: 'cleared' | 'pending';
}

/** Lowercase, strip niqqud, quotes and extra spaces, so "ש״ח" and 'ש"ח' match. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'״׳`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type FilterTx = Pick<
  Transaction,
  'date' | 'kind' | 'accountId' | 'toAccountId' | 'cardId' | 'categoryId' | 'tags' | 'context' | 'description' | 'note' | 'status' | 'deletedAt' | 'amountAgorot'
>;

/**
 * `searchText` receives extra searchable text per transaction (payee, category and account names),
 * so the filter stays pure.
 */
export function filterTransactions<T extends FilterTx>(txs: readonly T[], f: TransactionFilter, searchText?: (t: T) => string): T[] {
  const needle = f.text ? normalizeText(f.text) : '';
  return txs.filter((t) => {
    if (t.deletedAt) return false;
    if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.cardId && t.cardId !== f.cardId) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.tag && !t.tags.includes(f.tag)) return false;
    if (f.context && t.context !== f.context) return false;
    if (f.kinds?.length && !f.kinds.includes(t.kind)) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.status && t.status !== f.status) return false;
    if (needle) {
      const haystack = normalizeText([t.description, t.note, ...t.tags, searchText?.(t), formatAgorot(t.amountAgorot).replace(/[₪,]/g, '')].filter(Boolean).join(' '));
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Newest first; same day: newest created first. */
export function sortTransactions<T extends { date: string; createdAt: string }>(txs: readonly T[]): T[] {
  return [...txs].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

export function groupByDay<T extends { date: string }>(sorted: readonly T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const t of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

/** All distinct tags, sorted, for the filter picker. */
export function allTags(txs: readonly Pick<Transaction, 'tags' | 'deletedAt'>[]): string[] {
  const set = new Set<string>();
  for (const t of txs) if (!t.deletedAt) for (const tag of t.tags) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b, 'he'));
}
