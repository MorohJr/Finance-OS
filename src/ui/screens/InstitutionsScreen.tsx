import { useState, type FormEvent } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/BottomSheet';
import { Monogram } from '../components/Monogram';
import { LogoPicker } from '../components/LogoPicker';
import { Icon } from '../components/Icon';
import { Field, dangerBtn, inputCls, primaryBtn } from '../components/Form';
import { useInstitutions } from '../data';
import { db } from '../../db/db';
import { Institution as InstitutionSchema, type Institution } from '../../domain/schemas';
import { deleteInstitution, saveInstitution } from '../../services/institutions';
import { he } from '../strings.he';

const I = he.institutions;
type Draft = { id?: string; name: string; kind: Institution['kind']; code: string; color: string; logoAttachmentId?: string };

function InstitutionForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return setError(I.name);
    await saveInstitution(db, { name: d.name.trim(), kind: d.kind, code: d.code.trim() || undefined, color: d.color, logoAttachmentId: d.logoAttachmentId }, d.id);
    onDone();
  }
  return (
    <form onSubmit={onSubmit} className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto" noValidate>
      <LogoPicker name={d.name} color={d.color} value={d.logoAttachmentId} onChange={(logoAttachmentId) => setD({ ...d, logoAttachmentId })} hint={I.logoHint} />
      <Field label={I.name} error={error}>{(p) => <input {...p} className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
      <Field label={I.kind}>
        {(p) => (
          <select {...p} className={inputCls} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Institution['kind'] })}>
            {InstitutionSchema.shape.kind.options.map((k) => (
              <option key={k} value={k}>
                {I.kinds[k]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={I.code}>{(p) => <input {...p} dir="ltr" className={`${inputCls} text-start`} value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />}</Field>
        <Field label={I.color}>{(p) => <input {...p} type="color" className="h-11 w-full rounded-xl border border-line bg-surface-2" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />}</Field>
      </div>
      <button type="submit" className={primaryBtn}>
        {he.common.save}
      </button>
      {d.id && (
        <button
          type="button"
          className={dangerBtn}
          onClick={async () => {
            try {
              await deleteInstitution(db, d.id!);
              onDone();
            } catch {
              setError(he.accounts.deleteHasTx);
            }
          }}
        >
          {he.common.delete}
        </button>
      )}
    </form>
  );
}

export function InstitutionsScreen() {
  const list = useInstitutions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const kinds = InstitutionSchema.shape.kind.options;
  return (
    <>
      <ScreenHeader title={I.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <button type="button" className={primaryBtn} onClick={() => setDraft({ name: '', kind: 'bank', code: '', color: '#26338C' })}>
          <Icon name="plus" size={18} />
          {I.add}
        </button>
        {kinds.map((k) => {
          const items = (list ?? []).filter((i) => i.kind === k).sort((a, b) => a.name.localeCompare(b.name, 'he'));
          if (!items.length) return null;
          return (
            <section key={k}>
              <h2 className="mb-2 px-1 text-sm font-medium text-muted">{I.kinds[k]}</h2>
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {items.map((i) => (
                  <button key={i.id} type="button" onClick={() => setDraft({ id: i.id, name: i.name, kind: i.kind, code: i.code ?? '', color: i.color, logoAttachmentId: i.logoAttachmentId })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start active:bg-surface-2">
                    <Monogram name={i.name} color={i.color} logoId={i.logoAttachmentId} size={32} />
                    <span className="flex-1">{i.name}</span>
                    <Icon name="chevron" size={16} className="text-muted" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <BottomSheet open={!!draft} title={draft?.id ? I.edit : I.add} onClose={() => setDraft(null)}>
        {draft && <InstitutionForm key={draft.id ?? 'new'} draft={draft} onDone={() => setDraft(null)} />}
      </BottomSheet>
    </>
  );
}
