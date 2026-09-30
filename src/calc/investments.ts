import type { FxRate, InvestmentTrade, PricePoint, Security } from '../domain/schemas';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/**
 * Investments (SPEC 10.10, 11.8). Quantities and FX rates are decimal strings; they are handled
 * as BigInt scaled by 10^6 so no float touches money. Rounding to the agora happens once, at the end.
 */

export const QTY_SCALE = 1_000_000n;

/** "12.5" → 12_500_000n. Up to 6 decimals (more are rounded half-up). */
export function parseScaled(s: string | undefined): bigint {
  if (!s) return 0n;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new RangeError(`not a decimal: ${s}`);
  const frac = (m[3] ?? '').padEnd(7, '0');
  let v = BigInt(m[2]!) * QTY_SCALE + BigInt(frac.slice(0, 6));
  if (Number(frac[6]) >= 5) v += 1n;
  return m[1] ? -v : v;
}

export function formatScaled(v: bigint, maxDecimals = 6): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const int = a / QTY_SCALE;
  const frac = (a % QTY_SCALE).toString().padStart(6, '0').slice(0, maxDecimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

function roundDiv(num: bigint, den: bigint): number {
  if (den < 0n) return roundDiv(-num, -den);
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (2n * a + den) / (2n * den);
  return Number(neg ? -q : q);
}

/**
 * Market value in agorot = quantity × last price.
 * priceAgorot is the quote × 100: ILS → agorot per unit; ILA (TASE quotes in agorot) → ÷ 100;
 * USD → cents × USD/ILS rate.
 */
export function marketValue(qty: bigint, priceAgorot: number, unit: Security['priceUnit'], usdIls?: bigint): number {
  let num = qty * BigInt(priceAgorot);
  let den = QTY_SCALE;
  if (unit === 'ILA') den *= 100n;
  if (unit === 'USD') {
    if (!usdIls) return 0;
    num *= usdIls;
    den *= QTY_SCALE;
  }
  return roundDiv(num, den);
}

// ---------------------------------------------------------------------------
// Holdings and cost basis (DECISION 15.4: moving average by default, FIFO optional)
// ---------------------------------------------------------------------------

export type CostMethod = 'moving_average' | 'fifo';

type TradeLike = Pick<InvestmentTrade, 'id' | 'securityId' | 'type' | 'date' | 'quantity' | 'grossAgorot' | 'feeAgorot' | 'taxWithheldAgorot' | 'deletedAt' | 'createdAt'>;

export interface Holding {
  securityId: string;
  qty: bigint;
  /** Remaining cost basis, incl. buy fees (DECISION: commissions are part of the cost). */
  cost: number;
  realized: { date: string; gain: number }[];
  dividends: { date: string; gross: number; withheld: number }[];
  feesAndTax: number;
  /** A sell for more units than held (data problem). */
  oversold: boolean;
}

interface Lot {
  qty: bigint;
  cost: number;
}

export function holdings(trades: readonly TradeLike[], method: CostMethod): Map<string, Holding> {
  const out = new Map<string, Holding>();
  const lots = new Map<string, Lot[]>();
  const sorted = trades.filter((t) => !t.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const t of sorted) {
    const h = out.get(t.securityId) ?? { securityId: t.securityId, qty: 0n, cost: 0, realized: [], dividends: [], feesAndTax: 0, oversold: false };
    const myLots = lots.get(t.securityId) ?? [];
    const q = parseScaled(t.quantity);
    const fee = t.feeAgorot ?? 0;
    switch (t.type) {
      case 'buy':
        h.qty += q;
        h.cost += t.grossAgorot + fee;
        myLots.push({ qty: q, cost: t.grossAgorot + fee });
        break;
      case 'sell': {
        const sellQty = q > h.qty ? h.qty : q;
        if (q > h.qty) h.oversold = true;
        let costOfSold = 0;
        if (method === 'fifo') {
          let left = sellQty;
          while (left > 0n && myLots.length) {
            const lot = myLots[0]!;
            if (lot.qty <= left) {
              costOfSold += lot.cost;
              left -= lot.qty;
              myLots.shift();
            } else {
              const part = roundDiv(BigInt(lot.cost) * left, lot.qty);
              costOfSold += part;
              lot.cost -= part;
              lot.qty -= left;
              left = 0n;
            }
          }
        } else {
          costOfSold = h.qty === 0n ? 0 : roundDiv(BigInt(h.cost) * sellQty, h.qty);
        }
        h.qty -= sellQty;
        h.cost -= costOfSold;
        if (h.qty === 0n) h.cost = 0;
        // Realized gain = proceeds − fee − cost of the units sold (10.10).
        h.realized.push({ date: t.date, gain: t.grossAgorot - fee - costOfSold });
        break;
      }
      case 'split': {
        // DECISION: a split trade's quantity is the change in units (+ split, − reverse split); cost unchanged.
        const before = h.qty;
        h.qty += q;
        if (method === 'fifo' && before > 0n) {
          let assigned = 0n;
          myLots.forEach((lot, i) => {
            const nq = i === myLots.length - 1 ? h.qty - assigned : (lot.qty * h.qty) / before;
            assigned += nq;
            lot.qty = nq;
          });
        }
        break;
      }
      case 'dividend':
        h.dividends.push({ date: t.date, gross: t.grossAgorot, withheld: t.taxWithheldAgorot ?? 0 });
        break;
      case 'fee':
      case 'tax':
        h.feesAndTax += t.grossAgorot;
        break;
    }
    out.set(t.securityId, h);
    lots.set(t.securityId, myLots);
  }
  return out;
}

/** Signed cash effect of a trade on the brokerage account (6.14). split: none. */
export function tradeCashFlow(t: Pick<InvestmentTrade, 'type' | 'grossAgorot' | 'feeAgorot' | 'taxWithheldAgorot'>): number {
  const fee = t.feeAgorot ?? 0;
  const tax = t.taxWithheldAgorot ?? 0;
  switch (t.type) {
    case 'buy':
      return -(t.grossAgorot + fee);
    case 'sell':
      return t.grossAgorot - fee - tax;
    case 'dividend':
      return t.grossAgorot - tax;
    case 'fee':
    case 'tax':
      return -t.grossAgorot;
    case 'split':
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Portfolio (10.10)
// ---------------------------------------------------------------------------

export function latestPrice(points: readonly Pick<PricePoint, 'securityId' | 'date' | 'priceAgorot' | 'deletedAt'>[], securityId: string, asOf?: string) {
  let best: (typeof points)[number] | undefined;
  for (const p of points) {
    if (p.deletedAt || p.securityId !== securityId || (asOf && p.date > asOf)) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best;
}

export function latestFx(rates: readonly Pick<FxRate, 'date' | 'usdIls' | 'deletedAt'>[], asOf?: string): bigint | undefined {
  let best: (typeof rates)[number] | undefined;
  for (const r of rates) if (!r.deletedAt && (!asOf || r.date <= asOf) && (!best || r.date > best.date)) best = r;
  return best ? parseScaled(best.usdIls) : undefined;
}

export interface PositionView {
  security: Security;
  qty: bigint;
  cost: number;
  avgPriceAgorot: number | null;
  price?: { date: string; priceAgorot: number };
  marketValue: number;
  unrealized: number;
  unrealizedBp: number | null;
  dividends12m: number;
  yieldBp: number | null;
  yieldOnCostBp: number | null;
  weightBp: number;
  realizedThisYear: number;
}

export interface SectorView {
  sectorId: string | undefined;
  cost: number;
  marketValue: number;
  weightBp: number;
  returnBp: number | null;
  dividends12m: number;
}

export interface Portfolio {
  positions: PositionView[];
  sectors: SectorView[];
  totalCost: number;
  totalValue: number;
  unrealized: number;
  unrealizedBp: number | null;
  dividends12m: number;
  realizedThisYear: number;
  /** 10.10: max(0, realized gains − realized losses this year) × capital gains rate. Estimate only. */
  estimatedCapitalGainsTax: number;
  /** 11.8: (realized + dividends) × rate − tax withheld. Estimate only. */
  estimatedTaxDue: number;
}

export function portfolio(
  securities: readonly Security[],
  trades: readonly TradeLike[],
  prices: readonly Pick<PricePoint, 'securityId' | 'date' | 'priceAgorot' | 'deletedAt'>[],
  fx: readonly Pick<FxRate, 'date' | 'usdIls' | 'deletedAt'>[],
  options: { method: CostMethod; today: string; capitalGainsRateBp: number; asOf?: string },
): Portfolio {
  const asOf = options.asOf ?? options.today;
  const h = holdings(
    trades.filter((t) => t.date <= asOf),
    options.method,
  );
  const usd = latestFx(fx, asOf);
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  const oneYearAgo = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;

  const raw = securities
    .filter((s) => !s.deletedAt && h.has(s.id))
    .map((security) => {
      const x = h.get(security.id)!;
      const p = latestPrice(prices, security.id, asOf);
      const mv = p ? marketValue(x.qty, p.priceAgorot, security.priceUnit, usd) : 0;
      const dividends12m = sumAgorot(x.dividends.filter((d) => d.date > oneYearAgo && d.date <= asOf).map((d) => d.gross));
      return {
        security,
        qty: x.qty,
        cost: x.cost,
        avgPriceAgorot: x.qty > 0n ? roundDiv(BigInt(x.cost) * QTY_SCALE, x.qty) : null,
        price: p ? { date: p.date, priceAgorot: p.priceAgorot } : undefined,
        marketValue: mv,
        unrealized: x.qty > 0n ? mv - x.cost : 0,
        unrealizedBp: x.cost > 0 ? divRoundHalfUp((mv - x.cost) * BP_SCALE, x.cost) : null,
        dividends12m,
        yieldBp: mv > 0 ? divRoundHalfUp(dividends12m * BP_SCALE, mv) : null,
        yieldOnCostBp: x.cost > 0 ? divRoundHalfUp(dividends12m * BP_SCALE, x.cost) : null,
        realizedThisYear: sumAgorot(x.realized.filter((r) => r.date >= yearStart && r.date <= asOf).map((r) => r.gain)),
        withheldThisYear: sumAgorot(x.dividends.filter((d) => d.date >= yearStart && d.date <= asOf).map((d) => d.withheld)),
        dividendsThisYear: sumAgorot(x.dividends.filter((d) => d.date >= yearStart && d.date <= asOf).map((d) => d.gross)),
        gains: sumAgorot(x.realized.filter((r) => r.date >= yearStart && r.gain > 0).map((r) => r.gain)),
        losses: sumAgorot(x.realized.filter((r) => r.date >= yearStart && r.gain < 0).map((r) => -r.gain)),
      };
    });
  const totalValue = sumAgorot(raw.map((r) => r.marketValue));
  const positions: PositionView[] = raw.map((r) => ({
    security: r.security,
    qty: r.qty,
    cost: r.cost,
    avgPriceAgorot: r.avgPriceAgorot,
    price: r.price,
    marketValue: r.marketValue,
    unrealized: r.unrealized,
    unrealizedBp: r.unrealizedBp,
    dividends12m: r.dividends12m,
    yieldBp: r.yieldBp,
    yieldOnCostBp: r.yieldOnCostBp,
    weightBp: totalValue > 0 ? divRoundHalfUp(r.marketValue * BP_SCALE, totalValue) : 0,
    realizedThisYear: r.realizedThisYear,
  }));

  const bySector = new Map<string | undefined, PositionView[]>();
  for (const p of positions.filter((x) => x.qty > 0n)) bySector.set(p.security.sectorId, [...(bySector.get(p.security.sectorId) ?? []), p]);
  const sectors: SectorView[] = [...bySector.entries()].map(([sectorId, ps]) => {
    const cost = sumAgorot(ps.map((p) => p.cost));
    const mv = sumAgorot(ps.map((p) => p.marketValue));
    return {
      sectorId,
      cost,
      marketValue: mv,
      weightBp: totalValue > 0 ? divRoundHalfUp(mv * BP_SCALE, totalValue) : 0,
      returnBp: cost > 0 ? divRoundHalfUp((mv - cost) * BP_SCALE, cost) : null,
      dividends12m: sumAgorot(ps.map((p) => p.dividends12m)),
    };
  });

  const totalCost = sumAgorot(positions.filter((p) => p.qty > 0n).map((p) => p.cost));
  const realizedThisYear = sumAgorot(raw.map((r) => r.realizedThisYear));
  const netRealized = sumAgorot(raw.map((r) => r.gains)) - sumAgorot(raw.map((r) => r.losses));
  const rate = options.capitalGainsRateBp;
  const dividendsThisYear = sumAgorot(raw.map((r) => r.dividendsThisYear));
  const withheld = sumAgorot(raw.map((r) => r.withheldThisYear));
  return {
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    sectors: sectors.sort((a, b) => b.marketValue - a.marketValue),
    totalCost,
    totalValue,
    unrealized: totalValue - totalCost,
    unrealizedBp: totalCost > 0 ? divRoundHalfUp((totalValue - totalCost) * BP_SCALE, totalCost) : null,
    dividends12m: sumAgorot(positions.map((p) => p.dividends12m)),
    realizedThisYear,
    estimatedCapitalGainsTax: divRoundHalfUp(Math.max(0, netRealized) * rate, BP_SCALE),
    estimatedTaxDue: Math.max(0, divRoundHalfUp((Math.max(0, netRealized) + dividendsThisYear) * rate, BP_SCALE) - withheld),
  };
}
