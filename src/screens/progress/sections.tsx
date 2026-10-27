import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  CardHeader,
  FText,
  ForgeBarChart,
  ForgeCard,
  ForgeLineChart,
  ForgeSegments,
  Gradient,
  Metric,
  OutlineButton,
  StatStrip,
  pairFits,
} from "../../components/reforge";
import { useColors } from "../../components/ui";
import type { IconName } from "../../components/ui";
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
import {
  categoryLabel,
  compactNumber,
  estimateText,
  loadText,
  setText,
  signed,
} from "../../domain/progress/format";
import type { RecordEvent } from "../../domain/progress/strength";
import type { RecordGain } from "../../domain/presentation/records";
import { forge } from "../../theme";
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

// ---- Rows card ------------------------------------------------------------------

/**
 * A card whose body is full-width rows (`ForgeListRow` brings its own
 * padding): the header and any summary sit in a padded area above them.
 */
export function RowsCard({
  header,
  summary,
  children,
  testID,
}: {
  header: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <ForgeCard padding={0} gap={0} testID={testID}>
      <View
        style={{
          padding: forge.spacing.cardPadding,
          paddingBottom: forge.spacing.tight,
          gap: forge.spacing.group,
        }}
      >
        {header}
        {summary}
      </View>
      {children}
    </ForgeCard>
  );
}

// ---- PR highlight and all-time stats ---------------------------------------------

const reps = (n: number) => `${n.toLocaleString()} ${n === 1 ? "rep" : "reps"}`;

/** The record's own number, what it is, and how far it moved (P1). */
export function recordFigures(
  event: RecordEvent,
  gain: RecordGain | undefined,
  units: Units,
) {
  const category = event.categories[0]!;
  const label = categoryLabel[category];
  const figures =
    category === "heaviest"
      ? {
          value: loadText(event.heaviest!.weight, units),
          detail: `${label} · ${reps(event.heaviest!.reps)}`,
        }
      : category === "e1rm"
        ? {
            value: estimateText(event.e1rm!.value, units),
            detail: `${label} · from ${setText(event.e1rm!.set, units)}`,
          }
        : category === "reps-at-weight"
          ? {
              value: reps(event.repsAtWeight!.reps),
              detail: `${label} · at ${loadText(event.repsAtWeight!.weight, units)}`,
            }
          : { value: reps(event.mostReps!), detail: label };
  const delta = !gain
    ? undefined
    : category === "heaviest" || category === "e1rm"
      ? signed(loadIn(gain.delta, units), units)
      : `+${reps(gain.delta)}`;
  return { ...figures, delta };
}

/**
 * The newest personal record (decision P1): trophy, exercise, the record's
 * number, its gain over the best it beat, and the day. Opens the exercise;
 * the header opens every record. Without a record, an honest empty state.
 */
export function RecordHighlightCard({
  event,
  gain,
  name,
  units,
}: {
  event?: RecordEvent;
  gain?: RecordGain;
  name?: string;
  units: Units;
}) {
  const c = useColors();
  const header = (
    <CardHeader
      title="PR highlight"
      onPress={() => router.push("/records")}
      accessibilityLabel="PR highlight. Open all records"
    />
  );
  if (!event || !name)
    return (
      <ForgeCard testID="pr-highlight" style={{ flex: 1 }}>
        {header}
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Ionicons name="trophy-outline" size={26} color={c.text2} />
          <FText variant="body" tone="secondary" style={{ flex: 1 }}>
            No records yet. Beat a previous best and your newest record shows
            here.
          </FText>
        </View>
      </ForgeCard>
    );
  const f = recordFigures(event, gain, units);
  return (
    <ForgeCard testID="pr-highlight" variant="active" style={{ flex: 1 }}>
      <Gradient
        kind="radial"
        center={{ x: 0.9, y: 0.7 }}
        radius={{ x: 0.75, y: 0.9 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: 0.22 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
      {header}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}: ${f.value}, ${f.detail}${f.delta ? `, ${f.delta} over your previous best` : ""}, ${dayLabel(event.date)}. Open exercise`}
        onPress={() =>
          router.push({
            pathname: "/exercise",
            params: { id: event.exerciseId },
          })
        }
        style={({ pressed }) => ({
          flexDirection: "row",
          gap: 10,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons
          name="trophy"
          size={30}
          color={c.emberHot}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="cardTitle" weight="700" numberOfLines={2}>
            {name}
          </FText>
          <FText variant="cardMetric" numberOfLines={1} fit>
            {f.value}
          </FText>
          {f.delta && (
            <FText variant="cardTitle" weight="700" tone="accent">
              {f.delta}
            </FText>
          )}
          <FText variant="label" tone="secondary" numberOfLines={2}>
            {f.detail}
          </FText>
          <FText variant="label" tone="secondary">
            {`New personal record · ${dayLabel(event.date)}`}
          </FText>
        </View>
      </Pressable>
    </ForgeCard>
  );
}

/** "7h 32m", "45m", "120h": total training time, as the reference shows it. */
export function hoursText(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (h >= 100) return `${h.toLocaleString()}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
const spokenHours = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const part = (n: number, w: string) =>
    `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
  return [h ? part(h, "hour") : "", m || !h ? part(m, "minute") : ""]
    .filter(Boolean)
    .join(" ");
};

function StatLine({
  icon,
  value,
  unit,
  label,
  spoken,
}: {
  icon: IconName;
  value: string;
  unit?: string;
  label: string;
  spoken: string;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={c.emberHot}
        style={{ width: 24 }}
      />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <FText variant="statMetric" numberOfLines={1} fit>
            {value}
          </FText>
          {unit && (
            <FText variant="label" tone="secondary">
              {unit}
            </FText>
          )}
        </View>
        <FText variant="label" tone="secondary" numberOfLines={2}>
          {label}
        </FText>
      </View>
    </View>
  );
}

/**
 * Lifetime totals from the workout history: finished workouts (as You
 * counts them), total load volume (Progress's own definition, so it equals
 * the Training volume card over all time) and total training time (as You
 * sums it). The header opens Training history.
 */
export function AllTimeStatsCard({
  workouts,
  volumeKg,
  seconds,
  units,
}: {
  workouts: number;
  volumeKg: number;
  seconds: number;
  units: Units;
}) {
  const volume = Math.round(loadIn(volumeKg, units)).toLocaleString();
  return (
    <ForgeCard testID="all-time" style={{ flex: 1 }}>
      <CardHeader
        title="All-time stats"
        onPress={() => router.push("/history")}
        accessibilityLabel="All-time stats. Open training history"
      />
      <StatLine
        icon="barbell-outline"
        value={workouts.toLocaleString()}
        label="Workouts"
        spoken={`Total workouts: ${workouts.toLocaleString()}`}
      />
      <StatLine
        icon="flame-outline"
        value={volume}
        unit={units}
        label="Total volume"
        spoken={`Total volume: ${volume} ${units}`}
      />
      <StatLine
        icon="time-outline"
        value={hoursText(seconds)}
        label="Total training time"
        spoken={`Total training time: ${spokenHours(seconds)}`}
      />
    </ForgeCard>
  );
}

/** Two cards side by side where both fit (reference), stacked otherwise. */
export function CardPair({
  children,
  min = 170,
}: {
  children: [React.ReactNode, React.ReactNode];
  min?: number;
}) {
  const { width, fontScale } = useWindowDimensions();
  const side = pairFits(width - 2 * forge.spacing.margin, fontScale, min);
  return (
    <View
      testID="card-pair"
      style={{
        flexDirection: side ? "row" : "column",
        gap: forge.spacing.cardGap,
        alignItems: "stretch",
      }}
    >
      {children}
    </View>
  );
}
