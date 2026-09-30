import type { FinanceDB } from '../db/db';
import { Institution, type Institution as InstitutionT } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';

export type InstitutionInput = Omit<InstitutionT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveInstitution(db: FinanceDB, input: InstitutionInput, id?: string): Promise<InstitutionT> {
  const current = id ? await db.institutions.get(id) : undefined;
  const row = validate(Institution, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.institutions.put(row);
  return row;
}

export async function deleteInstitution(db: FinanceDB, id: string): Promise<void> {
  const used = (await db.accounts.filter((a) => !a.deletedAt && a.institutionId === id).count()) + (await db.cards.filter((c) => !c.deletedAt && c.issuerId === id).count());
  if (used) throw new Error('in_use');
  const ts = nowIso();
  await db.institutions.update(id, { deletedAt: ts, updatedAt: ts });
}
