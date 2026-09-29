import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { he } from '../strings.he';

interface BannerProps {
  icon: IconName;
  title: string;
  children: ReactNode;
  tone?: 'warning' | 'info';
  action?: ReactNode;
  onDismiss?: () => void;
}

export function Banner({ icon, title, children, tone = 'info', action, onDismiss }: BannerProps) {
  const colors = tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand-text';
  return (
    <div role="status" className={`flex gap-3 rounded-card p-4 ${colors}`}>
      <Icon name={icon} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-text">{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-me-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full"
          aria-label={he.banners.dismiss}
        >
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}
