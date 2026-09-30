import type { IconName } from './components/Icon';
import { he } from './strings.he';

/** Modules not built yet, with the SPEC 13 stage they belong to. */
export const MODULES = {
  salary: { label: he.more.salary, icon: 'salary', stage: 7 },
  business: { label: he.more.business, icon: 'business', stage: 8 },
  tax: { label: he.more.tax, icon: 'percent', stage: 8 },
  reports: { label: he.more.reports, icon: 'report', stage: 9 },
} as const satisfies Record<string, { label: string; icon: IconName; stage: number }>;

export type ModuleKey = keyof typeof MODULES;
