import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router';
import { db, USER_DATA_TABLES } from '../db/db';
import { SETTINGS_ID, type Settings } from '../domain/schemas';
import { hasUserData } from '../services/settings';
import { isInstalledApp, requestPersistentStorage } from '../services/platform';
import { syncCardStatements } from '../services/cards';

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID), []);
}

export function useHasUserData(): boolean | undefined {
  return useLiveQuery(() => hasUserData(db, USER_DATA_TABLES), []);
}

/** Applies the chosen theme to <html data-theme>; "system" follows the device (SPEC 8). */
export function useApplyTheme(settings: Settings | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings?.theme ?? 'system';
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [settings?.theme]);
}

export interface PlatformState {
  persisted: boolean | undefined;
  installed: boolean;
}

/** Requests persistent storage once, and reports install state (SPEC 3.4). */
export function usePlatform(): PlatformState {
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);
  const [installed] = useState(isInstalledApp);
  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage().then((p) => !cancelled && setPersisted(p));
    return () => {
      cancelled = true;
    };
  }, []);
  return { persisted, installed };
}

/**
 * Back navigation that never leaves the app: if this page was opened directly (no in-app history),
 * go to `fallback` instead of history.back().
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }));
}

/**
 * Jobs that run when the app opens and when it returns to the foreground (SPEC 10.2 closing card
 * statements; later stages add recurring items and net worth snapshots).
 */
export function useStartupJobs(): void {
  useEffect(() => {
    const run = () => {
      void syncCardStatements(db).catch((e) => console.error('card sync failed', e));
    };
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
