import { describe, expect, it } from 'vitest';
import { formatScaled, holdings, marketValue, parseScaled, portfolio, tradeCashFlow } from '../../calc/investments';
import type { InvestmentTrade, Security } from '../../domain/schemas';

const ts = '2026-01-01T00:00:00.000Z';
let n = 0;
const trade = (p: Partial<InvestmentTrade> & Pick<InvestmentTrade, 'type' | 'grossAgorot'>): InvestmentTrade => ({
  id: crypto.randomUUID(),
  createdAt: `2026-01-01T00:00:${String(n++ % 60).padStart(2, '0')}.000Z`,
  updatedAt: ts,
  brokerageAccountId: 'b',
  securityId: 'A',
  date: '2026-02-01',
  ...p,
});
const sec = (p: Partial<Security> & Pick<Security, 'id' | 'priceUnit'>): Security => ({ createdAt: ts, updatedAt: ts, symbol: p.id, name: p.id, exchange: 'TASE', type: 'stock', ...p });

describe('decimals without floats', () => {
  it('parse and format scaled quantities', () => {
    expect(parseScaled('12.5')).toBe(12_500_000n);
    expect(parseScaled('0.0000005')).toBe(1n);
    expect(formatScaled(12_500_000n)).toBe('12.5');
    expect(formatScaled(3_000_000n)).toBe('3');
  });
  it('market value by price unit', () => {
    expect(marketValue(parseScaled('10'), 13_000, 'ILS')).toBe(130_000);
    // TASE quote 1,234.5 agorot per unit, 100 units → ₪1,234.50
    expect(marketValue(parseScaled('100'), 123_450, 'ILA')).toBe(123_450);
    // $10.50 × 2.5 units × 3.7 = ₪97.125 → ₪97.13
    expect(marketValue(parseScaled('2.5'), 1_050, 'USD', parseScaled('3.7'))).toBe(9_713);
  });
});

describe('stage 6 acceptance: portfolio value and gain match a manual calculation', () => {
  const trades = [
    trade({ type: 'buy', quantity: '10', grossAgorot: 100_000, feeAgorot: 500, date: '2026-01-10' }),
    trade({ type: 'buy', quantity: '5', grossAgorot: 60_000, feeAgorot: 500, date: '2026-02-10' }),
    trade({ type: 'sell', quantity: '6', grossAgorot: 84_000, feeAgorot: 500, date: '2026-03-10' }),
    trade({ type: 'dividend', grossAgorot: 2_000, taxWithheldAgorot: 500, date: '2026-04-10' }),
  ];

  it('moving average: cost 966, realized 191', () => {
    const h = holdings(trades, 'moving_average').get('A')!;
    // cost after buys 1,610; sold 6/15 → 644; realized 840 − 5 − 644 = 191
    expect(h.qty).toBe(parseScaled('9'));
    expect(h.cost).toBe(96_600);
    expect(h.realized).toEqual([{ date: '2026-03-10', gain: 19_100 }]);
  });

  it('FIFO: sells from the first lot', () => {
    const h = holdings(trades, 'fifo').get('A')!;
    // first lot 10 units cost 1,005: 6 units → 603; realized 835 − 603 = 232; left 402 + 605 = 1,007
    expect(h.cost).toBe(100_700);
    expect(h.realized[0]?.gain).toBe(23_200);
  });

  it('portfolio: value, unrealized, yields, weights, tax estimates', () => {
    const p = portfolio(
      [sec({ id: 'A', priceUnit: 'ILS', sectorId: 'tech' }), sec({ id: 'B', priceUnit: 'ILA', sectorId: 'fin' })],
      [...trades, trade({ securityId: 'B', type: 'buy', quantity: '100', grossAgorot: 100_000, date: '2026-01-05' })],
      [
        { securityId: 'A', date: '2026-09-01', priceAgorot: 12_000 },
        { securityId: 'A', date: '2026-09-29', priceAgorot: 13_000 },
        { securityId: 'B', date: '2026-09-29', priceAgorot: 123_450 },
      ],
      [],
      { method: 'moving_average', today: '2026-09-30', capitalGainsRateBp: 2500 },
    );
    const a = p.positions.find((x) => x.security.id === 'A')!;
    expect(a.marketValue).toBe(117_000); // 9 × 130
    expect(a.unrealized).toBe(20_400); // 1,170 − 966
    expect(a.avgPriceAgorot).toBe(10_733); // 966 / 9 = 107.33
    expect(a.dividends12m).toBe(2_000);
    expect(a.yieldBp).toBe(171); // 20 / 1,170
    expect(p.totalValue).toBe(117_000 + 123_450);
    expect(p.totalCost).toBe(96_600 + 100_000);
    expect(a.weightBp + p.positions.find((x) => x.security.id === 'B')!.weightBp).toBe(10_000);
    expect(p.sectors.map((s) => s.sectorId).sort()).toEqual(['fin', 'tech']);
    expect(p.estimatedCapitalGainsTax).toBe(4_775); // 191 × 25%
    expect(p.estimatedTaxDue).toBe(4_775 + 500 - 500); // + dividend 20 × 25% − 5 withheld
  });

  it('split changes units, not cost', () => {
    const h = holdings([...trades, trade({ type: 'split', quantity: '9', grossAgorot: 0, date: '2026-05-01' })], 'fifo').get('A')!;
    expect(h.qty).toBe(parseScaled('18'));
    expect(h.cost).toBe(100_700);
  });

  it('cash effect on the brokerage account', () => {
    expect(tradeCashFlow({ type: 'buy', grossAgorot: 100_000, feeAgorot: 500 })).toBe(-100_500);
    expect(tradeCashFlow({ type: 'sell', grossAgorot: 84_000, feeAgorot: 500, taxWithheldAgorot: 1_000 })).toBe(82_500);
    expect(tradeCashFlow({ type: 'dividend', grossAgorot: 2_000, taxWithheldAgorot: 500 })).toBe(1_500);
    expect(tradeCashFlow({ type: 'split', grossAgorot: 0 })).toBe(0);
  });
});
