import React, { useState } from "react";
import { View } from "react-native";
import { Card, Txt, TextButton, SegmentedControl } from "../ui";
import { LineChart } from "../charts";
import {
  GAP_DAYS,
  RANGES,
  changeText,
  dayNumber,
  defaultRange,
  displayUnit,
  inRange,
  overRange,
  sincePrevious,
  toDisplay,
  valueText,
  type Range,
  type Series,
  type Units,
} from "../../domain/measurements";
import { dayTitle } from "../../domain/calendar-dates";
import { dayLabel } from "../../domain/training-display";
import { theme } from "../../theme";

const RANGE_WORDS: Record<Range, string> = {
  "1M": "in the last month",
  "3M": "in 3 months",
  "6M": "in 6 months",
  "1Y": "in the last year",
  All: "since",
};

/**
 * One measurement at a glance: the latest value and day, changes measured
 * only between real entries, and a date-spaced line for a chosen range.
 * Changes are stated plainly; no direction is presented as good or bad.
 */
export function SeriesCard({
  series: s,
  units,
  today,
  onLog,
  showName = true,
}: {
  series: Series;
  units: Units;
  today: string;
  /** A "Log …" action in the card (left out when the screen offers one). */
  onLog?: () => void;
  /** Off when the screen title already names the measurement. */
  showName?: boolean;
}) {
  const [range, setRange] = useState<Range>(() => defaultRange(s, today));
  const latest = s.days[s.days.length - 1]!;
  const previous = sincePrevious(s);
  const over = overRange(s, today, range);
  const shown = inRange(s, today, range);
  const unit = displayUnit(s.family, units);
  const lines = [
    previous &&
      `${changeText(previous.delta, s.family, units)} since ${dayTitle(previous.since, today)}`,
    over &&
      range !== "All" &&
      over.since !== previous?.since &&
      `${changeText(over.delta, s.family, units)} ${RANGE_WORDS[range]}`,
    over &&
      range === "All" &&
      over.since !== previous?.since &&
      `${changeText(over.delta, s.family, units)} since ${dayLabel(over.since)}`,
  ].filter(Boolean) as string[];
  return (
    <Card>
      <View style={{ gap: 2 }}>
        {showName && (
          <Txt variant="overline" tone="secondary" header>
            {s.name}
          </Txt>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: theme.spacing.sm,
          }}
        >
          <Txt variant="metric" tabular>
            {valueText(latest.value, s.family, units)}
          </Txt>
          <Txt variant="caption" tone="secondary">
            {latest.count > 1
              ? `${dayTitle(latest.date, today)} · ${latest.count} entries`
              : dayTitle(latest.date, today)}
          </Txt>
        </View>
        {lines.map((l) => (
          <Txt key={l} tone="secondary" tabular>
            {l}
          </Txt>
        ))}
      </View>
      {s.days.length > 1 ? (
        <>
          <SegmentedControl
            label={`${s.name} range`}
            options={RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={(r) => setRange(r as Range)}
          />
          {shown.length > 1 ? (
            <LineChart
              label={`${s.name} trend`}
              points={shown.map((d) => ({
                key: d.date,
                value: toDisplay(d.value, d.entry.data.unit, units),
                description:
                  d.count > 1
                    ? `${dayLabel(d.date)} · ${d.count} entries`
                    : dayLabel(d.date),
              }))}
              x={shown.map((d) => dayNumber(d.date))}
              breakOver={GAP_DAYS}
              resetKey={`${s.key}|${range}`}
              format={(v) =>
                `${Math.round(v * 10) / 10}${unit === "%" ? " %" : ` ${unit}`}`
              }
            />
          ) : (
            <Txt tone="secondary">
              {shown.length
                ? "One entry in this range. Choose a longer range to see the trend."
                : "No entries in this range."}
            </Txt>
          )}
        </>
      ) : (
        <Txt tone="secondary">
          {`Log ${s.bodyweight ? "another weigh-in" : `${s.name.toLowerCase()} again`} on another day to see how it changes.`}
        </Txt>
      )}
      {onLog && (
        <TextButton
          title={s.bodyweight ? "Log weight" : `Log ${s.name}`}
          icon="add"
          accessibilityLabel={`Log ${s.name}`}
          onPress={onLog}
        />
      )}
    </Card>
  );
}
