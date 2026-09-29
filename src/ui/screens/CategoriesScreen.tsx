import { useState, type FormEvent } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionTitle } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { Field, MoneyInput, Segmented, Toggle, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { useToast } from '../components/Toast';
import { useCategories } from '../data';
import { db } from '../../db/db';
import type { Category } from '../../domain/schemas';
import { createCategory, deleteCategory, updateCategory, type CategoryInput } from '../../services/categories';
import { parseAmountToAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const C = he.categories;

type Draft = { id?: string; name: string; type: Category['type']; parentId: string; context: Category['context']; includeInBudget: boolean; budget: string };

const empty = (type: Category['type'], context: Category['context']): Draft => ({ name: '', type, parentId: '', context, includeInBudget: type === 'expense' && context !== 'business', budget: '' });

function CategoryForm({ draft, all, onDone }: { draft: Draft; all: Category[]; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState('');
  const toast = useToast();
  const parents = all.filter((c) => !c.deletedAt && !c.parentId && c.type === d.type && c.id !== d.id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return setError(C.name);
    const budget = d.budget.trim() ? parseAmountToAgorot(d.budget) : undefined;
    if (budget === null || (budget !== undefined && budget < 0)) return setError(he.txForm.errors.amount);
    const input: CategoryInput = { name: d.name.trim(), type: d.type, parentId: d.parentId || undefined, context: d.context, includeInBudget: d.includeInBudget, monthlyBudget: budget ?? undefined };
    try {
      if (d.id) await updateCategory(db, d.id, input);
      else await createCategory(db, input);
      onDone();
    } catch (err) {
      const code = (err as Error).message as keyof typeof C.errors;
      setError(C.errors[code] ?? he.common.errorGeneric);
    }
  }

  async function onDelete() {
    if (!d.id) return;
    await deleteCategory(db, d.id);
    toast({ message: he.common.deleted });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto" noValidate>
      <Field label={C.name}>{(p) => <input {...p} className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
      <Segmented
        label={C.type}
        value={d.type}
        onChange={(type) => setD({ ...d, type, parentId: '' })}
        options={[
          { value: 'expense', label: C.typeExpense },
          { value: 'income', label: C.typeIncome },
        ]}
      />
      <Field label={C.parent}>
        {(p) => (
          <select {...p} className={inputCls} value={d.parentId} onChange={(e) => setD({ ...d, parentId: e.target.value })}>
            <option value="">{C.noParent}</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Segmented
        label={C.context}
        value={d.context}
        onChange={(context) => setD({ ...d, context })}
        options={[
          { value: 'personal', label: he.context.personal },
          { value: 'business', label: he.context.business },
          { value: 'both', label: he.context.both },
        ]}
      />
      {d.type === 'expense' && (
        <>
          <Toggle label={C.includeInBudget} checked={d.includeInBudget} onChange={(includeInBudget) => setD({ ...d, includeInBudget })} />
          <Field label={C.monthlyBudget}>{(p) => <MoneyInput {...p} value={d.budget} onChange={(budget) => setD({ ...d, budget })} />}</Field>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <button type="submit" className={primaryBtn}>
        {he.common.save}
      </button>
      {d.id && (
        <>
          <button type="button" onClick={onDelete} className={dangerBtn}>
            {he.common.delete}
          </button>
          <p className="text-xs text-muted">{C.deleteHint}</p>
        </>
      )}
    </form>
  );
}

export function CategoriesScreen() {
  const all = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<'expense' | 'income' | 'business'>('expense');
  if (!all) return <ScreenHeader title={C.title} back />;

  const live = all.filter((c) => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const inTab = live.filter((c) => (tab === 'business' ? c.context === 'business' : c.type === tab && c.context !== 'business'));
  const tops = inTab.filter((c) => !c.parentId || !inTab.some((p) => p.id === c.parentId));
  const children = (id: string) => inTab.filter((c) => c.parentId === id);

  const open = (c: Category) =>
    setDraft({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? '', context: c.context, includeInBudget: c.includeInBudget, budget: agorotToInput(c.monthlyBudget) });

  const row = (c: Category, child = false) => (
    <button key={c.id} type="button" onClick={() => open(c)} className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start active:bg-surface-2 ${child ? 'ps-10' : ''}`}>
      <span className="flex-1">{child ? `› ${c.name}` : c.name}</span>
      {c.monthlyBudget ? <Money agorot={c.monthlyBudget} className="text-sm text-muted" /> : null}
      <Icon name="chevron" size={16} className="text-muted" />
    </button>
  );

  return (
    <>
      <ScreenHeader title={C.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Segmented
          label={C.type}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expense', label: C.expense },
            { value: 'income', label: C.income },
            { value: 'business', label: C.business },
          ]}
        />
        <button type="button" className={primaryBtn} onClick={() => setDraft(empty(tab === 'income' ? 'income' : 'expense', tab === 'business' ? 'business' : 'personal'))}>
          <Icon name="plus" size={18} />
          {C.add}
        </button>
        <section>
          <SectionTitle>{tab === 'expense' ? C.expense : tab === 'income' ? C.income : C.business}</SectionTitle>
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {tops.map((c) => [row(c), ...children(c.id).map((ch) => row(ch, true))])}
          </div>
        </section>
      </div>
      <BottomSheet open={!!draft} title={draft?.id ? C.edit : C.add} onClose={() => setDraft(null)}>
        {draft && <CategoryForm key={draft.id ?? 'new'} draft={draft} all={all} onDone={() => setDraft(null)} />}
      </BottomSheet>
    </>
  );
}
