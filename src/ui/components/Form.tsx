import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { caretAfterFormat, formatAmountInput } from '../format';

export const inputCls = 'min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text placeholder:text-muted/70 aria-[invalid=true]:border-expense';
export const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 font-medium text-on-brand active:bg-brand-strong disabled:opacity-50';
export const secondaryBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-soft px-5 font-medium text-brand-text';
export const dangerBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-danger-soft px-5 font-medium text-expense';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': error || hint ? descId : undefined })}
      {(error || hint) && (
        <p id={descId} className={`text-xs ${error ? 'text-expense' : 'text-muted'}`} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-full px-2 text-sm ${value === o.value ? 'bg-brand text-on-brand' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand-text after:absolute after:top-0.5 after:start-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:-translate-x-5"
      />
    </label>
  );
}

/**
 * Amount input: decimal keypad (SPEC 8), ₪ prefix, thousands separators added while typing
 * ("12500" → "12,500") with the caret kept in place. Parsing happens on submit.
 */
export function MoneyInput(props: { id: string; value: string; onChange: (v: string) => void; allowNegative?: boolean; 'aria-invalid'?: boolean; 'aria-describedby'?: string; autoFocus?: boolean }) {
  const { value, onChange, allowNegative, ...rest } = props;
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode={allowNegative ? 'text' : 'decimal'}
        autoComplete="off"
        dir="ltr"
        placeholder="0.00"
        value={formatAmountInput(value, allowNegative)}
        onChange={(e) => {
          const raw = e.target.value;
          const pos = e.target.selectionStart ?? raw.length;
          const meaningful = raw.slice(0, pos).replace(/[^\d.]/g, '').length;
          const formatted = formatAmountInput(raw, allowNegative);
          caret.current = caretAfterFormat(formatted, meaningful);
          onChange(formatted);
        }}
        className={`${inputCls} num ps-9 text-start text-lg`}
      />
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted" dir="ltr">
        ₪
      </span>
    </div>
  );
}
