import type { BudgetState } from '../../calc/budget';

/** Budget/utilization bar. Width is presentation only; the state comes from calc. */
export function ProgressBar({ usedBp, state, label }: { usedBp: number | null; state: BudgetState; label: string }) {
  const pct = usedBp === null ? (state === 'over' ? 100 : 0) : Math.min(100, Math.max(0, Math.round(usedBp / 100)));
  const color = state === 'over' ? 'bg-expense' : state === 'near' ? 'bg-warning' : 'bg-brand';
  return (
    <div className="h-2 rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
