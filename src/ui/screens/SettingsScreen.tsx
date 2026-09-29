import { useId, useState, type ReactNode } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionTitle } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { Toggle } from '../components/Form';
import { usePlatform, useSettings } from '../hooks';
import { db } from '../../db/db';
import type { Theme } from '../../domain/schemas';
import { updateSettings } from '../../services/settings';
import { BackupError, backupFileName, exportBackup, isEncryptedBackup, markBackupDone, parseBackup, restoreBackup, type ParsedBackup } from '../../services/backup';
import { WrongPasswordError } from '../../services/crypto';
import { saveFile } from '../../services/platform';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { he } from '../strings.he';
import { ListRow } from '../components/ListRow';
import { CsvExport, PinSettings } from './SettingsExtras';

const S = he.settings;

function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{children}</div>;
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-14 items-center gap-3 px-4 py-3">{children}</div>;
}

const primaryBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 font-medium text-on-brand active:bg-brand-strong disabled:opacity-50';
const secondaryBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-soft px-5 font-medium text-brand-text';
const inputCls = 'min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base';

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

function ThemePicker({ value }: { value: Theme }) {
  const options: { v: Theme; label: string }[] = [
    { v: 'system', label: S.themeSystem },
    { v: 'light', label: S.themeLight },
    { v: 'dark', label: S.themeDark },
  ];
  return (
    <div role="radiogroup" aria-label={S.theme} className="flex flex-1 rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => updateSettings(db, { theme: o.v })}
          className={`min-h-10 flex-1 rounded-full text-sm ${value === o.v ? 'bg-brand text-on-brand' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backup export
// ---------------------------------------------------------------------------

function ExportBackup({ lastBackupAt }: { lastBackupAt?: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const pwId = useId();
  const confirmId = useId();

  async function onExport() {
    setMessage(null);
    if (password !== confirm) {
      setMessage({ ok: false, text: S.passwordMismatch });
      return;
    }
    setBusy(true);
    try {
      const text = await exportBackup(db, password ? { password } : {});
      await saveFile(backupFileName(todayIL()), text);
      await markBackupDone(db);
      setPassword('');
      setConfirm('');
      setMessage({ ok: true, text: S.exportDone });
    } catch (e) {
      // User closing the iOS share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMessage({ ok: false, text: S.errors.generic });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">
        {S.lastBackup}: <span className="num">{lastBackupAt ? formatDisplayDate(todayIL(new Date(lastBackupAt))) : he.common.never}</span>
      </p>
      <label htmlFor={pwId} className="text-sm">
        {S.backupPassword}
      </label>
      <input id={pwId} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
      {password && (
        <>
          <label htmlFor={confirmId} className="text-sm">
            {S.backupPasswordConfirm}
          </label>
          <input id={confirmId} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </>
      )}
      <p className="text-xs text-muted">{S.backupPasswordHint}</p>
      <button type="button" onClick={onExport} disabled={busy} className={primaryBtn}>
        <Icon name="download" size={20} />
        {busy ? S.exporting : S.exportBackup}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-income' : 'text-expense'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restore (double confirmation, SPEC 12)
// ---------------------------------------------------------------------------

type RestoreStep =
  | { kind: 'idle' }
  | { kind: 'password'; text: string }
  | { kind: 'summary'; backup: ParsedBackup }
  | { kind: 'confirm1'; backup: ParsedBackup }
  | { kind: 'confirm2'; backup: ParsedBackup };

function errorText(e: unknown): string {
  if (e instanceof WrongPasswordError) return S.errors.wrong_password;
  if (e instanceof BackupError) return S.errors[e.code];
  return S.errors.generic;
}

function RestoreBackup() {
  const [step, setStep] = useState<RestoreStep>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileId = useId();
  const pwId = useId();

  function reset() {
    setStep({ kind: 'idle' });
    setPassword('');
  }

  async function onFile(file: File | undefined) {
    setError(null);
    setDone(false);
    if (!file) return;
    const text = await file.text();
    if (isEncryptedBackup(text)) {
      setStep({ kind: 'password', text });
      return;
    }
    await check(text);
  }

  async function check(text: string, pw?: string) {
    setBusy(true);
    try {
      setStep({ kind: 'summary', backup: await parseBackup(text, pw) });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(backup: ParsedBackup) {
    setBusy(true);
    try {
      await restoreBackup(db, backup);
      setDone(true);
      reset();
    } catch (e) {
      setError(errorText(e));
      reset();
    } finally {
      setBusy(false);
    }
  }

  const totalRows = (b: ParsedBackup) => Object.values(b.counts).reduce((a, n) => a + n, 0);

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">{S.restoreHint}</p>

      {step.kind === 'idle' && (
        <label htmlFor={fileId} className={`${secondaryBtn} cursor-pointer`}>
          <Icon name="upload" size={20} />
          {S.restore}
          <input
            id={fileId}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {step.kind === 'password' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void check(step.text, password);
          }}
        >
          <label htmlFor={pwId} className="text-sm">
            {S.restorePasswordPrompt}
          </label>
          <input id={pwId} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !password} className={primaryBtn}>
              {S.restoreCheck}
            </button>
            <button type="button" onClick={reset} className={secondaryBtn}>
              {he.common.cancel}
            </button>
          </div>
        </form>
      )}

      {step.kind === 'summary' && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
          <p className="text-sm">{S.restoreSummary(formatDisplayDate(todayIL(new Date(step.backup.exportedAt))), totalRows(step.backup))}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep({ kind: 'confirm1', backup: step.backup })} className={primaryBtn}>
              {he.common.continue}
            </button>
            <button type="button" onClick={reset} className={secondaryBtn}>
              {he.common.cancel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-income">
          {S.restoreDone}
        </p>
      )}

      <BottomSheet open={step.kind === 'confirm1'} title={S.restoreConfirm1Title} onClose={reset}>
        <p className="mb-4 text-sm text-muted">{S.restoreConfirm1Body}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => step.kind === 'confirm1' && setStep({ kind: 'confirm2', backup: step.backup })} className={primaryBtn}>
            {S.restoreYes}
          </button>
          <button type="button" onClick={reset} className={secondaryBtn}>
            {he.common.cancel}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={step.kind === 'confirm2'} title={S.restoreConfirm2Title} onClose={reset}>
        <p className="mb-4 text-sm text-muted">{S.restoreConfirm2Body}</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => step.kind === 'confirm2' && void doRestore(step.backup)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-expense px-5 font-medium text-on-brand disabled:opacity-50"
          >
            {S.restoreFinal}
          </button>
          <button type="button" onClick={reset} className={secondaryBtn}>
            {he.common.cancel}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SettingsScreen() {
  const settings = useSettings();
  const { persisted, installed } = usePlatform();
  if (!settings) return <ScreenHeader title={S.title} back />;

  return (
    <>
      <ScreenHeader title={S.title} back />
      <div className="flex flex-col gap-5 px-4 pb-6">
        <section>
          <SectionTitle>{S.appearance}</SectionTitle>
          <Group>
            <Row>
              <span className="shrink-0">{S.theme}</span>
              <ThemePicker value={settings.theme} />
            </Row>
            <div className="px-4 py-2">
              <Toggle label={S.hideAgorot} hint={S.hideAgorotHint} checked={settings.hideAgorot} onChange={(v) => void updateSettings(db, { hideAgorot: v })} />
            </div>
          </Group>
        </section>

        <section>
          <SectionTitle>{S.data}</SectionTitle>
          <Group>
            <ListRow to="/settings/categories" icon="folder" label={S.categories} />
            <ListRow to="/accounts" icon="wallet" label={he.accounts.title} />
          </Group>
        </section>

        <section>
          <SectionTitle>{S.security}</SectionTitle>
          <Group>
            <PinSettings />
          </Group>
        </section>

        <section>
          <SectionTitle>{he.csv.title}</SectionTitle>
          <Group>
            <CsvExport />
          </Group>
        </section>

        <section id="backup">
          <SectionTitle>{S.backup}</SectionTitle>
          <Group>
            <ExportBackup lastBackupAt={settings.lastBackupAt} />
            <RestoreBackup />
          </Group>
        </section>

        <section>
          <SectionTitle>{S.storage}</SectionTitle>
          <Group>
            <Row>
              <Icon name="shield" className={persisted ? 'text-income' : 'text-warning'} />
              <span className="text-sm">{persisted ? S.storagePersisted : S.storageNotPersisted}</span>
            </Row>
            <Row>
              <Icon name="home" className="text-brand-text" />
              <span className="text-sm">{installed ? S.installed : S.notInstalled}</span>
            </Row>
          </Group>
        </section>

        <section>
          <SectionTitle>{S.about}</SectionTitle>
          <Group>
            <div className="flex flex-col gap-2 p-4 text-sm">
              <p>{S.privacy}</p>
              <p className="text-muted">{S.disclaimer}</p>
              <p className="text-muted">
                {S.version} <span className="num">{__APP_VERSION__}</span>
              </p>
            </div>
          </Group>
        </section>
      </div>
    </>
  );
}
