import { describe, expect, it } from 'vitest';
import { divRoundHalfUp, formatAgorot, formatBp, mulBp, parseAmountToAgorot, parsePercentToBp, sumAgorot, formatBpWhole } from '../../calc/money';

describe('divRoundHalfUp', () => {
  it('rounds half up, symmetric for negatives', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(-5, 2)).toBe(-3);
    expect(divRoundHalfUp(4, 3)).toBe(1);
    expect(divRoundHalfUp(0, 7)).toBe(0);
    expect(Object.is(divRoundHalfUp(-1, 3), -0)).toBe(false);
  });
  it('rejects floats and division by zero', () => {
    expect(() => divRoundHalfUp(1.5, 2)).toThrow();
    expect(() => divRoundHalfUp(1, 0)).toThrow();
  });
});

describe('mulBp', () => {
  it('VAT 18% on ₪5,000 is ₪900 (SPEC 14.4)', () => {
    expect(mulBp(500_000, 1800)).toBe(90_000);
  });
  it('2/3 of ₪90 VAT is ₪60 (SPEC 14.6)', () => {
    expect(mulBp(9_000, 6667)).toBe(6_000);
  });
  it('rounds to the agora half-up', () => {
    expect(mulBp(1, 5000)).toBe(1); // 0.5 → 1
    expect(mulBp(1, 4999)).toBe(0);
  });
});

describe('sumAgorot', () => {
  it('sums integers and rejects floats', () => {
    expect(sumAgorot([100, -50, 25])).toBe(75);
    expect(() => sumAgorot([0.1, 0.2])).toThrow();
  });
});

describe('formatAgorot', () => {
  it('formats as ₪1,234.56', () => {
    expect(formatAgorot(123_456)).toBe('₪1,234.56');
    expect(formatAgorot(5)).toBe('₪0.05');
    expect(formatAgorot(0)).toBe('₪0.00');
    expect(formatAgorot(12_283_300)).toBe('₪122,833.00');
  });
  it('negatives use a typographic minus', () => {
    expect(formatAgorot(-123_456)).toBe('−₪1,234.56');
  });
  it('signed and hidden agorot', () => {
    expect(formatAgorot(123_456, { signed: true })).toBe('+₪1,234.56');
    expect(formatAgorot(123_450, { hideAgorot: true })).toBe('₪1,235');
    expect(formatAgorot(123_449, { hideAgorot: true })).toBe('₪1,234');
  });
});

describe('formatBp', () => {
  it('formats basis points as percent', () => {
    expect(formatBp(1800)).toBe('18%');
    expect(formatBp(6667)).toBe('66.67%');
    expect(formatBp(445)).toBe('4.45%');
    expect(formatBp(450)).toBe('4.5%');
    expect(formatBp(-50)).toBe('−0.5%');
    expect(formatBp(-1250)).toBe('−12.5%');
    expect(formatBp(0)).toBe('0%');
  });
});

describe('parseAmountToAgorot', () => {
  it.each([
    ['1,234.56', 123_456],
    ['₪1,234.5', 123_450],
    ['1234', 123_400],
    ['-12.30', -1_230],
    ['12.30-', -1_230],
    ['(12.30)', -1_230],
    ['0.05', 5],
    ['.5', 50],
    [' ₪ 98,266.40 ', 9_826_640],
    ['1,234 ש"ח', 123_400],
  ])('%s → %i', (input, expected) => {
    expect(parseAmountToAgorot(input)).toBe(expected);
  });
  it.each(['', 'abc', '1.234', '12,34', '1,2345', '--5'])('rejects %s', (input) => {
    expect(parseAmountToAgorot(input)).toBeNull();
  });
});

describe('parsePercentToBp', () => {
  it('parses percents', () => {
    expect(parsePercentToBp('18')).toBe(1800);
    expect(parsePercentToBp('66.67')).toBe(6667);
    expect(parsePercentToBp('4.45%')).toBe(445);
    expect(parsePercentToBp('4.5')).toBe(450);
    expect(parsePercentToBp('x')).toBeNull();
    expect(parsePercentToBp('1.234')).toBeNull();
  });
});

describe('formatBpWhole', () => {
  it('rounds half up to a whole percent', () => {
    expect(formatBpWhole(4749)).toBe('47%');
    expect(formatBpWhole(4750)).toBe('48%');
    expect(formatBpWhole(-1234)).toBe('−12%');
    expect(formatBpWhole(0)).toBe('0%');
  });
});
