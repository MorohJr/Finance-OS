import { describe, expect, it } from 'vitest';
import { incomeVat } from '../../calc/business/vat';
import { setAside, setAsideWithRatio } from '../../calc/business/reserve';
import { businessExpense, recognizedExpensesYtd } from '../../calc/business/expenses';
import { vatPeriodOf, vatReport } from '../../calc/business/periods';
import { paturStatus, pensionObligation, pensionObligationMonthly } from '../../calc/business/obligations';

const VAT = 1800;
const ils = (x: number) => Math.round(x * 100);

describe('golden 14.4: income calculator (licensed, VAT 18%)', () => {
  it('₪5,000 excl. VAT → VAT ₪900, total ₪5,900', () => {
    expect(incomeVat(ils(5000), 'excl_vat', 'licensed', VAT)).toEqual({ net: ils(5000), vat: ils(900), total: ils(5900) });
  });
  it('₪5,900 incl. VAT → net ₪5,000, VAT ₪900', () => {
    expect(incomeVat(ils(5900), 'incl_vat', 'licensed', VAT)).toEqual({ net: ils(5000), vat: ils(900), total: ils(5900) });
  });
  it('exempt dealer, ₪5,000 → VAT ₪0, total ₪5,000', () => {
    expect(incomeVat(ils(5000), 'excl_vat', 'exempt', VAT)).toEqual({ net: ils(5000), vat: 0, total: ils(5000) });
    expect(incomeVat(ils(5000), 'incl_vat', 'exempt', VAT)).toEqual({ net: ils(5000), vat: 0, total: ils(5000) });
  });
});

describe('golden 14.5: set aside (income tax 20%, NI 16%)', () => {
  const v = incomeVat(ils(5000), 'excl_vat', 'licensed', VAT);
  it('net_income: tax ₪1,000, NI ₪800, VAT ₪900 → ₪2,700 aside, ₪3,200 left of ₪5,900', () => {
    expect(setAside(v, { incomeTaxRateBp: 2000, nationalInsuranceRateBp: 1600, reserveBasis: 'net_income' })).toMatchObject({
      base: ils(5000),
      incomeTaxReserve: ils(1000),
      niReserve: ils(800),
      vatReserve: ils(900),
      setAside: ils(2700),
      leftForYou: ils(3200),
    });
  });
  it('profit_ratio 0.8: base ₪4,000, tax ₪800, NI ₪640 → ₪2,340 aside, ₪3,560 left', () => {
    const expected = { base: ils(4000), incomeTaxReserve: ils(800), niReserve: ils(640), setAside: ils(2340), leftForYou: ils(3560) };
    const rates = { incomeTaxRateBp: 2000, nationalInsuranceRateBp: 1600, reserveBasis: 'profit_ratio' as const };
    expect(setAsideWithRatio(v, rates, 8000)).toMatchObject(expected);
    expect(setAside(v, rates, { profit: ils(80_000), revenue: ils(100_000) })).toMatchObject({ ...expected, profitRatioBp: 8000 });
    // no revenue yet → ratio 1
    expect(setAside(v, rates).base).toBe(ils(5000));
  });
});

describe('golden 14.6: VAT for a period', () => {
  const fuel = { incomeTaxRecognizedPct: 4500, vatRecognizedPct: 6667 };
  const computer = { incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 };
  it('fuel ₪590 (VAT ₪90, 2/3 → ₪60); computer ₪5,900 (VAT ₪900) → due ₪1,740', () => {
    const e1 = businessExpense(ils(590), ils(90), fuel, 'licensed');
    const e2 = businessExpense(ils(5900), ils(900), computer, 'licensed');
    expect(e1.vatDeductible).toBe(ils(60));
    expect(e2.vatDeductible).toBe(ils(900));
    const period = vatPeriodOf('2026-09-15', 'bimonthly', 15);
    const r = vatReport(
      period,
      [
        { date: '2026-09-02', vat: ils(900) },
        { date: '2026-10-20', vat: ils(1800) },
      ],
      [
        { date: '2026-09-10', vatDeductible: e1.vatDeductible },
        { date: '2026-10-01', vatDeductible: e2.vatDeductible },
      ],
    );
    expect(r).toMatchObject({ outputVat: ils(2700), inputVat: ils(960), vatDue: ils(1740), from: '2026-09-01', to: '2026-10-31', dueDate: '2026-11-15' });
  });
  it('recognized expense and exempt dealer', () => {
    expect(businessExpense(ils(590), ils(90), fuel, 'licensed').recognizedExpense).toBe(ils(238.5));
    expect(businessExpense(ils(590), ils(90), fuel, 'exempt')).toMatchObject({ vatDeductible: 0, recognizedExpense: ils(265.5) });
    expect(recognizedExpensesYtd([], ils(100_000), true)).toBe(ils(30_000));
  });
  it('periods: monthly and bimonthly', () => {
    expect(vatPeriodOf('2026-01-31', 'bimonthly', 15)).toMatchObject({ key: '2026-01', to: '2026-02-28', dueDate: '2026-03-15' });
    expect(vatPeriodOf('2026-12-05', 'monthly', 15)).toMatchObject({ key: '2026-12', to: '2026-12-31', dueDate: '2027-01-15' });
  });
});

describe('golden 14.7: exempt ceiling', () => {
  it('₪98,266.40 of ₪122,833 is 80% → first alert', () => {
    const s = paturStatus([9_826_640], 12_283_300, 12);
    expect(s.pctOfCeilingBp).toBe(8000);
    expect(s.alerts).toContain('near');
  });
  it('₪60,000 after 4 months → projected ₪180,000 → projection alert', () => {
    const s = paturStatus([6_000_000], 12_283_300, 4);
    expect(s.projected).toBe(18_000_000);
    expect(s.alerts).toEqual(['projected_over']);
  });
  it('over the ceiling', () => {
    expect(paturStatus([12_283_300], 12_283_300, 10).alerts).toEqual(['over']);
  });
});

describe('golden 14.8: mandatory pension (avg wage ₪13,769)', () => {
  it('profit ₪8,000 a month → ₪446.36', () => {
    expect(pensionObligationMonthly(ils(8000), 1, ils(13_769), 445, 1255)).toBe(44_636);
  });
  it('profit ₪20,000 → ₪1,170.37 (the maximum)', () => {
    expect(pensionObligationMonthly(ils(20_000), 1, ils(13_769), 445, 1255)).toBe(117_037);
    expect(pensionObligationMonthly(ils(50_000), 1, ils(13_769), 445, 1255)).toBe(117_037);
  });
  it('year to date: profit over months, loss means no obligation', () => {
    const o = pensionObligation(ils(72_000), 9, ils(13_769), 445, 1255, ils(3_000));
    expect(o.profitMonthly).toBe(ils(8000));
    expect(o.monthly).toBe(44_636);
    expect(o.ytdObligation).toBe(44_636 * 9);
    expect(o.gap).toBe(44_636 * 9 - ils(3_000));
    expect(pensionObligation(-ils(1_000), 3, ils(13_769), 445, 1255, 0).monthly).toBe(0);
  });
});
