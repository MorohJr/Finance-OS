import { ScreenHeader } from '../components/ScreenHeader';
import { ListGroup, ListRow } from '../components/ListRow';
import { MODULES, type ModuleKey } from '../modules';
import { he } from '../strings.he';

// SPEC 7.1 order. When the business module is active it moves to the top (stage 8).
const FINANCE: ModuleKey[] = ['salary'];
const BUSINESS: ModuleKey[] = ['business', 'tax'];
const TOOLS: ModuleKey[] = ['reports'];

function Group({ items }: { items: ModuleKey[] }) {
  return (
    <ListGroup>
      {items.map((k) => (
        <ListRow key={k} to={`/soon/${k}`} icon={MODULES[k].icon} label={MODULES[k].label} hint={he.common.comingInStage(MODULES[k].stage)} />
      ))}
    </ListGroup>
  );
}

export function MoreScreen() {
  return (
    <>
      <ScreenHeader title={he.more.title} />
      <div className="flex flex-col gap-4 px-4">
        <ListGroup>
          <ListRow to="/accounts" icon="wallet" label={he.more.accounts} />
          <ListRow to="/debts" icon="loan" label={he.more.debts} />
          <ListRow to="/checks" icon="check" label={he.more.checks} />
          <ListRow to="/investments" icon="chart" label={he.more.investments} />
          <ListRow to="/pension" icon="pension" label={he.more.pension} />
        </ListGroup>
        <Group items={FINANCE} />
        <Group items={BUSINESS} />
        <ListGroup>
          <ListRow to="/import" icon="import" label={he.more.import} />
          {TOOLS.map((k) => (
            <ListRow key={k} to={`/soon/${k}`} icon={MODULES[k].icon} label={MODULES[k].label} hint={he.common.comingInStage(MODULES[k].stage)} />
          ))}
        </ListGroup>
        <ListGroup>
          <ListRow to="/settings" icon="settings" label={he.more.settings} />
        </ListGroup>
      </div>
    </>
  );
}
