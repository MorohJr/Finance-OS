import { useState } from 'react';
import { Link } from 'react-router';
import { Banner } from '../components/Banner';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useHasUserData, usePlatform, useSettings } from '../hooks';
import { isBackupDue } from '../../calc/reminders';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { isIos } from '../../services/platform';
import { he } from '../strings.he';

function Metric({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-1 text-lg font-medium text-muted" aria-label={`${label}: אין נתונים`}>
        —
      </p>
    </div>
  );
}

export function HomeScreen() {
  const settings = useSettings();
  const hasData = useHasUserData();
  const { installed, persisted } = usePlatform();
  // Session-only dismissal: the banner returns until the app is installed (SPEC 3.4).
  const [installDismissed, setInstallDismissed] = useState(false);

  const backupDue = settings && hasData !== undefined && isBackupDue(settings.lastBackupAt, hasData);
  const lastBackupLabel = settings?.lastBackupAt ? formatDisplayDate(todayIL(new Date(settings.lastBackupAt))) : he.banners.backupNever;

  return (
    <>
      {/* Design 4: solid purple header block carrying net worth. */}
      <header className="pt-safe rounded-b-[28px] bg-brand px-5 pb-6 text-on-brand">
        <div className="flex min-h-14 items-center justify-between">
          <span className="text-lg font-bold">{he.appName}</span>
          <Link to="/settings" aria-label={he.more.settings} className="flex size-11 items-center justify-center rounded-full active:bg-brand-strong">
            <Icon name="settings" />
          </Link>
        </div>
        <p className="text-sm text-on-brand-muted">{he.home.netWorth}</p>
        <p className="num mt-1 text-4xl font-bold">—</p>
        <p className="mt-1 text-sm text-on-brand-muted">{he.home.netWorthPending}</p>
      </header>

      <div className="flex flex-col gap-4 px-4 pt-4">
        {!installed && !installDismissed && (
          <Banner icon="share" title={he.banners.installTitle} onDismiss={() => setInstallDismissed(true)}>
            {isIos() ? he.banners.installBodyIos : he.banners.installBodyOther}
          </Banner>
        )}
        {backupDue && (
          <Banner
            icon="shield"
            tone="warning"
            title={he.banners.backupTitle}
            action={
              <Link to="/settings#backup" className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-text">
                {he.banners.backupAction}
              </Link>
            }
          >
            {he.banners.backupBody(lastBackupLabel)}
          </Banner>
        )}
        {persisted === false && installed && (
          <Banner icon="alert" tone="warning" title={he.banners.storageTitle}>
            {he.banners.storageBody}
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Metric label={he.home.liquid} />
          <Metric label={he.home.budget} />
          <Metric label={he.home.cashflow} />
          <Metric label={he.home.debts} />
        </div>

        <Card>
          <p className="font-medium">{he.home.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted">{he.home.emptyBody}</p>
          <Link to="/settings" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-soft px-4 text-sm font-medium text-brand-text">
            {he.home.openSettings}
          </Link>
        </Card>
      </div>
    </>
  );
}
