import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomSheet } from '../components/BottomSheet';
import { primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useDemoMode } from '../data';
import { db } from '../../db/db';
import { exitDemo, loadDemo } from '../../services/demo/demo';
import { he } from '../strings.he';

const D = he.demo;

export function DemoSection() {
  const demo = useDemoMode();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function onLoad() {
    setConfirm(false);
    setError('');
    setStep(D.loading);
    try {
      await loadDemo(db, (s) => setStep(s));
      navigate('/');
    } catch {
      setError(D.failed);
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {demo ? (
        <>
          <p className="text-sm">{D.activeBody}</p>
          <button
            type="button"
            className={primaryBtn}
            onClick={async () => {
              setStep(D.exiting);
              try {
                await exitDemo(db);
                toast({ message: D.restored });
              } finally {
                setStep(null);
              }
            }}
          >
            {step ?? D.exit}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{D.body}</p>
          <button type="button" className={secondaryBtn} disabled={!!step} onClick={() => setConfirm(true)}>
            {step ?? D.load}
          </button>
          {step && (
            <p role="status" aria-live="polite" className="text-sm text-brand-text">
              {step}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <BottomSheet open={confirm} title={D.confirmTitle} onClose={() => setConfirm(false)}>
        <p className="mb-4 text-sm text-muted">{D.confirmBody}</p>
        <div className="flex gap-2">
          <button type="button" className={primaryBtn} onClick={() => void onLoad()}>
            {D.confirm}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setConfirm(false)}>
            {he.common.cancel}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
