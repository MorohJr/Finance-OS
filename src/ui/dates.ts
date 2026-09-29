import { format } from 'date-fns';
import { he as heLocale } from 'date-fns/locale/he';
import { daysBetween, formatDisplayDate, todayIL } from '../calc/dates';

/** "היום", "אתמול", or "יום שלישי, 15/09/2026". */
export function formatDayHeader(isoDate: string, today: string = todayIL()): string {
  const diff = daysBetween(isoDate, today);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const dayName = format(new Date(y, m - 1, d), 'EEEE', { locale: heLocale });
  return `${dayName}, ${formatDisplayDate(isoDate)}`;
}
