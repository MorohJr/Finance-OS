import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/BottomSheet';
import { Field, Segmented, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { Icon } from '../components/Icon';
import { byId, categoryLabel, useCategories } from '../data';
import { db } from '../../db/db';
import type { CategoryRule } from '../../domain/schemas';
import { createRule, deleteRule, updateRule } from '../../services/rules';
import { he } from '../strings.he';

const R = he.rules;
type Draft = { id?: string; match: CategoryRule['match']; pattern: string; categoryId: string; priority: string };

function RuleForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState('');
  const categoriesList = useCategories() ?? [];
  const categories = byId(categoriesList);
  const options = categoriesList.filter((c) => !c.deletedAt).sort((a, b) => categoryLabel(a, categories).localeCompare(categoryLabel(b, categories), 'he'));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!d.pattern.trim() || !d.categoryId) return setError(`${R.pattern}, ${R.category}`);
    if (d.match === 'regex') {
      try {
        new RegExp(d.pattern);
      } catch {
        return setError(R.matches.regex);
      }
    }
    const input = { match: d.match, pattern: d.pattern, categoryId: d.categoryId, priority: Number(d.priority) || 0 };
    if (d.id) await updateRule(db, d.id, input);
    else await createRule(db, d.pattern, d.categoryId, input);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Segmented label={R.match} value={d.match} onChange={(match) => setD({ ...d, match })} options={(['contains', 'equals', 'regex'] as const).map((m) => ({ value: m, label: R.matches[m] }))} />
      <Field label={R.pattern} error={error}>
        {(p) => <input {...p} className={inputCls} dir={d.match === 'regex' ? 'ltr' : undefined} value={d.pattern} onChange={(e) => setD({ ...d, pattern: e.target.value })} placeholder={R.patternPlaceholder} />}
      </Field>
      <Field label={R.category}>
        {(p) => (
          <select {...p} className={inputCls} value={d.categoryId} onChange={(e) => setD({ ...d, categoryId: e.target.value })}>
            <option value="">—</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, categories)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={R.priority}>
        {(p) => <input {...p} inputMode="numeric" dir="ltr" className={`${inputCls} num text-start`} value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value.replace(/[^\d-]/g, '') })} />}
      </Field>
      <button type="submit" className={primaryBtn}>
        {he.common.save}
      </button>
      {d.id && (
        <button
          type="button"
          className={dangerBtn}
          onClick={async () => {
            await deleteRule(db, d.id!);
            onDone();
          }}
        >
          {he.common.delete}
        </button>
      )}
    </form>
  );
}

export function RulesScreen() {
  const rules = useLiveQuery(() => db.categoryRules.filter((r) => !r.deletedAt).toArray(), []);
  const categories = byId(useCategories());
  const [draft, setDraft] = useState<Draft | null>(null);
  const sorted = [...(rules ?? [])].sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern, 'he'));
  return (
    <>
      <ScreenHeader title={R.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <p className="text-sm text-muted">{R.hint}</p>
        <button type="button" className={primaryBtn} onClick={() => setDraft({ match: 'contains', pattern: '', categoryId: '', priority: '0' })}>
          <Icon name="plus" size={18} />
          {R.add}
        </button>
        {sorted.length === 0 && <p className="text-center text-sm text-muted">{R.empty}</p>}
        {sorted.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {sorted.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDraft({ id: r.id, match: r.match, pattern: r.pattern, categoryId: r.categoryId, priority: String(r.priority) })}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start active:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.pattern}</span>
                  <span className="block text-xs text-muted">
                    {R.matches[r.match]} → {categoryLabel(categories.get(r.categoryId), categories)}
                  </span>
                </span>
                {r.priority !== 0 && <span className="num text-xs text-muted">{r.priority}</span>}
                <Icon name="chevron" size={16} className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>
      <BottomSheet open={!!draft} title={draft?.id ? R.edit : R.add} onClose={() => setDraft(null)}>
        {draft && <RuleForm key={draft.id ?? 'new'} draft={draft} onDone={() => setDraft(null)} />}
      </BottomSheet>
    </>
  );
}
