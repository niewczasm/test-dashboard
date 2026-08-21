"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FailuresOverTimePointDto, TrendTagDto } from "@/types/api";

const TOTAL_KEY = "__total__";

export function FailuresTrendChart({
  data,
  tags,
}: {
  data: FailuresOverTimePointDto[];
  tags: TrendTagDto[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (data.length === 0) {
    return (
      <div
        className="flex h-[260px] items-center justify-center text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        No data in the selected period
      </div>
    );
  }

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <LegendPill
            label="Total"
            color="var(--series-1)"
            active={!hidden.has(TOTAL_KEY)}
            onClick={() => toggle(TOTAL_KEY)}
          />
          {tags.map((tag) => (
            <LegendPill
              key={tag.id}
              label={tag.name}
              color={tag.color}
              active={!hidden.has(tag.id)}
              onClick={() => toggle(tag.id)}
            />
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            labelStyle={{ color: "var(--text-secondary)" }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#trendFill)"
            name="Total"
            dot={false}
            activeDot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", strokeWidth: 2 }}
            hide={hidden.has(TOTAL_KEY)}
          />
          {tags.map((tag) => (
            <Line
              key={tag.id}
              type="monotone"
              dataKey={(point: FailuresOverTimePointDto) => point.tagCounts[tag.id] ?? 0}
              stroke={tag.color}
              strokeWidth={2}
              dot={false}
              name={tag.name}
              activeDot={{ r: 3, fill: tag.color, stroke: "var(--surface-1)", strokeWidth: 2 }}
              hide={hidden.has(tag.id)}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity"
      style={{
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--text-muted)",
        border: `1px solid ${active ? `${color}55` : "var(--gridline)"}`,
        opacity: active ? 1 : 0.55,
      }}
      title={active ? `Hide ${label}` : `Show ${label}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: active ? color : "var(--text-muted)" }}
      />
      {label}
    </button>
  );
}
