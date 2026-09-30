import { formatAgorot } from '../../calc/money';
import { useSettings } from '../hooks';
import type { Tone } from '../format';

interface MoneyProps {
  agorot: number;
  /** Colors by meaning, always with a sign so color never carries meaning alone (SPEC 8). */
  tone?: Tone;
  className?: string;
  /** Force showing agorot even when the user hides them (e.g. edit screens). */
  exact?: boolean;
  /** Show "+" on positive amounts without coloring (e.g. on the purple header). */
  signed?: boolean;
}

export function Money({ agorot, tone = 'plain', className = '', exact = false, signed = false }: MoneyProps) {
  const settings = useSettings();
  const color = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : tone === 'transfer' ? 'text-transfer' : '';
  return (
    <span className={`num ${color} ${className}`}>
      {formatAgorot(agorot, { hideAgorot: !exact && settings?.hideAgorot, signed: signed || tone === 'income' })}
    </span>
  );
}
