import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { secondaryBtn } from '../components/Form';
import { byId, usePortfolio, useSectors } from '../data';
import { formatScaled } from '../../calc/investments';
import { formatBp } from '../../calc/money';
import { he } from '../strings.he';

const SectorPie = lazy(() => import('../components/SectorPie'));
const I = he.invest;

export function InvestmentsScreen() {
  const p = usePortfolio();
  const sectors = byId(useSectors());
  if (!p) return <ScreenHeader title={I.title} back />;
  const held = p.positions.filter((x) => x.qty > 0n);
  const closed = p.positions.filter((x) => x.qty <= 0n);

  return (
    <>
      <ScreenHeader title={I.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section className="rounded-card bg-brand p-5 text-on-brand">
          <p className="text-sm text-on-brand-muted">{I.value}</p>
          <Money agorot={p.totalValue} className="text-3xl font-bold" />
          <p className="mt-1 text-sm">
            <Money agorot={p.unrealized} signed className="text-on-brand" />
            {p.unrealizedBp !== null && <span className="num text-on-brand-muted"> ({formatBp(p.unrealizedBp)})</span>}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-on-brand-muted">{I.cost}</p>
              <Money agorot={p.totalCost} className="text-sm font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{I.dividends12m}</p>
              <Money agorot={p.dividends12m} className="text-sm font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{I.realizedYtd}</p>
              <Money agorot={p.realizedThisYear} className="text-sm font-medium" />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-2">
          <Link to="/investments/trade/new" className={secondaryBtn}>
            <Icon name="plus" size={16} />
            {I.addTrade}
          </Link>
          <Link to="/investments/security/new" className={secondaryBtn}>
            {I.addSecurity}
          </Link>
          <Link to="/investments/prices" className={secondaryBtn}>
            {I.updatePrices}
          </Link>
        </div>

        {p.positions.length === 0 && <p className="text-center text-sm text-muted">{I.empty}</p>}

        {p.sectors.length > 0 && p.totalValue > 0 && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">{I.sectors}</h2>
            <Suspense fallback={<div className="h-44" />}>
              <SectorPie data={p.sectors.map((s) => ({ name: s.sectorId ? (sectors.get(s.sectorId)?.name ?? I.noSector) : I.noSector, value: s.marketValue, weightBp: s.weightBp }))} />
            </Suspense>
          </section>
        )}

        {held.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{I.positions}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {[...held, ...closed].map((x) => (
                <Link key={x.security.id} to={`/investments/security/${x.security.id}`} className={`flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-surface-2 ${x.qty > 0n ? '' : 'opacity-60'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {x.security.symbol} <span className="text-sm font-normal text-muted">{x.security.name}</span>
                    </span>
                    <span className="num block text-xs text-muted">
                      {formatScaled(x.qty)} · {formatBp(x.weightBp)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <Money agorot={x.marketValue} className="font-medium" />
                    <span className="text-xs">
                      <Money agorot={x.unrealized} tone={x.unrealized >= 0 ? 'income' : 'expense'} />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(p.estimatedCapitalGainsTax > 0 || p.estimatedTaxDue > 0) && (
          <section className="rounded-card border border-line bg-surface p-4 text-sm">
            <div className="flex justify-between">
              <span>{I.estTax}</span>
              <Money agorot={p.estimatedTaxDue} className="font-medium" />
            </div>
            <p className="mt-1 text-xs text-muted">{I.estTaxHint}</p>
          </section>
        )}
      </div>
    </>
  );
}
