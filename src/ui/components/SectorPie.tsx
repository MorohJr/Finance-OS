import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatAgorot, formatBp } from '../../calc/money';

/** Categorical palette tuned to the purple brand; order matters, not meaning. */
const COLORS = ['#26338C', '#16A394', '#E0892B', '#D6456E', '#3A86D6', '#8E6BE8', '#6C9A1F', '#B8860B', '#C2362F', '#2E7D6B', '#7A6F9B', '#E06AA6', '#4F5D75', '#A0522D', '#8A8A8A'];

export default function SectorPie({ data }: { data: { name: string; value: number; weightBp: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-44 w-full" dir="ltr" role="img" aria-label="התפלגות לפי סקטור">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={1} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--surface)" />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [formatAgorot(Number(v)), String(n)]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="num text-muted">{formatBp(d.weightBp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
