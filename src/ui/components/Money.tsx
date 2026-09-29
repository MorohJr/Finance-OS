import { formatAgorot } from '../../calc/money';
import { useSettings } from '../hooks';

interface MoneyProps {
  agorot: number;
  /** Colors by meaning, always with a sign so color never carries meaning alone (SPEC 8). */
  tone?: 'income' | 'expense' | 'transfer' | 'plain';
  className?: string;
}

export function Money({ agorot, tone = 'plain', className = '' }: MoneyProps) {
  const settings = useSettings();
  const color = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : tone === 'transfer' ? 'text-transfer' : '';
  return (
    <span className={`num ${color} ${className}`}>
      {formatAgorot(agorot, { hideAgorot: settings?.hideAgorot, signed: tone === 'income' })}
    </span>
  );
}
