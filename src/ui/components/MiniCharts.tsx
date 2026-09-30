/**
 * Small SVG charts for the dashboard. No chart library, so the home screen stays light.
 * Inputs are already-computed agorot; scaling to pixels is presentation only.
 * Time runs left to right (like the report charts), whatever the page direction.
 */

export const CHART_COLORS = ['var(--brand)', '#16A394', '#E0892B', '#D6456E', '#3A86D6', '#8E6BE8', '#6C9A1F', '#8A8A8A'];

function scale(values: readonly number[], height: number, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (v: number) => pad + (height - 2 * pad) * (1 - (v - min) / span);
}

function linePath(values: readonly number[], width: number, height: number): string {
  if (!values.length) return '';
  const y = scale(values, height);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}

/** Tiny trend line (account carousel, insights). */
export function Sparkline({ values, label, color = 'var(--income)', width = 96, height = 24 }: { values: readonly number[]; label: string; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className="block" preserveAspectRatio="none">
      <path d={linePath(values, width, height)} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Filled line (net worth, portfolio). */
export function AreaLine({ values, label, color = 'var(--brand)', height = 72 }: { values: readonly number[]; label: string; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 300;
  const d = linePath(values, w, height);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={label} preserveAspectRatio="none" direction="ltr">
      <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Stepped balance line with a zero line when the balance crosses it (forecast). */
export function StepLine({ values, label, height = 80 }: { values: readonly number[]; label: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 300;
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => 4 + (height - 8) * (1 - (v - min) / span);
  const step = w / (values.length - 1);
  let d = `M0 ${y(values[0]!).toFixed(1)}`;
  values.forEach((v, i) => {
    if (i) d += ` L${(i * step).toFixed(1)} ${y(values[i - 1]!).toFixed(1)} L${(i * step).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={label} preserveAspectRatio="none" direction="ltr">
      {min < 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--expense)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Two bars per month: income and expense. */
export function PairBars({ data, label, height = 72 }: { data: readonly { key: string; a: number; b: number; caption: string }[]; label: string; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div role="img" aria-label={label} dir="ltr">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d) => (
          <div key={d.key} className="flex flex-1 items-end justify-center gap-0.5" style={{ height }}>
            <div className="w-1/3 max-w-3 rounded-t bg-income" style={{ height: `${(d.a / max) * 100}%` }} />
            <div className="w-1/3 max-w-3 rounded-t bg-expense" style={{ height: `${(d.b / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-center text-[11px] text-muted">
        {data.map((d) => (
          <span key={d.key} className="num flex-1">
            {d.caption}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One bar per day of the month; days still ahead are shown as empty slots. */
export function DayBars({ values, totalDays, label, height = 60 }: { values: readonly number[]; totalDays: number; label: string; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={label} dir="ltr" className="flex items-end gap-[2px]" style={{ height }}>
      {Array.from({ length: totalDays }, (_, i) => {
        const v = values[i];
        return <div key={i} className={`flex-1 rounded-t-sm ${v === undefined ? 'bg-surface-2' : 'bg-brand'}`} style={{ height: v === undefined ? 4 : `${Math.max(3, (v / max) * 100)}%` }} />;
      })}
    </div>
  );
}

/** Donut of shares (bp, summing to about 10,000). */
export function Donut({ parts, label, size = 88 }: { parts: readonly { key: string; shareBp: number; color: string }[]; label: string; size?: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const lens = parts.map((p) => (p.shareBp / 10_000) * c);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg viewBox="0 0 88 88" width={size} height={size} role="img" aria-label={label} className="shrink-0">
      <circle cx={44} cy={44} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
      {parts.map((p, i) => (
        <circle key={p.key} cx={44} cy={44} r={r} fill="none" stroke={p.color} strokeWidth={14} strokeDasharray={`${lens[i]} ${c - lens[i]!}`} strokeDashoffset={-starts[i]!} transform="rotate(-90 44 44)" />
      ))}
    </svg>
  );
}

/** One horizontal bar split by share (asset allocation). */
export function StackBar({ parts, label }: { parts: readonly { key: string; shareBp: number; color: string }[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex h-3.5 overflow-hidden rounded-full bg-surface-2">
      {parts.map((p) => (
        <div key={p.key} style={{ width: `${p.shareBp / 100}%`, background: p.color }} />
      ))}
    </div>
  );
}
