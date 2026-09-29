import type { CategoryRule, Payee } from '../domain/schemas';
import { normalizeText } from './transactionFilter';

/**
 * Category suggestion (SPEC 6.7). Used for import (applied) and manual entry (suggested only).
 * Order: highest-priority matching rule, then the payee's default category.
 */

export interface CategorySuggestion {
  categoryId: string;
  payeeId?: string;
  context?: 'personal' | 'business';
  source: 'rule' | 'payee';
}

export function ruleMatches(rule: Pick<CategoryRule, 'match' | 'pattern'>, description: string): boolean {
  const text = normalizeText(description);
  const pattern = normalizeText(rule.pattern);
  switch (rule.match) {
    case 'equals':
      return text === pattern;
    case 'contains':
      return pattern.length > 0 && text.includes(pattern);
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(description);
      } catch {
        return false; // invalid user regex never matches
      }
  }
}

/** Finds a payee whose name or alias matches the description (as it appears on statements). */
export function matchPayee<P extends Pick<Payee, 'id' | 'name' | 'aliases' | 'deletedAt'>>(payees: readonly P[], description: string): P | undefined {
  const text = normalizeText(description);
  if (!text) return undefined;
  let best: P | undefined;
  let bestLen = 0;
  for (const p of payees) {
    if (p.deletedAt) continue;
    for (const name of [p.name, ...p.aliases]) {
      const n = normalizeText(name);
      if (n && (text === n || text.includes(n)) && n.length > bestLen) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best;
}

export function suggestCategory(
  description: string,
  rules: readonly Pick<CategoryRule, 'match' | 'pattern' | 'categoryId' | 'payeeId' | 'context' | 'priority' | 'deletedAt'>[],
  payees: readonly Pick<Payee, 'id' | 'name' | 'aliases' | 'defaultCategoryId' | 'deletedAt'>[],
): CategorySuggestion | undefined {
  const sorted = rules.filter((r) => !r.deletedAt).sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (ruleMatches(r, description)) {
      return { categoryId: r.categoryId, payeeId: r.payeeId, context: r.context, source: 'rule' };
    }
  }
  const payee = matchPayee(payees, description);
  if (payee?.defaultCategoryId) return { categoryId: payee.defaultCategoryId, payeeId: payee.id, source: 'payee' };
  return undefined;
}
