import { ScreenHeader } from '../components/ScreenHeader';
import { ListGroup, ListRow } from '../components/ListRow';
import { MODULES, type ModuleKey } from '../modules';
import { he } from '../strings.he';

// SPEC 7.1 order. When the business module is active it moves to the top (stage 8).
const FINANCE: ModuleKey[] = ['accounts', 'debts', 'checks', 'investments', 'pension', 'salary'];
const BUSINESS: ModuleKey[] = ['business', 'tax'];
const TOOLS: ModuleKey[] = ['reports', 'import'];

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
        <Group items={FINANCE} />
        <Group items={BUSINESS} />
        <Group items={TOOLS} />
        <ListGroup>
          <ListRow to="/settings" icon="settings" label={he.more.settings} />
        </ListGroup>
      </div>
    </>
  );
}
