import React, { useState } from "react";
import { View } from "react-native";
import { Card, Chips, Txt, SegmentedControl } from "../ui";
import { LineChart } from "../charts";
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
import { theme } from "../../theme";

/**
 * Recorded answers over time: one point per day (the latest check-in that
 * day) placed at its real date; days without a check-in are gaps, never
 * zeros, and long breaks split the line. The summary describes the shown
 * days only and draws no conclusions.
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
    <Card>
      <Txt variant="overline" tone="secondary" header>
        Trends
      </Txt>
      <Chips
        values={metrics.map((m) => m.label)}
        value={label}
        onChange={(l) => {
          const next = metrics.find((m) => m.label === l)!.key;
          setMetric(next);
          setRange(defaultRange(pointsFor(entries, next), today));
        }}
      />
      <SegmentedControl
        label={`${label} range`}
        options={RANGES.map((r) => ({ value: r, label: r }))}
        value={range}
        onChange={(r) => setRange(r as Range)}
      />
      {metric !== "sleep" && (
        <Txt variant="caption" tone="secondary">
          {`1 ${scaleOf(metric).words[0]} · 5 ${scaleOf(metric).words[4]}`}
        </Txt>
      )}
      {shown.length > 1 ? (
        <LineChart
          label={`${label}, ${shown.length} days`}
          points={shown.map((p) => ({
            key: p.date,
            value: p.value,
            description:
              p.count > 1
                ? `${dayLabel(p.date)} · latest of ${p.count} check-ins`
                : dayLabel(p.date),
          }))}
          x={shown.map((p) => dayNumber(p.date))}
          breakOver={GAP_DAYS}
          resetKey={`${metric}|${range}`}
          format={format}
        />
      ) : (
        <Txt tone="secondary">
          {shown.length
            ? "One check-in in this range. Choose a longer range to see a trend."
            : "No check-ins in this range."}
        </Txt>
      )}
      {summary && (
        <View style={{ gap: theme.spacing.xs }}>
          <Txt tone="secondary" tabular>
            {summary}
          </Txt>
        </View>
      )}
    </Card>
  );
}
