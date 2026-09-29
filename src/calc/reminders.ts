import { daysBetween, todayIL } from './dates';

/** SPEC 3.4 and 12: remind to back up when more than 7 days have passed since the last backup. */
export const BACKUP_REMINDER_DAYS = 7;

/**
 * True if a backup reminder should show.
 * No backup at all counts as due only once there's data worth backing up.
 */
export function isBackupDue(lastBackupAt: string | undefined, hasUserData: boolean, now: Date = new Date()): boolean {
  if (!lastBackupAt) return hasUserData;
  const last = todayIL(new Date(lastBackupAt));
  return daysBetween(last, todayIL(now)) > BACKUP_REMINDER_DAYS;
}
