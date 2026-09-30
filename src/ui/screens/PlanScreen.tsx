import { ScreenHeader } from '../components/ScreenHeader';
import { ListGroup, ListRow } from '../components/ListRow';
import { Money } from '../components/Money';
import { ProgressBar } from '../components/ProgressBar';
import { useBudget } from '../data';
import { budgetState } from '../../calc/budget';
import { currentMonthIL } from '../../calc/dates';
import { he } from '../strings.he';

export function PlanScreen() {
  const budget = useBudget(currentMonthIL());
  const total = budget && budget.totalBudget > 0 ? budgetState(budget.totalSpent, budget.totalBudget) : undefined;
  return (
    <>
      <ScreenHeader title={he.plan.title} />
      <div className="flex flex-col gap-4 px-4">
        {budget && total && (
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">{he.budget.total}</span>
              <span className="text-sm">
                <Money agorot={budget.totalSpent} className="font-medium" /> <span className="text-muted">{he.budget.of('')}</span>
                <Money agorot={budget.totalBudget} className="text-muted" />
              </span>
            </div>
            <ProgressBar usedBp={total.usedBp} state={total.state} label={he.budget.total} />
          </section>
        )}
        <ListGroup>
          <ListRow to="/plan/budget" icon="target" label={he.plan.budget} />
          <ListRow to="/plan/recurring" icon="repeat" label={he.plan.recurring} />
          <ListRow to="/plan/forecast" icon="trend" label={he.plan.forecast} />
          <ListRow to="/plan/wish" icon="gift" label={he.plan.wishList} />
        </ListGroup>
      </div>
    </>
  );
}
