import { Link } from 'react-router';
import type { Card, Institution } from '../../domain/schemas';
import type { CardStatus } from '../../calc/cards';
import { formatDisplayDate } from '../../calc/dates';
import { Money } from './Money';
import { Monogram } from './Monogram';
import { he } from '../strings.he';

/** Dashboard / list row for a credit card: next charge, date, available credit, utilization bar (SPEC 7.2 §3). */
export function CardSummary({ card, status, issuer }: { card: Card; status?: CardStatus; issuer?: Institution }) {
  const util = status?.utilizationBp ?? null;
  const pct = util === null ? 0 : Math.min(100, Math.max(0, Math.round(util / 100)));
  return (
    <Link to={`/cards/${card.id}`} className="flex flex-col gap-2 px-4 py-3 active:bg-surface-2">
      <div className="flex items-center gap-3">
        <Monogram name={issuer?.name ?? card.name} color={issuer?.color} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{card.name}</span>
          <span className="num block text-xs text-muted">·· {card.last4}</span>
        </span>
        {card.kind === 'credit' && status?.nextCharge ? (
          <span className="flex flex-col items-end">
            <Money agorot={status.nextCharge.total} className="font-medium" />
            <span className="text-xs text-muted">{he.cards.chargeOn(formatDisplayDate(status.nextCharge.chargeDate))}</span>
          </span>
        ) : (
          <span className="text-xs text-muted">{card.kind === 'debit' ? he.cards.debit : he.cards.noCharge}</span>
        )}
      </div>
      {status?.availableCredit != null && (
        <>
          <div className="h-2 rounded-full bg-surface-2" role="meter" aria-label={he.cards.utilization} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-2 rounded-full ${pct >= 80 ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">
            {he.cards.available}: <Money agorot={status.availableCredit} />
          </p>
        </>
      )}
    </Link>
  );
}
