import { ScreenHeader } from '../components/ScreenHeader';
import { ListGroup, ListRow } from '../components/ListRow';
import { MODULES, type ModuleKey } from '../modules';
import { he } from '../strings.he';

const ITEMS: ModuleKey[] = ['budget', 'recurring', 'wishList', 'forecast'];

export function PlanScreen() {
  return (
    <>
      <ScreenHeader title={he.plan.title} />
      <div className="px-4">
        <ListGroup>
          {ITEMS.map((k) => (
            <ListRow key={k} to={`/soon/${k}`} icon={MODULES[k].icon} label={MODULES[k].label} hint={he.common.comingInStage(MODULES[k].stage)} />
          ))}
        </ListGroup>
      </div>
    </>
  );
}
