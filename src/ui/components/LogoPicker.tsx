import { Monogram } from './Monogram';
import { secondaryBtn } from './Form';
import { db } from '../../db/db';
import { saveAttachment } from '../../services/attachments';
import { he } from '../strings.he';

/**
 * Image picker for an institution, account or card mark. The image stays on the device as an
 * attachment (iron rule 7); `fallbackLogoId` shows what appears when no own image is set.
 */
export function LogoPicker({ name, color, value, onChange, fallbackLogoId, hint }: { name: string; color?: string; value?: string; onChange: (id: string | undefined) => void; fallbackLogoId?: string; hint: string }) {
  const I = he.institutions;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{I.logo}</span>
      <div className="flex items-center gap-3">
        <Monogram name={name || '?'} color={color} size={56} logoId={value ?? fallbackLogoId} />
        <label className={`${secondaryBtn} cursor-pointer`}>
          {I.pickLogo}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange(await saveAttachment(db, f));
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <button type="button" className="min-h-11 px-2 text-sm text-muted" onClick={() => onChange(undefined)}>
            {I.removeLogo}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
