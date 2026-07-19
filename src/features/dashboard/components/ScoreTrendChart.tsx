'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ScorePoint {
  date: string;
  /** Score for a job-match analysis; null when this point is an ATS run. */
  jobMatch: number | null;
  /** Score for an ATS analysis; null when this point is a job-match run. */
  ats: number | null;
}

const SERIES = [
  { key: 'jobMatch', label: 'Job match', color: 'hsl(262 83% 58%)', fill: 'jobMatchFill' },
  { key: 'ats', label: 'ATS', color: 'hsl(199 89% 48%)', fill: 'atsFill' },
] as const;

interface TooltipPayload {
  active?: boolean;
  payload?: { dataKey: string; value: number | null }[];
  label?: string;
}

function ScoreTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload?.length) return null;

  // Only one series has a value at any given point — an analysis runs in one mode.
  const rows = SERIES.map((s) => ({
    ...s,
    value: payload.find((p) => p.dataKey === s.key)?.value ?? null,
  })).filter((r) => r.value !== null);

  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] text-neutral-500">{label}</p>
      {rows.map((r) => (
        <p key={r.key} className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
          {r.label}
          <span className="tabular-nums">{r.value}/100</span>
        </p>
      ))}
    </div>
  );
}

export default function ScoreTrendChart({ data }: { data: ScorePoint[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.fill} id={s.fill} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              dy={6}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={48}
            />
            <Tooltip content={<ScoreTooltip />} cursor={{ stroke: '#d1d5db' }} />

            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#${s.fill})`}
                // Runs of the two modes interleave, so each series is sparse — bridge the gaps.
                connectNulls
                dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#ffffff' }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
