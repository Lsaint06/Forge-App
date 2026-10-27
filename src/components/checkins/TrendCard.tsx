import React, { useState } from "react";
import {
  FText,
  ForgeCard,
  ForgeChips,
  ForgeLineChart,
  ForgeSegments,
} from "../reforge";
import {
  GAP_DAYS,
  RANGES,
  dayNumber,
  defaultRange,
  inRange,
  pointsFor,
  rangeSummary,
  scaleOf,
  sleepText,
  type Checkin,
  type Metric,
  type Range,
} from "../../domain/checkins";
import { dayLabel } from "../../domain/training-display";

/** The range segments' spoken names ("3M" reads as "3 months"). */
const SPOKEN: Record<string, string> = {
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
  All: "All time",
};

/**
 * Recorded answers over time (REFORGE since Phase 7.5G.2): one point per day
 * (the latest check-in that day) placed at its real date; days without a
 * check-in are gaps, never zeros, and long breaks split the line. The
 * summary describes the shown days only and draws no conclusions.
 */
export function TrendCard({
  entries,
  metrics,
  today,
}: {
  entries: Checkin[];
  metrics: { key: Metric; label: string }[];
  today: string;
}) {
  const [metric, setMetric] = useState<Metric>(metrics[0]!.key);
  const all = pointsFor(entries, metric);
  const [range, setRange] = useState<Range>(() => defaultRange(all, today));
  const shown = inRange(all, today, range);
  const label = metrics.find((m) => m.key === metric)!.label;
  const summary = rangeSummary(shown, metric);
  const format = (v: number) =>
    metric === "sleep"
      ? (sleepText(v) ?? "")
      : `${Math.round(v * 10) / 10} · ${scaleOf(metric).words[Math.round(v) - 1] ?? ""}`;
  return (
    <ForgeCard testID="recovery-trends" gap={12}>
      <FText variant="overline" tone="secondary" header>
        Trends
      </FText>
      <ForgeChips
        values={metrics.map((m) => m.label)}
        value={label}
        onChange={(l) => {
          const next = metrics.find((m) => m.label === l)!.key;
          setMetric(next);
          setRange(defaultRange(pointsFor(entries, next), today));
        }}
      />
      <ForgeSegments
        accessibilityLabel={`${label} range`}
        options={RANGES.map((r) => ({
          value: r,
          label: r,
          accessibilityLabel: SPOKEN[r] ?? r,
        }))}
        value={range}
        onChange={(r) => setRange(r as Range)}
      />
      {metric !== "sleep" && (
        <FText variant="label" tone="secondary">
          {`1 ${scaleOf(metric).words[0]} · 5 ${scaleOf(metric).words[4]}`}
        </FText>
      )}
      {shown.length > 1 ? (
        <ForgeLineChart
          label={`${label}, ${shown.length} days`}
          points={shown.map((p) => ({
            key: p.date,
            value: p.value,
            description:
              p.count > 1
                ? `${dayLabel(p.date)} · latest of ${p.count} check-ins`
                : dayLabel(p.date),
            tick: new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
          }))}
          x={shown.map((p) => dayNumber(p.date))}
          breakOver={GAP_DAYS}
          resetKey={`${metric}|${range}`}
          format={format}
        />
      ) : (
        <FText variant="body" tone="secondary">
          {shown.length
            ? "One check-in in this range. Choose a longer range to see a trend."
            : "No check-ins in this range."}
        </FText>
      )}
      {summary && (
        <FText variant="label" tone="secondary">
          {summary}
        </FText>
      )}
    </ForgeCard>
  );
}
