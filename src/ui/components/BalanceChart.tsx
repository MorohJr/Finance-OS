import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAgorot } from '../../calc/money';
import { formatDisplayDate } from '../../calc/dates';

/** Step chart of daily closing balances. Loaded lazily so Recharts stays out of the main bundle. */
export default function BalanceChart({ points }: { points: { date: string; balance: number }[] }) {
  const data = points.map((p) => ({ date: p.date, balance: p.balance }));
  return (
    <div className="h-44 w-full" dir="ltr" role="img" aria-label="גרף יתרה">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => [formatAgorot(Number(v)), '']}
            labelFormatter={(d) => formatDisplayDate(String(d))}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }}
            separator=""
          />
          <Area type="stepAfter" dataKey="balance" stroke="var(--brand-text)" strokeWidth={2} fill="url(#balanceFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
