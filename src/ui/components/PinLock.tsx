import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useSettings } from '../hooks';
import { shouldLock, verifyPin } from '../../services/pin';
import { he } from '../strings.he';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
const UNLOCK_EVENT = 'finance-os:unlocked';

/** Setting a new PIN counts as unlocked for this session; it locks next launch or after 5 minutes away. */
export function markUnlocked(): void {
  window.dispatchEvent(new Event(UNLOCK_EVENT));
}

/**
 * Lock screen (SPEC 3.4, 12): shown at launch when a PIN is set, and after 5 minutes in the background.
 * It hides the content, it doesn't encrypt it.
 */
export function PinLock() {
  const settings = useSettings();
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const enabled = !!settings?.pinHash;

  useEffect(() => {
    const onUnlock = () => setLocked(false);
    window.addEventListener(UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(UNLOCK_EVENT, onUnlock);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (shouldLock(hiddenAt.current, Date.now())) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!settings || !enabled || !locked) return null;

  async function submit(value: string) {
    if (value.length < 4 || !settings?.pinHash || !settings.pinSalt) return;
    if (await verifyPin(value, settings.pinHash, settings.pinSalt)) {
      setLocked(false);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  }

  function press(k: string) {
    setError(false);
    if (k === '⌫') setPin((p) => p.slice(0, -1));
    else if (k && pin.length < 6) setPin(pin + k);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={he.pin.enter} className="pt-safe pb-safe fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-brand px-6 text-on-brand">
      <Icon name="lock" size={36} />
      <p className="text-lg font-medium">{he.pin.enter}</p>
      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`size-3.5 rounded-full border-2 border-white ${i < pin.length ? 'bg-white' : ''}`} />
        ))}
      </div>
      <p role="alert" className="h-5 text-sm text-on-brand-muted">
        {error ? he.pin.wrong : ''}
      </p>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3" dir="ltr">
        {KEYS.map((k, i) =>
          k ? (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              aria-label={k === '⌫' ? he.pin.delete : k}
              className="num flex h-16 items-center justify-center rounded-full bg-white/15 text-2xl active:bg-white/30"
            >
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <button type="button" onClick={() => void submit(pin)} disabled={pin.length < 4} className="min-h-12 w-full max-w-xs rounded-full bg-white font-medium text-brand disabled:opacity-40">
        {he.common.continue}
      </button>
    </div>
  );
}
