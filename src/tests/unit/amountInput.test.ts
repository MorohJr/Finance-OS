import { describe, expect, it } from 'vitest';
import { caretAfterFormat, formatAmountInput } from '../../ui/format';
import { parseAmountToAgorot } from '../../calc/money';

describe('amount field formatting while typing', () => {
  it.each([
    ['1234', '1,234'],
    ['1234567', '1,234,567'],
    ['12500.5', '12,500.5'],
    ['1,23,4', '1,234'],
    ['0012', '12'],
    ['.5', '0.5'],
    ['12.345', '12.34'],
    ['1.2.3', '1.23'],
    ['₪ 5000', '5,000'],
    ['', ''],
  ])('%s → %s', (raw, out) => {
    expect(formatAmountInput(raw)).toBe(out);
  });
  it('minus only when allowed; result still parses exactly', () => {
    expect(formatAmountInput('-15000', true)).toBe('-15,000');
    expect(formatAmountInput('-15000')).toBe('15,000');
    expect(parseAmountToAgorot(formatAmountInput('1234567.89'))).toBe(123_456_789);
  });
  it('caret stays after the same digit', () => {
    // typing "5" at the end of "1,234" → "12,345": caret after 5 digits = end
    expect(caretAfterFormat('12,345', 5)).toBe(6);
    // after 2 digits in "12,345" → position 2
    expect(caretAfterFormat('12,345', 2)).toBe(2);
    expect(caretAfterFormat('12,345', 3)).toBe(4);
  });
});
