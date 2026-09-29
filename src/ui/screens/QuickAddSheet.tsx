import { BottomSheet } from '../components/BottomSheet';
import { Icon, type IconName } from '../components/Icon';
import { he } from '../strings.he';

const OPTIONS: { key: string; label: string; icon: IconName; tone: string }[] = [
  { key: 'expense', label: he.quickAdd.expense, icon: 'upload', tone: 'text-expense' },
  { key: 'income', label: he.quickAdd.income, icon: 'download', tone: 'text-income' },
  { key: 'transfer', label: he.quickAdd.transfer, icon: 'repeat', tone: 'text-transfer' },
];

/** SPEC 7.1: the ➕ tab opens a bottom sheet. Transaction entry arrives in stage 1. */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} title={he.quickAdd.title} onClose={onClose}>
      <ul className="grid grid-cols-3 gap-3" aria-describedby="quick-add-note">
        {OPTIONS.map((o) => (
          <li key={o.key} className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 py-4 opacity-60">
            <Icon name={o.icon} className={o.tone} />
            <span className="text-sm">{o.label}</span>
          </li>
        ))}
      </ul>
      <p id="quick-add-note" className="mt-3 text-center text-sm text-muted">
        {he.quickAdd.note}
      </p>
    </BottomSheet>
  );
}
