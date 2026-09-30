import { useParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { MODULES, type ModuleKey } from '../modules';
import { he } from '../strings.he';

export function ComingSoonScreen() {
  const { module } = useParams();
  const m = MODULES[module as ModuleKey] ?? MODULES.business;
  return (
    <>
      <ScreenHeader title={m.label} back />
      <div className="px-4">
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
            <Icon name={m.icon} size={28} />
          </span>
          <p className="mt-2 font-medium">{he.common.comingSoonTitle}</p>
          <p className="text-sm text-muted">{he.common.comingSoonBody(m.stage)}</p>
        </Card>
      </div>
    </>
  );
}
