import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ListRowProps {
  to: string;
  icon: IconName;
  label: string;
  hint?: ReactNode;
}

/** A tappable row in a grouped list (44px+ touch target). */
export function ListRow({ to, icon, label, hint }: ListRowProps) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
      <Icon name="chevron" size={18} className="text-muted" />
    </Link>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{children}</div>;
}
