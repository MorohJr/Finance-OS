import type { FinanceDB } from '../db/db';
import { Category, type Category as CategoryT } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';

export type CategoryInput = Omit<CategoryT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** SPEC 6.6: sub-categories are one level deep, same type as the parent. */
async function checkParent(db: FinanceDB, input: CategoryInput, selfId?: string): Promise<void> {
  if (!input.parentId) return;
  if (input.parentId === selfId) throw new Error('parent_self');
  const parent = await db.categories.get(input.parentId);
  if (!parent || parent.deletedAt) throw new Error('parent_not_found');
  if (parent.parentId) throw new Error('parent_too_deep');
  if (parent.type !== input.type) throw new Error('parent_type');
  if (selfId && (await db.categories.where('parentId').equals(selfId).filter((c) => !c.deletedAt).count())) {
    throw new Error('has_children');
  }
}

export async function createCategory(db: FinanceDB, input: CategoryInput): Promise<CategoryT> {
  await checkParent(db, input);
  const row = validate(Category, compact({ ...newSystemFields(), ...compact(input) }));
  await db.categories.add(row);
  return row;
}

export async function updateCategory(db: FinanceDB, id: string, input: CategoryInput): Promise<CategoryT> {
  const current = await db.categories.get(id);
  if (!current) throw new Error('not_found');
  await checkParent(db, input, id);
  const row = validate(Category, compact({ id, createdAt: current.createdAt, updatedAt: nowIso(), ...compact(input) }));
  await db.categories.put(row);
  return row;
}

/**
 * Soft delete. Transactions keep their categoryId; the category is shown by name in history
 * and they are not lost from totals (SPEC principle 5). Sub-categories move up to top level.
 */
export async function deleteCategory(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', db.categories, async () => {
    await db.categories.where('parentId').equals(id).modify((c) => {
      delete c.parentId;
      c.updatedAt = ts;
    });
    await db.categories.update(id, { deletedAt: ts, updatedAt: ts });
  });
}
