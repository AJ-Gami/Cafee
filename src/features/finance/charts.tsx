import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatRM, formatRMCompact } from '../../game/money';
import type { HistoryPoint } from '../../game/reports';

/** Chart colours validated for CVD separation and contrast on the card surface (#fdfaf5). */
export const CHART_COLORS = {
  revenue: '#c47a32',
  profit: '#008a7c',
  loss: '#a3412f',
  cash: '#6b4e3b',
  grid: '#ebe2d4',
  axis: '#7f6250',
} as const;

const AXIS_TICK = { fill: CHART_COLORS.axis, fontSize: 11 };

interface TooltipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipRow[]; label?: string | number }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-espresso-800/10 bg-cream-50 px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-semibold text-espresso-700">Hari {String(label).replace('H', '')}</p>
      {payload.map((row) => (
        <p key={String(row.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: row.color }} aria-hidden="true" />
          <span className="tabular font-semibold text-espresso-800">{formatRM(Number(row.value ?? 0))}</span>
          <span className="text-espresso-600">{row.name}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; shape: 'bar' | 'line' }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-espresso-700">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={i.shape === 'bar' ? 'inline-block size-2.5 rounded-[3px]' : 'inline-block h-0.5 w-3.5 rounded'}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Revenue (bars) and net profit (line) share one ringgit axis. */
export function RevenueProfitChart({ data }: { data: HistoryPoint[] }) {
  return (
    <figure aria-label="Carta hasil jualan dan untung bersih harian">
      <ChartLegend
        items={[
          { label: 'Hasil jualan', color: CHART_COLORS.revenue, shape: 'bar' },
          { label: 'Untung bersih', color: CHART_COLORS.profit, shape: 'line' },
        ]}
      />
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatRMCompact(v)} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeOpacity={0.5} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,42,32,0.06)' }} />
            <Bar dataKey="revenueSen" name="Hasil jualan" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line
              dataKey="netProfitSen"
              name="Untung bersih"
              stroke={CHART_COLORS.profit}
              strokeWidth={2}
              dot={{ r: 4, fill: CHART_COLORS.profit, stroke: '#fdfaf5', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: '#fdfaf5', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CashChart({ data }: { data: HistoryPoint[] }) {
  return (
    <figure aria-label="Carta baki tunai pada akhir setiap hari">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} interval="preserveStartEnd" />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
              tickCount={4}
              tickFormatter={(v: number) => formatRMCompact(v)}
              domain={[(min: number) => Math.min(0, min), 'auto']}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }} />
            <Line
              dataKey="closingCashSen"
              name="Baki tunai"
              stroke={CHART_COLORS.cash}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: '#fdfaf5', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Compact net-profit columns for the dashboard; colour carries sign (profit vs loss). */
export function ProfitMiniChart({ data }: { data: HistoryPoint[] }) {
  return (
    <figure aria-label="Untung bersih 7 hari terakhir">
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatRMCompact(v)} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeOpacity={0.5} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,42,32,0.06)' }} />
            <Bar dataKey="netProfitSen" name="Untung bersih" radius={[4, 4, 4, 4]} maxBarSize={20} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.day} fill={d.netProfitSen >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
