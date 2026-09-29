import { nowIso } from '../calc/dates';

/** System fields for a new entity (SPEC 4): UUID v4 and timestamps. */
export function newSystemFields(now: Date = new Date()) {
  const ts = nowIso(now);
  return { id: crypto.randomUUID(), createdAt: ts, updatedAt: ts };
}

export class ValidationError extends Error {
  constructor(
    public readonly issues: { path: string; message: string }[],
  ) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
    this.name = 'ValidationError';
  }
}

/** Parses with a Zod schema and throws a ValidationError with Hebrew messages keyed by field path. */
export function validate<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })));
  return r.data;
}

/** Drops keys whose value is undefined or '' so optional fields stay absent. */
export function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as T;
}
