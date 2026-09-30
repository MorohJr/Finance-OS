import { useNavigate } from 'react-router';
import { BottomSheet } from '../components/BottomSheet';
import { Icon, type IconName } from '../components/Icon';
import { primaryBtn } from '../components/Form';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccounts, useBusiness } from '../data';
import { db } from '../../db/db';
import { he } from '../strings.he';

const MAIN: { kind: string; label: string; icon: IconName; tone: string }[] = [
  { kind: 'expense', label: he.quickAdd.expense, icon: 'upload', tone: 'text-expense' },
  { kind: 'income', label: he.quickAdd.income, icon: 'download', tone: 'text-income' },
  { kind: 'transfer', label: he.quickAdd.transfer, icon: 'repeat', tone: 'text-transfer' },
];
const EXTRA = [
  { kind: 'refund', label: he.quickAdd.refund },
  { kind: 'adjustment', label: he.quickAdd.adjustment },
];

/** SPEC 7.1: the ➕ tab opens a bottom sheet with the common kinds. */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const business = useBusiness();
  const employers = useLiveQuery(() => db.employers.filter((e) => !e.deletedAt).count(), []);
  const hasAccounts = (accounts ?? []).some((a) => a.status === 'active');
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <BottomSheet open={open} title={he.quickAdd.title} onClose={onClose}>
      {!hasAccounts ? (
        <div className="flex flex-col gap-3 text-center">
          <p className="text-sm text-muted">{he.quickAdd.needAccount}</p>
          <button type="button" className={primaryBtn} onClick={() => go('/accounts/new')}>
            {he.home.addAccount}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {MAIN.map((o) => (
              <button key={o.kind} type="button" onClick={() => go(`/transactions/new?kind=${o.kind}`)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 active:bg-brand-soft">
                <Icon name={o.icon} className={o.tone} size={26} />
                <span className="text-sm font-medium">{o.label}</span>
              </button>
            ))}
          </div>
          {business && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go('/business/income/new')} className="min-h-12 rounded-2xl bg-brand-soft text-sm font-medium text-brand-text">
                {he.quickAdd.businessIncome}
              </button>
              <button type="button" onClick={() => go('/business/expense/new')} className="min-h-12 rounded-2xl bg-surface-2 text-sm">
                {he.quickAdd.businessExpense}
              </button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => go(employers ? '/salary/payslip/new' : '/salary/employer/new?then=payslip')}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm font-medium"
            >
              <Icon name="salary" size={20} className="text-income" />
              {he.quickAdd.payslip}
            </button>
            <button type="button" onClick={() => go('/checks/new')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm font-medium">
              <Icon name="check" size={20} className="text-brand-text" />
              {he.quickAdd.check}
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {EXTRA.map((o) => (
              <button key={o.kind} type="button" onClick={() => go(`/transactions/new?kind=${o.kind}`)} className="min-h-11 rounded-full bg-surface-2 px-4 text-sm text-muted">
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
