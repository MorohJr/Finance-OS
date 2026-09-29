import { NavLink } from 'react-router';
import { Icon, type IconName } from './Icon';
import { he } from '../strings.he';

const TAB = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';

function Tab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `${TAB} ${isActive ? 'text-brand-text' : 'text-muted'}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

/** Five tabs, right to left: home, transactions, ➕, plan, more (SPEC 7.1). */
export function BottomNav({ onAdd }: { onAdd: () => void }) {
  return (
    <nav aria-label={he.nav.mainLabel} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch px-2">
        <Tab to="/" icon="home" label={he.nav.home} />
        <Tab to="/transactions" icon="list" label={he.nav.transactions} />
        <div className={TAB}>
          <button
            type="button"
            onClick={onAdd}
            aria-label={he.nav.add}
            className="flex size-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg shadow-brand/30 active:bg-brand-strong"
          >
            <Icon name="plus" size={26} />
          </button>
        </div>
        <Tab to="/plan" icon="calendar" label={he.nav.plan} />
        <Tab to="/more" icon="dots" label={he.nav.more} />
      </div>
    </nav>
  );
}
