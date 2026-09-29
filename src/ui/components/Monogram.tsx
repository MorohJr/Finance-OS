/** Institution monogram: first letter on the brand color (SPEC 8: no bundled brand logos). */
export function Monogram({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const letter = name.replace(/^(בנק|bank)\s+/i, '').trim().charAt(0) || '?';
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{ width: size, height: size, background: color ?? 'var(--brand)', fontSize: size * 0.45 }}
    >
      {letter}
    </span>
  );
}
