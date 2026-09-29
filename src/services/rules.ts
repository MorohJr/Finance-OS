import type { FinanceDB } from '../db/db';
import { CategoryRule } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import { newSystemFields, validate } from './entity';

/** "Remember this": a contains-rule from a merchant name to a category (6.7). */
export async function createRule(db: FinanceDB, pattern: string, categoryId: string, options: { match?: 'contains' | 'equals' | 'regex'; priority?: number; context?: 'personal' | 'business' } = {}) {
  const row = validate(CategoryRule, { ...newSystemFields(), match: options.match ?? 'contains', pattern: pattern.trim(), categoryId, context: options.context, priority: options.priority ?? 0 });
  await db.categoryRules.add(row);
  return row;
}

export async function updateRule(db: FinanceDB, id: string, patch: { match: 'contains' | 'equals' | 'regex'; pattern: string; categoryId: string; priority: number; context?: 'personal' | 'business' }) {
  const current = await db.categoryRules.get(id);
  if (!current) throw new Error('not_found');
  await db.categoryRules.put(validate(CategoryRule, { ...current, ...patch, updatedAt: nowIso() }));
}

export async function deleteRule(db: FinanceDB, id: string) {
  const ts = nowIso();
  await db.categoryRules.update(id, { deletedAt: ts, updatedAt: ts });
}
