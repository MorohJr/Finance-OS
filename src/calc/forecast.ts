import type { Card, Recurring, Transaction } from '../domain/schemas';
import { signedAmountFor } from './balance';
import { cycleForDate, type ComputedStatement } from './cards';
import { addDays } from './dates';
import { isLive, occurrences, recurringTxKind } from './recurring';
import { sumAgorot } from './money';

/**
 * Balance forecast for one account, N days ahead (SPEC 10.9):
 * today's balance + pending transactions + recurring projections − card statements charged from
 * this account − loan payments + expected salary. Loans and salary arrive as `extraEvents`
 * from their modules.
 */

export type ForecastEventKind = 'pending' | 'recurring' | 'card' | 'loan' | 'salary' | 'check';

export interface ForecastEvent {
  date: string;
  amountAgorot: number; // signed effect on the account
  kind: ForecastEventKind;
  label: string;
  refId?: string;
}

export interface ForecastInput {
  accountId: string;
  today: string;
  days: number;
  balanceToday: number;
  overdraftLimit?: number;
  pending: readonly Transaction[];
  recurring: readonly Recurring[];
  cards: readonly Card[];
  /** Unpaid statements of credit cards billed to this account. */
  statements: readonly (ComputedStatement & { cardName: string })[];
  extraEvents?: readonly ForecastEvent[];
}

export interface Forecast {
  events: ForecastEvent[];
  series: { date: string; balance: number }[];
  endBalance: number;
  minBalance: number;
  minDate: string;
  belowZero: boolean;
  belowOverdraft: boolean;
}

export function forecastEvents(i: ForecastInput): ForecastEvent[] {
  const horizon = addDays(i.today, i.days);
  const events: ForecastEvent[] = [];
  const clamp = (d: string) => (d < i.today ? i.today : d);

  for (const t of i.pending) {
    if (t.deletedAt || t.status !== 'pending' || t.date > horizon) continue;
    const amount = signedAmountFor(t, i.accountId);
    if (amount) events.push({ date: clamp(t.date), amountAgorot: amount, kind: t.links?.checkId ? 'check' : 'pending', label: t.description ?? '', refId: t.id });
  }

  const cardById = new Map(i.cards.map((c) => [c.id, c]));
  for (const r of i.recurring) {
    if (!isLive(r) || r.amountAgorot === undefined) continue;
    const kind = recurringTxKind(r.kind);
    const card = r.cardId ? cardById.get(r.cardId) : undefined;
    for (const d of occurrences(r, horizon)) {
      if (card) {
        // Charged through the card: out of the billing account on the statement's charge date.
        if (card.kind === 'credit' && card.billingAccountId === i.accountId) {
          const chargeDate = cycleForDate(clamp(d), card).chargeDate;
          if (chargeDate <= horizon) events.push({ date: chargeDate, amountAgorot: -r.amountAgorot, kind: 'recurring', label: r.name, refId: r.id });
        } else if (card.kind === 'debit' && card.billingAccountId === i.accountId) {
          events.push({ date: clamp(d), amountAgorot: -r.amountAgorot, kind: 'recurring', label: r.name, refId: r.id });
        }
        continue;
      }
      let amount = 0;
      if (r.accountId === i.accountId) amount += kind === 'income' ? r.amountAgorot : -r.amountAgorot;
      if (kind === 'transfer' && r.toAccountId === i.accountId) amount += r.amountAgorot;
      if (amount) events.push({ date: clamp(d), amountAgorot: amount, kind: 'recurring', label: r.name, refId: r.id });
    }
  }

  for (const s of i.statements) {
    if (s.chargeDate < i.today || s.chargeDate > horizon || s.total <= 0) continue;
    events.push({ date: s.chargeDate, amountAgorot: -s.total, kind: 'card', label: s.cardName, refId: s.cardId });
  }

  for (const e of i.extraEvents ?? []) if (e.date >= i.today && e.date <= horizon) events.push(e);

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function computeForecast(i: ForecastInput): Forecast {
  const events = forecastEvents(i);
  const series: { date: string; balance: number }[] = [{ date: i.today, balance: i.balanceToday }];
  let running = i.balanceToday;
  let minBalance = running;
  let minDate = i.today;
  const byDate = new Map<string, number[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e.amountAgorot]);
  for (const date of [...byDate.keys()].sort()) {
    running += sumAgorot(byDate.get(date)!);
    if (date === i.today) series[0] = { date, balance: running };
    else series.push({ date, balance: running });
    if (running < minBalance) {
      minBalance = running;
      minDate = date;
    }
  }
  const end = addDays(i.today, i.days);
  if (series[series.length - 1]!.date !== end) series.push({ date: end, balance: running });
  return {
    events,
    series,
    endBalance: running,
    minBalance,
    minDate,
    belowZero: minBalance < 0,
    // Only meaningful when the account has an overdraft limit; otherwise below zero is the alert.
    belowOverdraft: (i.overdraftLimit ?? 0) > 0 && minBalance < -(i.overdraftLimit ?? 0),
  };
}
