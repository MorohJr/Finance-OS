import { useState } from 'react';
import { Field, Segmented, inputCls, primaryBtn, secondaryBtn, dangerBtn } from '../components/Form';
import { byId, categoryLabel, useAccounts, useCategories, usePayees } from '../data';
import { useSettings } from '../hooks';
import { db } from '../../db/db';
import { clearPin, isValidPin, setPin } from '../../services/pin';
import { transactionsToCsv } from '../../services/csv';
import { saveFile } from '../../services/platform';
import { activeTransactions } from '../../services/transactions';
import { currentMonthIL } from '../../calc/dates';
import { monthRange } from '../../calc/cashflow';
import { he } from '../strings.he';
import { markUnlocked } from '../components/PinLock';

export function PinSettings() {
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const enabled = !!settings?.pinHash;

  async function save() {
    if (!isValidPin(a)) return setError(he.pin.invalid);
    if (a !== b) return setError(he.pin.mismatch);
    markUnlocked();
    await setPin(db, a);
    setEditing(false);
    setA('');
    setB('');
    setError('');
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm">{enabled ? he.pin.on : he.pin.off}</p>
      <p className="text-xs text-muted">{he.pin.hint}</p>
      {editing ? (
        <>
          <Field label={he.pin.newPin}>
            {(p) => <input {...p} type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" className={`${inputCls} num`} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} />}
          </Field>
          <Field label={he.pin.confirmPin} error={error}>
            {(p) => <input {...p} type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" className={`${inputCls} num`} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} />}
          </Field>
          <div className="flex gap-2">
            <button type="button" className={primaryBtn} onClick={() => void save()}>
              {he.common.save}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setEditing(false)}>
              {he.common.cancel}
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button type="button" className={secondaryBtn} onClick={() => setEditing(true)}>
            {enabled ? he.pin.change : he.pin.set}
          </button>
          {enabled && (
            <button type="button" className={dangerBtn} onClick={() => void clearPin(db)}>
              {he.pin.remove}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CsvExport() {
  const range = monthRange(currentMonthIL());
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [context, setContext] = useState<'all' | 'personal' | 'business'>('all');
  const [message, setMessage] = useState('');
  const accounts = byId(useAccounts());
  const categories = byId(useCategories());
  const payees = byId(usePayees());

  async function onExport() {
    const all = await activeTransactions(db);
    const txs = all.filter((t) => t.date >= from && t.date <= to && (context === 'all' || t.context === context));
    if (!txs.length) return setMessage(he.csv.empty);
    const cards = byId(await db.cards.toArray());
    const csv = transactionsToCsv(txs, {
      accountName: (id) => (id ? (accounts.get(id)?.name ?? '') : ''),
      cardName: (id) => (id ? (cards.get(id)?.name ?? '') : ''),
      categoryName: (id) => categoryLabel(id ? categories.get(id) : undefined, categories),
      payeeName: (id) => (id ? (payees.get(id)?.name ?? '') : ''),
      kindLabel: (k, d) => (d ? `${he.kind[k]} (${d === 'in' ? '+' : '−'})` : he.kind[k]),
      contextLabel: (c) => he.context[c],
      statusLabel: (s) => he.status[s],
      headers: he.csv.headers,
    });
    try {
      await saveFile(`finance-os-${from}-${to}.csv`, csv, 'text/csv');
      setMessage(he.csv.done(txs.length));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMessage(he.common.errorGeneric);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={he.csv.from}>{(p) => <input {...p} type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={he.csv.to}>{(p) => <input {...p} type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      <Segmented
        label={he.csv.context}
        value={context}
        onChange={setContext}
        options={[
          { value: 'all', label: he.context.all },
          { value: 'personal', label: he.context.personal },
          { value: 'business', label: he.context.business },
        ]}
      />
      <button type="button" className={secondaryBtn} onClick={() => void onExport()}>
        {he.csv.export}
      </button>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
