import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Category, Institution, Payee, Transaction } from '../domain/schemas';
import { balancesByAccount } from '../calc/balance';
import { USER_DATA_TABLES } from '../db/db';
import { hasUserData } from '../services/settings';

/** Live, non-deleted rows. Components re-render when the DB changes. */

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => (await db.accounts.filter((a) => !a.deletedAt).toArray()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), []);
}

export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.filter((t) => !t.deletedAt).toArray(), []);
}

/** Includes deleted categories, so history still shows names (principle 5). Filter `deletedAt` for pickers. */
export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.toArray(), []);
}

export function usePayees(): Payee[] | undefined {
  return useLiveQuery(() => db.payees.filter((p) => !p.deletedAt).toArray(), []);
}

export function useInstitutions(): Institution[] | undefined {
  return useLiveQuery(() => db.institutions.filter((i) => !i.deletedAt).toArray(), []);
}

export function byId<T extends { id: string }>(rows: readonly T[] | undefined): Map<string, T> {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

export function useBalances(accounts: Account[] | undefined, txs: Transaction[] | undefined): Map<string, number> {
  return useMemo(() => balancesByAccount((accounts ?? []).map((a) => a.id), txs ?? []), [accounts, txs]);
}

/** Category label with parent: "רכב › דלק". */
export function categoryLabel(c: Category | undefined, all: Map<string, Category>): string {
  if (!c) return '';
  const parent = c.parentId ? all.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export function useHasData(): boolean | undefined {
  return useLiveQuery(() => hasUserData(db, USER_DATA_TABLES), []);
}
