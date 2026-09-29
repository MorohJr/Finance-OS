import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Field, Toggle, inputCls, primaryBtn, secondaryBtn, dangerBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { byId, categoryLabel, useAccounts, useCards, useCategories } from '../data';
import { db } from '../../db/db';
import type { ImportBatch, ImportPreset } from '../../domain/schemas';
import { readGrid, type Grid } from '../../import/read';
import { findHeaderRow, guessMapping, headersOf, matchPreset, type Mapping, type TargetField } from '../../import/mapping';
import { normalizeDescription, parseRows, type ParseResult } from '../../import/parse';
import type { ImportTarget, PreviewResult, PreviewRow } from '../../import/preview';
import { commitImport, previewImport, savePreset, undoImport } from '../../services/import';
import { createRule } from '../../services/rules';
import { formatDisplayDate } from '../../calc/dates';
import { he } from '../strings.he';

const I = he.importer;
const FIELDS: TargetField[] = ['transactionDate', 'chargeDate', 'description', 'chargeAmount', 'signedAmount', 'debit', 'credit', 'originalAmount', 'installmentNumber', 'installmentCount', 'note', 'cardLast4'];

type Step =
  | { kind: 'pick' }
  | { kind: 'map'; grid: Grid; fileName: string; headerRow: number; mapping: Mapping; preset?: ImportPreset }
  | { kind: 'preview'; fileName: string; parsed: ParseResult; preview: PreviewResult; presetId?: string }
  | { kind: 'done'; batch: ImportBatch };

function History() {
  const batches = useLiveQuery(() => db.importBatches.orderBy('importedAt').reverse().filter((b) => !b.deletedAt).limit(20).toArray(), []);
  const toast = useToast();
  if (!batches?.length) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-medium text-muted">{I.history}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {batches.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{b.fileName}</span>
              <span className="block text-xs text-muted">
                {formatDisplayDate(b.importedAt.slice(0, 10))} · {I.done(b.createdCount)}
              </span>
            </span>
            <button
              type="button"
              className="min-h-10 rounded-full bg-danger-soft px-3 text-sm text-expense"
              onClick={async () => {
                if (!window.confirm(I.undoConfirm)) return;
                const n = await undoImport(db, b.id);
                toast({ message: I.undone(n) });
              }}
            >
              {I.undo}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ImportScreen() {
  const accounts = (useAccounts() ?? []).filter((a) => a.status === 'active');
  const cards = (useCards() ?? []).filter((c) => c.status === 'active');
  const categoriesList = useCategories();
  const categories = byId(categoriesList);
  const presets = useLiveQuery(() => db.importPresets.toArray(), []);
  const toast = useToast();
  const [targetKey, setTargetKey] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savePresetOn, setSavePresetOn] = useState(true);
  const [presetName, setPresetName] = useState('');

  const effectiveTarget = targetKey || (accounts[0] ? `acc:${accounts[0].id}` : '');
  const target: ImportTarget | undefined = useMemo(() => {
    const [type, id] = effectiveTarget.split(':');
    if (type === 'acc' && id) return { kind: 'bank', accountId: id };
    const card = cards.find((c) => c.id === id);
    if (type === 'card' && card) return card.kind === 'debit' ? { kind: 'bank', accountId: card.billingAccountId } : { kind: 'card', card };
    return undefined;
  }, [effectiveTarget, cards]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const grid = readGrid(new Uint8Array(await file.arrayBuffer()), file.name);
      const headerRow = Math.max(0, findHeaderRow(grid));
      const headers = headersOf(grid, headerRow);
      const preset = matchPreset(presets ?? [], headers);
      setPresetName(preset?.name ?? file.name.replace(/\.[^.]+$/, ''));
      if (findHeaderRow(grid) < 0) setError(I.noHeader);
      setStep({ kind: 'map', grid, fileName: file.name, headerRow, mapping: (preset?.mapping as Mapping) ?? guessMapping(headers), preset });
    } catch {
      setError(I.readError);
    }
  }

  const mapStep = step.kind === 'map' ? step : undefined;
  const headers = useMemo(() => (mapStep ? headersOf(mapStep.grid, mapStep.headerRow) : []), [mapStep]);
  const parsed = useMemo(() => (mapStep && target ? parseRows(mapStep.grid, mapStep.headerRow, headers, mapStep.mapping, target.kind) : undefined), [mapStep, target, headers]);

  async function toPreview() {
    if (!mapStep || !target || !parsed) return;
    const m = mapStep.mapping;
    if (!m.transactionDate || !(m.chargeAmount || m.signedAmount || m.debit || m.credit || m.originalAmount)) return setError(I.needDate);
    setBusy(true);
    try {
      let presetId = mapStep.preset?.id;
      if (savePresetOn && presetName.trim()) presetId = (await savePreset(db, presetName.trim(), headers, m, undefined, mapStep.preset?.id)).id;
      const preview = await previewImport(db, target, parsed);
      setStep({ kind: 'preview', fileName: mapStep.fileName, parsed, preview, presetId });
      setError('');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<PreviewRow>) {
    if (step.kind !== 'preview') return;
    const rows = step.preview.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setStep({ ...step, preview: { ...step.preview, rows } });
  }

  async function remember(i: number) {
    if (step.kind !== 'preview') return;
    const r = step.preview.rows[i]!;
    if (!r.categoryId || !r.row.description) return;
    await createRule(db, r.row.description, r.categoryId);
    // Apply to every row with the same description in this file.
    const key = normalizeDescription(r.row.description);
    const rows = step.preview.rows.map((x) => (normalizeDescription(x.row.description) === key ? { ...x, categoryId: r.categoryId } : x));
    setStep({ ...step, preview: { ...step.preview, rows } });
    toast({ message: I.rememberDone });
  }

  async function onCommit() {
    if (step.kind !== 'preview' || !target) return;
    setBusy(true);
    try {
      const batch = await commitImport(db, { target, fileName: step.fileName, presetId: step.presetId, rows: step.preview.rows, totals: step.parsed.totals, rowCount: step.parsed.rows.length });
      setStep({ kind: 'done', batch });
    } catch {
      setError(he.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  const catOptions = (type: 'income' | 'expense') =>
    (categoriesList ?? [])
      .filter((c) => !c.deletedAt && c.type === type)
      .sort((a, b) => categoryLabel(a, categories).localeCompare(categoryLabel(b, categories), 'he'));

  return (
    <>
      <ScreenHeader title={I.title} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        {step.kind === 'pick' && (
          <>
            <Field label={I.target}>
              {(p) => (
                <select {...p} className={inputCls} value={effectiveTarget} onChange={(e) => setTargetKey(e.target.value)}>
                  <optgroup label={he.txForm.accountsGroup}>
                    {accounts.map((a) => (
                      <option key={a.id} value={`acc:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  {cards.length > 0 && (
                    <optgroup label={he.txForm.cardsGroup}>
                      {cards.map((c) => (
                        <option key={c.id} value={`card:${c.id}`}>
                          {`${c.name} ·· ${c.last4}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </Field>
            <label className={`${primaryBtn} cursor-pointer`}>
              <Icon name="upload" size={20} />
              {I.pickFile}
              <input
                type="file"
                accept=".csv,.xls,.xlsx,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label={I.file}
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="text-xs text-muted">{I.privacy}</p>
            <History />
          </>
        )}

        {mapStep && (
          <>
            <p className={`rounded-xl px-3 py-2 text-sm ${mapStep.preset ? 'bg-brand-soft text-brand-text' : 'bg-surface-2'}`}>{mapStep.preset ? I.presetFound(mapStep.preset.name) : I.newLayout}</p>
            <Field label={I.headerRow}>
              {(p) => (
                <select
                  {...p}
                  className={inputCls}
                  value={mapStep.headerRow}
                  onChange={(e) => {
                    const headerRow = Number(e.target.value);
                    setStep({ ...mapStep, headerRow, mapping: guessMapping(headersOf(mapStep.grid, headerRow)) });
                  }}
                >
                  {mapStep.grid.slice(0, 20).map((r, i) => (
                    <option key={i} value={i}>
                      {`${I.rowN(i + 1)}: ${r.filter((c) => c !== null).slice(0, 4).join(' · ')}`.slice(0, 80)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <h2 className="px-1 text-sm font-medium text-muted">{I.mapping}</h2>
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
              {FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0">{I.fields[f]}</span>
                  <select
                    className={`${inputCls} min-h-10`}
                    value={mapStep.mapping[f] ?? ''}
                    onChange={(e) => setStep({ ...mapStep, mapping: { ...mapStep.mapping, [f]: e.target.value || undefined } })}
                  >
                    <option value="">{I.none}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {parsed && <p className="text-sm text-muted">{I.parsed(parsed.rows.length, parsed.errors.length)}</p>}
            {parsed && parsed.rows.length > 0 && (
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-sm">
                {parsed.rows.slice(0, 3).map((r) => (
                  <div key={r.line} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="num text-xs text-muted">{formatDisplayDate(r.date)}</span>
                    <span className="flex-1 truncate">{r.description}</span>
                    <Money agorot={r.flow === 'out' ? -r.amountAgorot : r.amountAgorot} tone={r.flow === 'out' ? 'expense' : 'income'} />
                  </div>
                ))}
              </div>
            )}
            <Toggle label={I.savePreset} checked={savePresetOn} onChange={setSavePresetOn} />
            {savePresetOn && <Field label={I.presetName}>{(p) => <input {...p} className={inputCls} value={presetName} onChange={(e) => setPresetName(e.target.value)} />}</Field>}
            <div className="flex gap-2">
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => void toPreview()}>
                {I.toPreview}
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setStep({ kind: 'pick' })}>
                {I.back}
              </button>
            </div>
          </>
        )}

        {step.kind === 'preview' && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-2xl bg-brand-soft p-2 text-brand-text">
                <p className="text-xl font-bold">{step.preview.rows.filter((r) => r.include && r.action !== 'existing_plan').length}</p>
                <p>{I.summary.create}</p>
              </div>
              <div className="rounded-2xl bg-surface p-2">
                <p className="text-xl font-bold">{step.preview.rows.filter((r) => r.flags.duplicate).length}</p>
                <p className="text-muted">{I.summary.duplicate}</p>
              </div>
              <div className="rounded-2xl bg-surface p-2">
                <p className="text-xl font-bold">{step.preview.rows.filter((r) => r.flags.installment).length}</p>
                <p className="text-muted">{I.summary.installments}</p>
              </div>
            </div>
            {step.preview.cutoffSuggestion && (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm">{I.cutoff(step.preview.cutoffSuggestion.mismatched, step.preview.cutoffSuggestion.total)}</p>
            )}
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {step.preview.rows.map((r, i) => {
                const locked = r.action === 'existing_plan';
                const shown = r.plan ? r.plan.purchaseAmountAgorot : r.row.amountAgorot;
                return (
                  <div key={r.row.line} className={`flex flex-col gap-2 px-3 py-2.5 ${r.include ? '' : 'opacity-60'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`${I.include}: ${r.row.description}`}
                        checked={r.include}
                        disabled={locked}
                        onChange={(e) => updateRow(i, { include: e.target.checked })}
                        className="size-5 shrink-0 accent-(--brand)"
                      />
                      <span className="num w-20 shrink-0 text-xs text-muted">{formatDisplayDate(r.row.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.row.description || '—'}</span>
                      <Money agorot={r.txKind === 'expense' ? -shown : shown} tone={r.txKind === 'expense' ? 'expense' : 'income'} className="text-sm" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 ps-7">
                      {r.flags.duplicate && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">{I.flags[r.flags.duplicate]}</span>}
                      {r.flags.cardPayment && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">{I.flags.cardPayment(r.flags.cardPayment)}</span>}
                      {r.flags.installment && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-text">
                          {locked ? I.flags.existingPlan : I.flags.installment(r.flags.installment.number, r.flags.installment.count)}
                        </span>
                      )}
                      {r.plan?.estimated && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{I.flags.estimated}</span>}
                      {!locked && (
                        <>
                          <select
                            aria-label={he.txForm.category}
                            className="min-h-9 max-w-44 rounded-lg border border-line bg-surface-2 px-2 text-xs"
                            value={r.categoryId ?? ''}
                            onChange={(e) => updateRow(i, { categoryId: e.target.value || undefined })}
                          >
                            <option value="">{he.txForm.noCategory}</option>
                            {catOptions(r.txKind === 'income' ? 'income' : 'expense').map((c) => (
                              <option key={c.id} value={c.id}>
                                {categoryLabel(c, categories)}
                              </option>
                            ))}
                          </select>
                          {r.categoryId && r.row.description && (
                            <button type="button" onClick={() => void remember(i)} className="min-h-9 rounded-lg bg-brand-soft px-2 text-xs text-brand-text">
                              + {I.remember}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => void onCommit()}>
                {busy ? I.importing : I.commit(step.preview.rows.filter((r) => r.include && r.action !== 'existing_plan').length)}
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setStep({ kind: 'pick' })}>
                {he.common.cancel}
              </button>
            </div>
          </>
        )}

        {step.kind === 'done' && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center">
            <Icon name="done" size={32} className="text-income" />
            <p className="text-lg font-medium">{I.done(step.batch.createdCount)}</p>
            <Link to="/transactions" className={primaryBtn}>
              {I.viewTransactions}
            </Link>
            <button type="button" className={secondaryBtn} onClick={() => setStep({ kind: 'pick' })}>
              {I.another}
            </button>
            <button
              type="button"
              className={dangerBtn}
              onClick={async () => {
                const n = await undoImport(db, step.batch.id);
                toast({ message: I.undone(n) });
                setStep({ kind: 'pick' });
              }}
            >
              {I.undo}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
