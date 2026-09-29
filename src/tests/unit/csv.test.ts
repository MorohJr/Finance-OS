import { describe, expect, it } from 'vitest';
import { agorotToDecimal, csvCell, transactionsToCsv } from '../../services/csv';
import { tx } from './fixtures';

describe('CSV export', () => {
  it('agorot to decimal without floats', () => {
    expect(agorotToDecimal(123_456)).toBe('1234.56');
    expect(agorotToDecimal(5)).toBe('0.05');
    expect(agorotToDecimal(-1_230)).toBe('-12.30');
  });
  it('escapes quotes and neutralizes formulas', () => {
    expect(csvCell('בע"מ, סניף')).toBe('"בע""מ, סניף"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
  it('builds rows sorted by date with BOM', () => {
    const csv = transactionsToCsv(
      [tx({ kind: 'expense', amountAgorot: 34_290, accountId: 'a', date: '2026-09-10', description: 'סופר' }), tx({ kind: 'income', amountAgorot: 100, accountId: 'a', date: '2026-09-01' })],
      {
        accountName: (id) => (id === 'a' ? 'עו"ש' : ''),
        cardName: () => '',
        categoryName: () => '',
        payeeName: () => '',
        kindLabel: (k) => k,
        contextLabel: (c) => c,
        statusLabel: (s) => s,
        headers: ['d', 'k', 'amt', 'acc', 'card', 'to', 'cat', 'payee', 'desc', 'note', 'tags', 'ctx', 'status', 'vat', 'net'],
      },
    );
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('01/09/2026,income,1.00');
    expect(lines[2]).toContain('10/09/2026,expense,342.90,"עו""ש"');
  });
});
