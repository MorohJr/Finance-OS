import { useNavigate } from 'react-router';
import { Icon } from './Icon';
import { he } from '../strings.he';

export function ScreenHeader({ title, back = false }: { title: string; back?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="pt-safe sticky top-0 z-10 bg-bg/95 backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 px-4">
        {back && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ms-2 flex size-11 items-center justify-center rounded-full text-brand-text active:bg-brand-soft"
            aria-label={he.common.back}
          >
            <Icon name="back" />
          </button>
        )}
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
    </header>
  );
}
