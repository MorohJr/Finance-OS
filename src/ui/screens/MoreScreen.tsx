import { ScreenHeader } from '../components/ScreenHeader';
import { ListGroup, ListRow } from '../components/ListRow';
import { MODULES } from '../modules';
import { useBusiness } from '../data';
import { he } from '../strings.he';

/** SPEC 7.1: when the business module is active, it's shown first. */
export function MoreScreen() {
  const business = useBusiness();
  const businessGroup = (
    <ListGroup>
      <ListRow to="/business" icon="business" label={business ? business.name : he.more.business} />
      <ListRow to="/tax" icon="percent" label={he.more.tax} />
    </ListGroup>
  );
  return (
    <>
      <ScreenHeader title={he.more.title} />
      <div className="flex flex-col gap-4 px-4">
        {business && businessGroup}
        <ListGroup>
          <ListRow to="/accounts" icon="wallet" label={he.more.accounts} />
          <ListRow to="/debts" icon="loan" label={he.more.debts} />
          <ListRow to="/checks" icon="check" label={he.more.checks} />
          <ListRow to="/investments" icon="chart" label={he.more.investments} />
          <ListRow to="/pension" icon="pension" label={he.more.pension} />
          <ListRow to="/salary" icon="salary" label={he.more.salary} />
        </ListGroup>
        {!business && businessGroup}
        <ListGroup>
          <ListRow to="/import" icon="import" label={he.more.import} />
          <ListRow to={`/soon/reports`} icon={MODULES.reports.icon} label={MODULES.reports.label} hint={he.common.comingInStage(MODULES.reports.stage)} />
        </ListGroup>
        <ListGroup>
          <ListRow to="/settings" icon="settings" label={he.more.settings} />
        </ListGroup>
      </div>
    </>
  );
}
