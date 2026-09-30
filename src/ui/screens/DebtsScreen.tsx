import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Segmented, primaryBtn } from '../components/Form';
import { ProgressBar } from '../components/ProgressBar';
import { useLendings, useLoans, useSpread } from '../data';
import { monthlyDebt, yearlyDebt } from '../../calc/loans';
import { currentMonthIL, formatDisplayDate, todayIL } from '../../calc/dates';
import { sumAgorot } from '../../calc/money';
import { he } from '../strings.he';

const D = he.debts;

export function DebtsScreen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'given' ? 'given' : 'taken';
  const loans = useLoans();
  const lendings = useLendings();
  const spread = useSpread();
  const today = todayIL();
  const statuses = (loans ?? []).map((l) => l.status);
  const charges = spread?.charges ?? [];
  const activeLoans = (loans ?? []).filter((l) => l.status.status !== 'paid_off');
  const doneLoans = (loans ?? []).filter((l) => l.status.status === 'paid_off');

  return (
    <>
      <ScreenHeader title={D.title} back />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Segmented
          label={D.title}
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[
            { value: 'taken', label: D.taken },
            { value: 'given', label: D.given },
          ]}
        />

        {tab === 'taken' ? (
          <>
            <section className="grid grid-cols-3 gap-2 rounded-card bg-brand p-4 text-on-brand">
              <div>
                <p className="text-xs text-on-brand-muted">{D.monthlyTotal}</p>
                <Money agorot={monthlyDebt(statuses, charges, currentMonthIL())} className="font-bold" />
              </div>
              <div>
                <p className="text-xs text-on-brand-muted">{D.yearlyTotal}</p>
                <Money agorot={yearlyDebt(statuses, charges, today)} className="font-bold" />
              </div>
              <div>
                <p className="text-xs text-on-brand-muted">{D.remainingTotal}</p>
                <Money agorot={sumAgorot(activeLoans.map((l) => l.status.remainingPrincipal))} className="font-bold" />
              </div>
            </section>
            <Link to="/debts/loans/new" className={primaryBtn}>
              <Icon name="plus" size={18} />
              {D.addLoan}
            </Link>
            {activeLoans.length === 0 && <p className="text-center text-sm text-muted">{D.emptyTaken}</p>}
            {[...activeLoans, ...doneLoans].map(({ loan, status }) => (
              <Link key={loan.id} to={`/debts/loans/${loan.id}`} className={`flex flex-col gap-2 rounded-card border border-line bg-surface p-4 ${status.status === 'paid_off' ? 'opacity-60' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{loan.name}</span>
                  <span className={`text-xs ${status.status === 'overdue' ? 'text-expense' : 'text-muted'}`}>{D.status[status.status]}</span>
                </div>
                <ProgressBar usedBp={status.progressBp} state="ok" label={loan.name} />
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    {D.remaining} <Money agorot={status.remainingPrincipal} className="text-text" />
                  </span>
                  {status.nextPayment && (
                    <span className="text-muted">
                      <Money agorot={status.nextPayment.payment} className="text-text" /> · <span className="num">{formatDisplayDate(status.nextPayment.date)}</span>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </>
        ) : (
          <>
            <section className="rounded-card bg-brand p-4 text-on-brand">
              <p className="text-xs text-on-brand-muted">{D.toCollect}</p>
              <Money agorot={sumAgorot((lendings ?? []).map((l) => l.status.remaining))} className="text-2xl font-bold" />
            </section>
            <Link to="/debts/lendings/new" className={primaryBtn}>
              <Icon name="plus" size={18} />
              {D.addLending}
            </Link>
            {(lendings ?? []).length === 0 && <p className="text-center text-sm text-muted">{D.emptyGiven}</p>}
            {(lendings ?? []).map(({ lending, status }) => (
              <Link key={lending.id} to={`/debts/lendings/${lending.id}`} className={`flex flex-col gap-2 rounded-card border border-line bg-surface p-4 ${status.isPaidOff ? 'opacity-60' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{lending.borrowerName}</span>
                  <span className="text-xs text-muted">{status.isPaidOff ? D.paidOff : formatDisplayDate(lending.date)}</span>
                </div>
                <ProgressBar usedBp={status.progressBp} state="ok" label={lending.borrowerName} />
                <div className="flex justify-between text-sm text-muted">
                  <span>
                    {D.repaid} <Money agorot={status.repaid} className="text-text" />
                  </span>
                  <span>
                    {D.toCollect} <Money agorot={status.remaining} className="text-text" />
                  </span>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  );
}
