import { describe, expect, it } from 'vitest';
import { currentMonthIL, daysBetween, formatDisplayDate, formatDisplayMonth, parseDisplayDate, todayIL } from '../../calc/dates';
import { isBackupDue } from '../../calc/reminders';

describe('todayIL', () => {
  it('uses Israel time, not UTC', () => {
    // 22:30 UTC on 30/09 is already 01:30 on 01/10 in Israel (IDT, UTC+3).
    expect(todayIL(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
    expect(currentMonthIL(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10');
    // Winter time (IST, UTC+2).
    expect(todayIL(new Date('2026-12-31T21:59:00Z'))).toBe('2026-12-31');
    expect(todayIL(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01');
  });
});

describe('display format', () => {
  it('YYYY-MM-DD ↔ DD/MM/YYYY', () => {
    expect(formatDisplayDate('2026-03-20')).toBe('20/03/2026');
    expect(formatDisplayMonth('2026-03')).toBe('03/2026');
    expect(parseDisplayDate('20/03/2026')).toBe('2026-03-20');
    expect(parseDisplayDate('20/03/26')).toBe('2026-03-20');
    expect(parseDisplayDate('5.4.26')).toBe('2026-04-05');
  });
  it('rejects non-existent dates', () => {
    expect(parseDisplayDate('31/02/2026')).toBeNull();
    expect(parseDisplayDate('29/02/2028')).toBe('2028-02-29');
    expect(parseDisplayDate('2026-03-20')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts calendar days across DST', () => {
    expect(daysBetween('2026-03-20', '2026-03-31')).toBe(11);
    expect(daysBetween('2026-10-20', '2026-10-30')).toBe(10);
  });
});

describe('isBackupDue', () => {
  const now = new Date('2026-09-30T09:00:00Z');
  it('no backup yet: due only with user data', () => {
    expect(isBackupDue(undefined, false, now)).toBe(false);
    expect(isBackupDue(undefined, true, now)).toBe(true);
  });
  it('due after more than 7 days', () => {
    expect(isBackupDue('2026-09-23T09:00:00Z', true, now)).toBe(false);
    expect(isBackupDue('2026-09-22T09:00:00Z', true, now)).toBe(true);
  });
});
