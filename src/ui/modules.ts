import type { IconName } from './components/Icon';
import { he } from './strings.he';

/** Modules not built yet, with the SPEC 13 stage they belong to. */
export const MODULES = {
  accounts: { label: he.more.accounts, icon: 'wallet', stage: 1 },
  budget: { label: he.plan.budget, icon: 'target', stage: 3 },
  recurring: { label: he.plan.recurring, icon: 'repeat', stage: 3 },
  forecast: { label: he.plan.forecast, icon: 'trend', stage: 3 },
  import: { label: he.more.import, icon: 'import', stage: 4 },
  wishList: { label: he.plan.wishList, icon: 'gift', stage: 5 },
  debts: { label: he.more.debts, icon: 'loan', stage: 5 },
  checks: { label: he.more.checks, icon: 'check', stage: 5 },
  investments: { label: he.more.investments, icon: 'chart', stage: 6 },
  pension: { label: he.more.pension, icon: 'pension', stage: 6 },
  salary: { label: he.more.salary, icon: 'salary', stage: 7 },
  business: { label: he.more.business, icon: 'business', stage: 8 },
  tax: { label: he.more.tax, icon: 'percent', stage: 8 },
  reports: { label: he.more.reports, icon: 'report', stage: 9 },
} as const satisfies Record<string, { label: string; icon: IconName; stage: number }>;

export type ModuleKey = keyof typeof MODULES;
