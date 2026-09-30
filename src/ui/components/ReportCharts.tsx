import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAgorot } from '../../calc/money';
import { formatDisplayMonth } from '../../calc/dates';

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' };
const axisTick = { fill: 'var(--muted)', fontSize: 11 };
const shekels = (v: number) => (Math.abs(v) >= 100_000_00 ? `${Math.round(v / 100_000_00)}M` : Math.abs(v) >= 100_000 ? `${Math.round(v / 100_000)}K` : String(Math.round(v / 100)));

/** Income vs expense per month. Values are agorot; labels are formatted, never computed on. */
export function TrendChart({ data, labels }: { data: { month: string; income: number; expense: number }[]; labels: { income: string; expense: string } }) {
  return (
    <div className="h-56 w-full" dir="ltr" role="img" aria-label={`${labels.income} / ${labels.expense}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={shekels} tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip formatter={(v, n) => [formatAgorot(Number(v)), String(n)]} labelFormatter={(m) => formatDisplayMonth(String(m))} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name={labels.income} fill="var(--income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" name={labels.expense} fill="var(--expense)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthChart({ data, label }: { data: { month: string; netWorth: number }[]; label: string }) {
  return (
    <div className="h-48 w-full" dir="ltr" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatDisplayMonth(m)} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={shekels} tick={axisTick} axisLine={false} tickLine={false} width={40} domain={['auto', 'auto']} />
          <Tooltip formatter={(v) => [formatAgorot(Number(v)), label]} labelFormatter={(m) => formatDisplayMonth(String(m))} contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="netWorth" stroke="var(--brand-text)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default { TrendChart, NetWorthChart };
