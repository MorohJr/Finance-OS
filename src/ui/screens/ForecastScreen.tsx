import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Form';
import { ForecastEvents } from '../components/ForecastEvents';
import { useAccounts, useForecast } from '../data';
import { useSettings } from '../hooks';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { he } from '../strings.he';

const BalanceChart = lazy(() => import('../components/BalanceChart'));
const F = he.forecast;

export function ForecastScreen() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const banks = (useAccounts() ?? []).filter((a) => a.status === 'active' && (a.kind === 'bank' || a.kind === 'cash' || a.kind === 'savings'));
  const accountId = params.get('account') ?? banks[0]?.id;
  const days = Number(params.get('days') ?? settings?.forecastDays ?? 60);
  const today = todayIL();
  const forecast = useForecast(accountId, today, days);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <ScreenHeader title={F.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        {banks.length === 0 ? (
          <p className="text-center text-sm text-muted">{F.noBank}</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{F.account}</span>
              <select className="min-h-11 rounded-xl border border-line bg-surface-2 px-3" value={accountId} onChange={(e) => set('account', e.target.value)}>
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <Segmented
              label={F.title}
              value={String(days)}
              onChange={(v) => set('days', v)}
              options={[30, 60, 90].map((n) => ({ value: String(n), label: F.days(n) }))}
            />
            {forecast && (
              <>
                <section className="grid grid-cols-3 gap-2 rounded-card bg-brand p-4 text-on-brand">
                  <div>
                    <p className="text-xs text-on-brand-muted">{F.today}</p>
                    <Money agorot={forecast.series[0]!.balance} className="font-bold" />
                  </div>
                  <div>
                    <p className="text-xs text-on-brand-muted">{F.lowest}</p>
                    <Money agorot={forecast.minBalance} className="font-bold" />
                    <p className="num text-[11px] text-on-brand-muted">{formatDisplayDate(forecast.minDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-brand-muted">{F.end}</p>
                    <Money agorot={forecast.endBalance} className="font-bold" />
                  </div>
                </section>
                {(forecast.belowZero || forecast.belowOverdraft) && (
                  <div role="alert" className="flex gap-3 rounded-card bg-warning-soft p-4 text-sm">
                    <Icon name="alert" className="shrink-0 text-warning" />
                    <p>{forecast.belowOverdraft ? F.belowOverdraft(formatDisplayDate(forecast.minDate)) : F.belowZero(formatDisplayDate(forecast.minDate))}</p>
                  </div>
                )}
                <section className="rounded-card border border-line bg-surface p-4">
                  <Suspense fallback={<div className="h-44" />}>
                    <BalanceChart points={forecast.series} />
                  </Suspense>
                </section>
                <h2 className="px-1 text-sm font-medium text-muted">{F.events}</h2>
                <ForecastEvents events={forecast.events} />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
