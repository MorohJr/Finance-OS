import { useAttachmentUrl } from '../data';

/**
 * Institution mark (SPEC 8): the user's uploaded logo if any, otherwise the first letter on the
 * brand color. No brand logos are bundled with the app.
 */
export function Monogram({ name, color, size = 36, logoId }: { name: string; color?: string; size?: number; logoId?: string }) {
  const url = useAttachmentUrl(logoId);
  if (url) return <img src={url} alt="" aria-hidden="true" className="shrink-0 rounded-xl bg-white object-contain" style={{ width: size, height: size }} />;
  const letter = name.replace(/^(בנק|bank)\s+/i, '').trim().charAt(0) || '?';
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white" style={{ width: size, height: size, background: color ?? 'var(--brand)', fontSize: size * 0.45 }}>
      {letter}
    </span>
  );
}
