import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  CardHeader,
  FText,
  ForgeBarChart,
  ForgeCard,
  ForgeLineChart,
  ForgeSegments,
  Metric,
  OutlineButton,
  StatStrip,
} from "../../components/reforge";
import { InfoButton } from "../../components/system";
import {
  GAP_DAYS,
  changeText,
  dayNumber,
  displayUnit,
  toDisplay,
  type Series,
} from "../../domain/measurements";
import {
  bodyweightOver,
  percentText,
} from "../../domain/presentation/bodyweight";
import { compactNumber } from "../../domain/progress/format";
import { rangeLabels, type RangeWindow } from "../../domain/progress/range";
import type { PeriodSummary } from "../../domain/progress/consistency";
import { loadIn } from "../../domain/workout-display";
import { dayLabel } from "../../domain/training-display";
import { volumeInfo } from "../../domain/progress/explain";

// Progress cards transformed to the approved reference (Phase 7.4D). Every
// value comes from existing calculations; the bodyweight change is the
// tested presentation helper of decision P1.

type Units = "kg" | "lb";

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const monthName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
/** "the last 4 weeks", "all time". */
export const rangePhrase = (w: Pick<RangeWindow, "key">) =>
  w.key === "all" ? "all time" : `the last ${rangeLabels[w.key].toLowerCase()}`;
const openMeasurements = () =>
  router.push({ pathname: "/journal", params: { kind: "measurement" } });
const oneDecimal = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });

// ---- Bodyweight ---------------------------------------------------------------

/**
 * The lifter's weigh-ins over the selected range: the latest weight, where
 * the range began, the change between them (ember whichever way: a gain is
 * not a failure, nor a loss a success), and the trend. `window` absent: all
 * time (the new-lifter screen, which has no range control).
 */
export function BodyweightCard({
  series,
  window,
  units,
}: {
  series?: Series;
  window?: RangeWindow;
  units: Units;
}) {
  const unit = displayUnit("mass", units);
  // All time is every weigh-in: Progress's own all-time window starts at the
  // first workout or plan, which may come after the first weigh-in.
  const v = bodyweightOver(
    series,
    window && window.key !== "all" ? window.from : undefined,
  );
  const shown = (kg: number) => toDisplay(kg, "kg", units);
  const phrase = window ? rangePhrase(window) : "all time";
  const change =
    v.change && v.start
      ? `${changeText(v.change.kg, "mass", units)} (${percentText(v.change.percent)})`
      : undefined;
  const header = (
    <CardHeader
      title="Bodyweight"
      onPress={openMeasurements}
      accessibilityLabel={`Bodyweight${change ? `, ${change} since ${dayLabel(v.start!.date)}` : ""}. Open body measurements`}
      trailing={
        change ? (
          <FText variant="label" weight="700" tone="accent" numberOfLines={1}>
            {change}
          </FText>
        ) : undefined
      }
    />
  );
  if (!v.latest)
    return (
      <ForgeCard testID="bodyweight-card">
        {header}
        <FText variant="body" tone="secondary">
          Log your bodyweight and Forge charts it here, range by range.
        </FText>
        <OutlineButton
          title="Log bodyweight"
          icon="add"
          onPress={openMeasurements}
        />
      </ForgeCard>
    );
  const long =
    v.points.length > 1 &&
    dayNumber(v.points[v.points.length - 1]!.date) -
      dayNumber(v.points[0]!.date) >
      330;
  return (
    <ForgeCard testID="bodyweight-card">
      {header}
      <StatStrip weights={[1.3, 1]}>
        <Metric
          value={oneDecimal(shown(v.latest.kg))}
          unit={unit}
          label={`Current · ${dayLabel(v.latest.date)}`}
        />
        {v.start && v.change ? (
          <Metric
            size="stat"
            value={oneDecimal(shown(v.start.kg))}
            unit={unit}
            label={`Start · ${dayLabel(v.start.date)}`}
          />
        ) : null}
      </StatStrip>
      {v.points.length ? (
        <ForgeLineChart
          label="Bodyweight trend"
          resetKey={window?.key ?? "all"}
          x={v.points.map((p) => dayNumber(p.date))}
          breakOver={GAP_DAYS}
          height={132}
          format={(kg) => `${oneDecimal(shown(kg))} ${unit}`}
          axisValue={shown}
          points={v.points.map((p) => ({
            key: p.date,
            value: p.kg,
            description:
              p.count > 1
                ? `${dayLabel(p.date)} · ${p.count} entries`
                : dayLabel(p.date),
            tick: long
              ? new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  year: "2-digit",
                })
              : shortDate(p.date),
          }))}
        />
      ) : (
        <FText variant="label" tone="secondary">
          {`No weigh-ins in ${phrase}.`}
        </FText>
      )}
      {v.points.length === 1 && (
        <FText variant="label" tone="secondary">
          Your trend line appears after your next weigh-in.
        </FText>
      )}
    </ForgeCard>
  );
}

// ---- Training volume ----------------------------------------------------------

export type VolumePeriod = {
  start: string;
  workingSets: number;
  /** Kilograms (weight × reps of working sets with external load). */
  loadVolume: number;
};

/**
 * The range's training, either as load (Σ weight × reps, the lifter's unit)
 * or as completed workouts, with the same weekly or monthly buckets as the
 * rest of Progress. Working sets stay in each bar's description.
 */
export function TrainingVolumeCard({
  volume,
  workouts,
  window,
  units,
}: {
  /** `volumeBuckets` over the range's buckets. */
  volume: VolumePeriod[];
  /** `bucketSummaries` over the same buckets. */
  workouts: PeriodSummary[];
  window: RangeWindow;
  units: Units;
}) {
  const [mode, setMode] = useState<"volume" | "workouts">("volume");
  const period = (start: string) =>
    window.bucket === "week" ? `Week of ${shortDate(start)}` : monthName(start);
  const tick = (start: string) =>
    window.bucket === "week"
      ? shortDate(start)
      : new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
        });
  const load = volume.reduce((n, p) => n + p.loadVolume, 0);
  const sets = volume.reduce((n, p) => n + p.workingSets, 0);
  const done = workouts.reduce((n, p) => n + p.completed, 0);
  const phrase = rangePhrase(window);
  const showLoad = mode === "volume";
  const total = showLoad ? Math.round(loadIn(load, units)) : done;
  const empty = showLoad ? sets === 0 : done === 0;
  return (
    <ForgeCard testID="volume-card">
      <CardHeader
        title="Training volume"
        trailing={
          <InfoButton
            title="How volume is counted"
            paragraphs={volumeInfo}
            label="How volume is counted"
          />
        }
      />
      <ForgeSegments
        accessibilityLabel="Training volume measure"
        options={[
          { value: "volume", label: "Volume" },
          { value: "workouts", label: "Workouts" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={{ gap: 2 }}>
        <Metric
          value={total.toLocaleString()}
          unit={showLoad ? units : undefined}
          label={
            showLoad
              ? `Total volume · ${phrase}`
              : `${done === 1 ? "Workout" : "Workouts"} · ${phrase}`
          }
          delta={showLoad && sets > 0 ? plural(sets, "working set") : undefined}
        />
      </View>
      {empty ? (
        <FText variant="label" tone="secondary">
          {showLoad
            ? `No working sets in ${phrase}.`
            : `No finished workouts in ${phrase}.`}
        </FText>
      ) : showLoad ? (
        <ForgeBarChart
          key="volume"
          label={`Volume by ${window.bucket}`}
          format={(v) => `${compactNumber(v)} ${units}`}
          bars={volume.map((p) => ({
            key: p.start,
            value: Math.round(loadIn(p.loadVolume, units)),
            description: `${period(p.start)} · ${compactNumber(loadIn(p.loadVolume, units))} ${units} · ${plural(p.workingSets, "working set")}`,
            tick: tick(p.start),
          }))}
          startLabel={tick(volume[0]!.start)}
          endLabel={window.bucket === "week" ? "This week" : "This month"}
        />
      ) : (
        <ForgeBarChart
          key="workouts"
          label={`Workouts completed by ${window.bucket}`}
          format={(n) => plural(n, "workout")}
          bars={workouts.map((p) => ({
            key: p.start,
            value: p.completed,
            description: `${period(p.start)} · ${plural(p.completed, "workout")}`,
            tick: tick(p.start),
          }))}
          startLabel={tick(workouts[0]!.start)}
          endLabel={window.bucket === "week" ? "This week" : "This month"}
        />
      )}
    </ForgeCard>
  );
}
