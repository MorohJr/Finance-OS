import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { he } from '../strings.he';

export function TransactionsScreen() {
  return (
    <>
      <ScreenHeader title={he.transactions.title} />
      <div className="px-4">
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="list" size={32} className="text-brand-text" />
          <p className="font-medium">{he.transactions.emptyTitle}</p>
          <p className="text-sm text-muted">{he.transactions.emptyBody}</p>
        </Card>
      </div>
    </>
  );
}
