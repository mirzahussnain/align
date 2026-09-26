"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PublicChartDatum = {
  label: string;
  count: number;
  share: number;
};

export const PUBLIC_CHART_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#2563eb",
  "#8b5cf6",
  "#0e7490",
  "#4f46e5",
  "#a855f7",
  "#0369a1",
] as const;

export function distributionDomainMaximum(items: PublicChartDatum[]) {
  const largestShare = Math.max(0, ...items.map((item) => item.share));
  return Math.min(100, Math.max(10, Math.ceil(largestShare * 1.15)));
}

type ChartTooltipPayload = {
  payload?: PublicChartDatum;
};

export function AlignChartTooltip({
  active,
  payload,
  heading,
  noun,
  context,
}: {
  active?: boolean;
  payload?: readonly ChartTooltipPayload[];
  heading: string;
  noun: string;
  context: string;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="max-w-64 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {heading}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-950">
        {item.label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">
        {item.count.toLocaleString("en-GB")} {noun}
      </p>
      <p className="text-xs tabular-nums text-slate-500">
        {item.share}% {context}
      </p>
    </div>
  );
}

export function HorizontalDistributionChart({
  title,
  description,
  items,
  noun = "vacancies",
  context = "of sampled vacancies",
  scaleToData = false,
}: {
  title: string;
  description: string;
  items: PublicChartDatum[];
  noun?: string;
  context?: string;
  scaleToData?: boolean;
}) {
  const height = Math.max(136, items.length * 46 + 24);
  const domainMaximum = scaleToData ? distributionDomainMaximum(items) : 100;

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {items.length ? (
        <>
          <div className="mt-4 w-full" style={{ height }} aria-hidden="true">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 560, height }}
            >
              <BarChart
                data={items}
                layout="vertical"
                margin={{ top: 2, right: 42, bottom: 2, left: 0 }}
              >
                <XAxis type="number" domain={[0, domainMaximum]} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  width={118}
                  tick={{ fill: "#475569", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  content={
                    <AlignChartTooltip
                      heading={title}
                      noun={noun}
                      context={context}
                    />
                  }
                  isAnimationActive="auto"
                />
                <Bar
                  dataKey="share"
                  fill="#7c3aed"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={12}
                  isAnimationActive="auto"
                >
                  <LabelList
                    dataKey="share"
                    position="right"
                    formatter={(value: unknown) => `${String(value)}%`}
                    fill="#0f172a"
                    fontSize={12}
                    fontWeight={600}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only">
            {items.map((item) => (
              <li key={item.label}>
                {item.label}: {item.count.toLocaleString("en-GB")} {noun}, {item.share}% {context}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Not enough disclosed data in this view.
        </p>
      )}
    </section>
  );
}

export function DonutDistributionChart({
  title,
  description,
  items,
  noun,
  context,
  showLegend = true,
}: {
  title: string;
  description: string;
  items: PublicChartDatum[];
  noun: string;
  context: string;
  showLegend?: boolean;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string>();
  const [hoveredLabel, setHoveredLabel] = useState<string>();
  const activeLabel = hoveredLabel ?? selectedLabel;
  const activeItem = items.find((item) => item.label === activeLabel);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {items.length ? (
        <>
          <div className="mt-5 flex flex-col">
            <div className="h-64 min-w-0 w-full sm:h-72" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 560, height: 288 }}
              >
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="56%"
                    outerRadius="84%"
                    paddingAngle={items.length > 8 ? 0.35 : 1}
                    stroke="#ffffff"
                    strokeWidth={2}
                    onMouseEnter={(_, index) => setHoveredLabel(items[index]?.label)}
                    onMouseLeave={() => setHoveredLabel(undefined)}
                    onClick={(_, index) => setSelectedLabel(items[index]?.label)}
                    isAnimationActive="auto"
                  >
                    {items.map((item, index) => (
                      <Cell
                        key={item.label}
                        fill={PUBLIC_CHART_COLORS[index % PUBLIC_CHART_COLORS.length]}
                        fillOpacity={hoveredLabel && activeLabel !== item.label ? 0.5 : 1}
                        stroke={activeLabel === item.label ? "#0f172a" : "#ffffff"}
                        strokeWidth={activeLabel === item.label ? 2.5 : 2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <AlignChartTooltip
                        heading={title}
                        noun={noun}
                        context={context}
                      />
                    }
                    isAnimationActive="auto"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 min-w-0">
              {showLegend ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      aria-label={`${item.label}, ${item.count.toLocaleString("en-GB")} ${noun}, ${item.share}% ${context}`}
                      onFocus={() => setHoveredLabel(item.label)}
                      onBlur={() => setHoveredLabel(undefined)}
                      onMouseEnter={() => setHoveredLabel(item.label)}
                      onMouseLeave={() => setHoveredLabel(undefined)}
                      onClick={() => setSelectedLabel(item.label)}
                      className="flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200 motion-reduce:transition-none"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: PUBLIC_CHART_COLORS[index % PUBLIC_CHART_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 leading-4 text-slate-600">{item.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-950">{item.share}%</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <label className={`${showLegend ? "mt-4 " : ""}block text-xs font-semibold text-slate-600`}>
                All routes
                <select
                  value={selectedLabel ?? ""}
                  onChange={(event) => setSelectedLabel(event.target.value || undefined)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">Choose a route</option>
                  {items.map((item) => (
                    <option key={item.label} value={item.label}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {activeItem ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" role="status" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-slate-950">{activeItem.label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">
                    {activeItem.count.toLocaleString("en-GB")} {noun}
                  </p>
                  <p className="text-xs tabular-nums text-slate-500">{activeItem.share}% {context}</p>
                </div>
                {selectedLabel && !hoveredLabel ? (
                  <button
                    type="button"
                    onClick={() => setSelectedLabel(undefined)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <ul className="sr-only">
            {items.map((item) => (
              <li key={item.label}>
                {item.label}: {item.count.toLocaleString("en-GB")} {noun}, {item.share}% {context}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No chart data is available.</p>
      )}
    </section>
  );
}
