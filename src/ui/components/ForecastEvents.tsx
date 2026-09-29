import type { ForecastEvent } from '../../calc/forecast';
import { formatDisplayDate } from '../../calc/dates';
import { Money } from './Money';
import { he } from '../strings.he';

export function ForecastEvents({ events, limit }: { events: ForecastEvent[]; limit?: number }) {
  if (!events.length) return <p className="text-sm text-muted">{he.forecast.noEvents}</p>;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {events.slice(0, limit).map((e, i) => (
        <div key={`${e.refId}-${e.date}-${i}`} className="flex min-h-12 items-center gap-3 px-4 py-2">
          <span className="num w-20 shrink-0 text-xs text-muted">{formatDisplayDate(e.date)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{e.label || he.forecast.kinds[e.kind]}</span>
            <span className="block text-xs text-muted">{he.forecast.kinds[e.kind]}</span>
          </span>
          <Money agorot={e.amountAgorot} tone={e.amountAgorot >= 0 ? 'income' : 'expense'} className="text-sm" />
        </div>
      ))}
    </div>
  );
}
