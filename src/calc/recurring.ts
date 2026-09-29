import type { Recurring } from '../domain/schemas';
import { addDays, addMonths, dayOfMonth } from './dates';
import { divRoundHalfUp } from './money';

/** Recurring items: next date and monthly normalization (SPEC 10.4). */

type Freq = Recurring['frequency'];

const MONTHS: Partial<Record<Freq, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };

/**
 * advance(date, frequency). Month steps keep the day of month; a short month uses its last day,
 * and the next month returns to `anchorDay`. usage_based doesn't move (the user updates it).
 */
export function advance(date: string, frequency: Freq, anchorDay?: number): string {
  switch (frequency) {
    case 'usage_based':
      return date;
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    default:
      return addMonths(date, MONTHS[frequency]!, anchorDay ?? dayOfMonth(date));
  }
}

/** All occurrences from `from` (inclusive) while ≤ `until`. */
export function occurrences(r: Pick<Recurring, 'nextDueDate' | 'frequency' | 'anchorDay'>, until: string, limit = 1000): string[] {
  if (r.frequency === 'usage_based') return r.nextDueDate <= until ? [r.nextDueDate] : [];
  const out: string[] = [];
  let d = r.nextDueDate;
  while (d <= until && out.length < limit) {
    out.push(d);
    d = advance(d, r.frequency, r.anchorDay);
  }
  return out;
}

/**
 * Monthly-normalized amount for totals: weekly × 52/12, bimonthly ÷ 2, quarterly ÷ 3,
 * semiannual ÷ 6, yearly ÷ 12. Daily × 365/12. usage_based: its last known amount, if any.
 */
export function monthlyNormalized(amountAgorot: number | undefined, frequency: Freq): number {
  const a = amountAgorot ?? 0;
  switch (frequency) {
    case 'daily':
      return divRoundHalfUp(a * 365, 12);
    case 'weekly':
      return divRoundHalfUp(a * 52, 12);
    case 'usage_based':
    case 'monthly':
      return a;
    default:
      return divRoundHalfUp(a, MONTHS[frequency]!);
  }
}

/** Items that still charge: not inactive. Trial and grace period still count. */
export function isLive(r: Pick<Recurring, 'status' | 'deletedAt'>): boolean {
  return !r.deletedAt && r.status !== 'inactive';
}

/** The transaction kind a recurring item creates. */
export function recurringTxKind(kind: Recurring['kind']): 'expense' | 'income' | 'transfer' {
  return kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense';
}

export interface Reminder {
  recurringId: string;
  kind: 'due' | 'trial_end' | 'commitment_end' | 'renewal';
  date: string;
}

/** Upcoming dates worth a reminder within `days` (reminderDaysBefore, trial, commitment, renewal). */
export function upcomingReminders(items: readonly Recurring[], today: string, days: number): Reminder[] {
  const horizon = addDays(today, days);
  const out: Reminder[] = [];
  for (const r of items) {
    if (!isLive(r)) continue;
    const lead = r.reminderDaysBefore ?? 0;
    if (lead > 0 && r.nextDueDate >= today && addDays(r.nextDueDate, -lead) <= today) out.push({ recurringId: r.id, kind: 'due', date: r.nextDueDate });
    for (const [kind, date] of [
      ['trial_end', r.status === 'trial' ? r.trialEndDate : undefined],
      ['commitment_end', r.commitmentEndDate],
      ['renewal', r.renewalDate],
    ] as const) {
      if (date && date >= today && date <= horizon) out.push({ recurringId: r.id, kind, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
