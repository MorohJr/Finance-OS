import { describe, expect, it } from 'vitest';
import { allTags, filterTransactions, groupByDay, normalizeText, sortTransactions } from '../../calc/transactionFilter';
import { ruleMatches, suggestCategory } from '../../calc/categoryRules';
import { tx } from './fixtures';

describe('transaction filter', () => {
  const txs = [
    tx({ kind: 'expense', amountAgorot: 34_290, accountId: 'a', description: 'שופרסל דיל', tags: ['בית'], date: '2026-09-10' }),
    tx({ kind: 'transfer', amountAgorot: 100_000, accountId: 'a', toAccountId: 'b', date: '2026-09-11' }),
    tx({ kind: 'income', amountAgorot: 1_425_000, accountId: 'b', context: 'business', date: '2026-09-12' }),
  ];

  it('text search covers description, tags, amount and extra text', () => {
    expect(filterTransactions(txs, { text: 'שופרסל' })).toHaveLength(1);
    expect(filterTransactions(txs, { text: '342.90' })).toHaveLength(1);
    expect(filterTransactions(txs, { text: 'מעסיק' }, (t) => (t.kind === 'income' ? 'מעסיק בע"מ' : ''))).toHaveLength(1);
  });

  it('account filter includes transfers into the account', () => {
    expect(filterTransactions(txs, { accountId: 'b' })).toHaveLength(2);
  });

  it('context, tag, range', () => {
    expect(filterTransactions(txs, { context: 'business' })).toHaveLength(1);
    expect(filterTransactions(txs, { tag: 'בית' })).toHaveLength(1);
    expect(filterTransactions(txs, { from: '2026-09-11', to: '2026-09-11' })).toHaveLength(1);
  });

  it('sort and group by day', () => {
    const groups = groupByDay(sortTransactions(txs));
    expect(groups.map((g) => g.date)).toEqual(['2026-09-12', '2026-09-11', '2026-09-10']);
    expect(allTags(txs)).toEqual(['בית']);
  });

  it('normalizes Hebrew quotes', () => {
    expect(normalizeText('ש״ח')).toBe(normalizeText('ש"ח'));
  });
});

describe('category rules (6.7)', () => {
  const rules = [
    { match: 'contains' as const, pattern: 'שופרסל', categoryId: 'food', priority: 1 },
    { match: 'regex' as const, pattern: '^PAZ|פז', categoryId: 'fuel', priority: 5 },
    { match: 'equals' as const, pattern: 'netflix', categoryId: 'subs', priority: 1 },
  ];
  it('matches by type and priority', () => {
    expect(suggestCategory('שופרסל דיל רמת גן', rules, [])?.categoryId).toBe('food');
    expect(suggestCategory('פז אקספרס', rules, [])?.categoryId).toBe('fuel');
    expect(suggestCategory('NETFLIX', rules, [])?.categoryId).toBe('subs');
    expect(suggestCategory('netflix.com', rules, [])).toBeUndefined();
  });
  it('invalid regex never matches', () => {
    expect(ruleMatches({ match: 'regex', pattern: '(' }, 'x')).toBe(false);
  });
  it('falls back to the payee default category via aliases', () => {
    const payees = [{ id: 'p1', name: 'רמי לוי', aliases: ['RAMI LEVI'], defaultCategoryId: 'food' }];
    expect(suggestCategory('RAMI LEVI SHIVUK', [], payees)).toEqual({ categoryId: 'food', payeeId: 'p1', source: 'payee' });
  });
});
