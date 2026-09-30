import { useAttachmentUrl } from '../data';
import { Icon } from './Icon';
import { he } from '../strings.he';

function Thumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useAttachmentUrl(id);
  return (
    <div className="relative size-20 overflow-hidden rounded-xl border border-line bg-surface-2">
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={he.txForm.receipts} className="size-full object-cover" />
        </a>
      )}
      <button type="button" onClick={onRemove} aria-label={he.txForm.removeReceipt} className="absolute end-1 top-1 flex size-7 items-center justify-center rounded-full bg-scrim text-white">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** Receipt photos on a transaction (SPEC 6.3 attachmentIds, 3.4 compressed ≤1600px). */
export function Receipts({ ids, onAdd, onRemove }: { ids: string[]; onAdd: (file: File) => void; onRemove: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{he.txForm.receipts}</span>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <Thumb key={id} id={id} onRemove={() => onRemove(id)} />
        ))}
        <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-muted">
          <Icon name="plus" size={20} />
          {he.txForm.addReceipt}
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAdd(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
