import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { NUTRITION_TODAY } from "../navigation";
import { Ionicons } from "@expo/vector-icons";
import { Txt, Sheet, useColors } from "../components/ui";
import {
  BadgePill,
  CardHeader,
  CtaButton,
  FText,
  ForgeCard,
  ForgeChips,
  ForgeEmpty,
  ForgeListRow,
  ForgeProgress,
  ForgeScreen,
  ForgeBarChart,
  ForgeLineChart,
  ForgeSearchField,
  ForgeSegments,
  Metric as ForgeMetric,
  OutlineButton,
  SectionLabel,
  StatStrip,
} from "../components/reforge";
import { ListRow, ListSection, InfoButton } from "../components/system";
import { Legend } from "../components/charts";
import { AchievementCard } from "../components/design";
import { planStatus } from "../components/PlanRow";
import { useRepo, useApp } from "../state";
import { localDate } from "../domain/types";
import { achievements, elapsedSeconds, summary } from "../domain/metrics";
import { programAdherence } from "../domain/analytics";
import {
  GAP_DAYS,
  dayNumber,
  displayUnit,
  seriesOf,
  toDisplay,
} from "../domain/measurements";
import { keepSegmentsTogether, loadIn } from "../domain/workout-display";
import {
  buckets,
  inWindow,
  rangeLabels,
  rangeWindow,
  weekStarts,
  type RangeKey,
  type RangeWindow,
} from "../domain/progress/range";
import {
  bucketSummaries,
  consistency,
  weekSummaries,
  type PeriodSummary,
} from "../domain/progress/consistency";
import { muscleSets, volumeBuckets } from "../domain/progress/volume";
import {
  compareLatest,
  defaultMetric,
  progressionSeries,
  type Metric,
} from "../domain/progress/strength";
import {
  estimateText,
  loadText,
  recordHeadline,
  setText,
  signed,
} from "../domain/progress/format";
import {
  consistencyInput,
  firstActivity,
  progressModel,
  type ExerciseProgress,
  type ProgressModel,
} from "../data/progress";
import { dayLabel, longDayLabel } from "../domain/training-display";
import {
  consistencyInfo,
  recordInfo,
  strengthInfo,
} from "../domain/progress/explain";
import { forge } from "../theme";
import { TitleBlock } from "./home/sections";
import { homeClock, planContext } from "./home/model";
import {
  AllTimeStatsCard,
  BodyweightCard,
  CardPair,
  RecordHighlightCard,
  RowsCard,
  TrainingVolumeCard,
  rangePhrase,
} from "./progress/sections";
import { latestRecord, recordGain } from "../domain/presentation/records";

// Progress (REFORGE, Phases 7.4B–E; analytics from Phase 5): am I showing up,
// am I getting stronger, what have I accomplished. Every number is derived from stored workouts and plans on
// demand; see docs/PROGRESS_METRICS.md.

type Units = "kg" | "lb";

/** The reference's short range labels; screen readers hear `rangeLabels`. */
const SHORT_RANGE: Record<RangeKey, string> = {
  "4w": "4W",
  "12w": "12W",
  "1y": "1Y",
  all: "All",
};

const monthName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
/** An axis date for a week ("Oct 5") or a month ("Oct"). */
const tickOf = (date: string, w: RangeWindow) =>
  w.bucket === "week"
    ? shortDate(date)
    : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
      });
const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const periodName = (p: PeriodSummary, w: RangeWindow) =>
  w.bucket === "week" ? `Week of ${shortDate(p.start)}` : monthName(p.start);
/** Every logged session, for lifetime load volume. */
const ALL_TIME = [{ start: "0000-01-01", end: "9999-12-31" }];

function SectionTitle({ title }: { title: string }) {
  return <SectionLabel title={title} />;
}

/** A card header with its "How … works" sheet. */
function InfoHeader({
  title,
  info,
}: {
  title: string;
  info?: { title: string; paragraphs: string[] };
}) {
  return (
    <CardHeader
      title={title}
      trailing={
        info && (
          <InfoButton
            title={info.title}
            paragraphs={info.paragraphs}
            label={info.title}
          />
        )
      }
    />
  );
}

/**
 * Showing up: the range's finished workouts, plan adherence (or active
 * weeks without a plan) and the bars against what was planned. The range's
 * figures that used to sit in the Overview strip live here (7.4E).
 */
function Consistency({
  periods,
  window,
  summaryText,
  anyPlan,
  stats,
}: {
  periods: PeriodSummary[];
  window: RangeWindow;
  summaryText: string;
  anyPlan: boolean;
  stats: { value: string; label: string; detail?: string }[];
}) {
  const c = useColors();
  const describe = (p: PeriodSummary) =>
    [
      periodName(p, window),
      plural(p.completed, "workout"),
      ...(p.planned ? [`${p.onPlan} of ${p.planned} planned`] : []),
      ...(p.skipped ? [`${p.skipped} skipped`] : []),
      ...(p.missed ? [`${p.missed} missed`] : []),
    ].join(" · ");
  return (
    <ForgeCard testID="consistency-card">
      <InfoHeader
        title="Consistency"
        info={{
          title: "How consistency is counted",
          paragraphs: consistencyInfo,
        }}
      />
      <StatStrip minColumn={84}>
        {stats.map((s) => (
          <ForgeMetric
            key={s.label}
            size="stat"
            value={s.value}
            label={s.label}
            delta={s.detail}
          />
        ))}
      </StatStrip>
      <FText variant="label" tone="secondary">
        {summaryText}
      </FText>
      <ForgeBarChart
        label={`Workouts by ${window.bucket}`}
        format={(n) => plural(n, "workout")}
        bars={periods.map((p) => ({
          key: p.start,
          value: p.completed,
          ...(p.planned ? { target: p.planned } : {}),
          description: describe(p),
          tick: tickOf(p.start, window),
        }))}
        startLabel={
          window.bucket === "week"
            ? shortDate(periods[0]!.start)
            : monthName(periods[0]!.start)
        }
        endLabel={window.bucket === "week" ? "This week" : "This month"}
      />
      {anyPlan && (
        <Legend
          items={[
            { label: "Completed", color: c.emberHot },
            { label: "Planned", color: c.text3, outline: true },
          ]}
        />
      )}
    </ForgeCard>
  );
}

function ExercisePicker({
  visible,
  onClose,
  exercises,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  exercises: ExerciseProgress[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = exercises.filter((e) =>
    e.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose an exercise"
      dismissOnBackdrop
    >
      {exercises.length > 8 && (
        <ForgeSearchField
          label="Search your exercises"
          value={query}
          onChangeText={setQuery}
          placeholder="Bench, squat, row…"
        />
      )}
      <ForgeCard padding={0} gap={0}>
        {shown.map((e, i) => (
          <ForgeListRow
            key={e.id}
            icon="barbell-outline"
            title={e.name}
            description={`${plural(e.bests.length, "session")} · last ${dayLabel(e.bests.at(-1)!.date)}`}
            divider={i > 0}
            onPress={() => {
              onPick(e.id);
              onClose();
            }}
          />
        ))}
      </ForgeCard>
      {!shown.length && (
        <FText variant="body" tone="secondary">
          {`No logged exercise matches “${query}”.`}
        </FText>
      )}
    </Sheet>
  );
}

function Strength({
  model,
  window,
  units,
}: {
  model: ProgressModel;
  window: RangeWindow;
  units: Units;
}) {
  const c = useColors();
  const ranked = [...model.exercises.values()]
    .filter((e) => e.kind !== "none")
    .map((e) => ({
      e,
      inRange: e.bests.filter((b) => inWindow(b.date, window)).length,
      heaviest: e.records.e1rm?.value ?? e.records.heaviest?.weight ?? 0,
      last: e.bests.at(-1)!.time,
    }))
    // A lift with a trend in this range (two or more sessions) first, then
    // main lifts (external load, barbell, heaviest) before machines,
    // accessories and bodyweight work, then the most trained and most recent.
    .sort(
      (a, b) =>
        Number(b.inRange > 1) - Number(a.inRange > 1) ||
        Number(b.e.kind === "load") - Number(a.e.kind === "load") ||
        Number(b.e.equipment === "Barbell") -
          Number(a.e.equipment === "Barbell") ||
        b.heaviest - a.heaviest ||
        b.inRange - a.inRange ||
        b.last - a.last,
    );
  const [chosen, setChosen] = useState<string>();
  const [metricChoice, setMetricChoice] = useState<Metric>();
  const [picking, setPicking] = useState(false);
  const exercise =
    (chosen && model.exercises.get(chosen)) || ranked[0]?.e || undefined;
  if (!exercise) return null;
  const metric =
    exercise.kind === "load" &&
    metricChoice &&
    metricChoice !== "reps" &&
    (metricChoice !== "e1rm" || exercise.bests.some((b) => b.e1rm))
      ? metricChoice
      : defaultMetric(exercise.kind, exercise.bests);
  const series = progressionSeries(
    exercise.bests.filter((b) => inWindow(b.date, window)),
    metric,
  );
  const format = (v: number) =>
    metric === "reps"
      ? plural(v, "rep")
      : metric === "e1rm"
        ? estimateText(v, units)
        : loadText(v, units);
  const latest = compareLatest(exercise.bests, exercise.kind);
  const best = (b: NonNullable<typeof latest>["latest"]) =>
    exercise.kind === "load" && b.topSet
      ? setText(b.topSet, units)
      : b.mostReps
        ? b.mostReps.weight > 0 && exercise.kind === "load"
          ? setText(b.mostReps, units)
          : plural(b.mostReps.reps, "rep")
        : "—";
  const cmp = latest?.comparison;
  const change =
    !latest?.previous || !cmp
      ? "First session: this sets your baseline"
      : cmp.kind === "weight"
        ? `${signed(loadIn(cmp.delta, units), units)} at ${plural(cmp.reps, "rep")}`
        : cmp.kind === "e1rm"
          ? `Estimated 1RM ${signed(loadIn(cmp.delta, units), units)}`
          : cmp.kind === "reps"
            ? `${signed(cmp.delta, cmp.delta === 1 || cmp.delta === -1 ? "rep" : "reps")} in your best set`
            : "Different reps and no estimate, so no direct comparison";
  return (
    <ForgeCard testID="strength-card" padding={0} gap={0}>
      <View
        style={{
          padding: forge.spacing.cardPadding,
          gap: forge.spacing.group,
        }}
      >
        <InfoHeader
          title="Strength"
          info={{
            title: "How strength is measured",
            paragraphs: strengthInfo,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Exercise: ${exercise.name}. Change exercise`}
          onPress={() => setPicking(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: forge.heights.compact,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <FText
            variant="cardTitle"
            weight="700"
            numberOfLines={2}
            style={{ flexShrink: 1 }}
          >
            {exercise.name}
          </FText>
          <Ionicons name="chevron-down" size={18} color={c.emberHot} />
        </Pressable>
        {exercise.kind === "load" && exercise.bests.some((b) => b.e1rm) && (
          <ForgeSegments<Metric>
            accessibilityLabel="Strength measure"
            options={[
              { value: "e1rm", label: "Est. 1RM" },
              { value: "top", label: "Heaviest set" },
            ]}
            value={metric}
            onChange={setMetricChoice}
          />
        )}
        {series.length ? (
          <ForgeLineChart
            label={`${exercise.name}, ${metric === "e1rm" ? "estimated 1RM" : metric === "top" ? "heaviest set" : "most reps"} by session`}
            format={format}
            axisValue={(v) => (metric === "reps" ? v : loadIn(v, units))}
            points={series.map((s) => ({
              key: s.workoutId,
              value: s.value,
              description: dayLabel(s.date),
              tick: shortDate(s.date),
            }))}
          />
        ) : (
          <FText variant="label" tone="secondary">
            {`No ${exercise.name} sessions in ${rangePhrase(window)}.`}
          </FText>
        )}
        {series.length === 1 && (
          <FText variant="label" tone="secondary">
            Your trend line appears after your next session.
          </FText>
        )}
        {latest && (
          <View style={{ gap: 6 }}>
            <SessionLine
              label="Latest"
              value={best(latest.latest)}
              date={latest.latest.date}
            />
            {latest.previous && (
              <SessionLine
                label="Previous"
                value={best(latest.previous)}
                date={latest.previous.date}
              />
            )}
            <FText
              variant="label"
              weight="600"
              tone={
                latest.previous && cmp && cmp.kind !== "none"
                  ? "accent"
                  : "secondary"
              }
            >
              {change}
            </FText>
          </View>
        )}
      </View>
      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        exercises={ranked.map((x) => x.e)}
        onPick={(id) => {
          setChosen(id);
          setMetricChoice(undefined);
        }}
      />
      <ForgeListRow
        icon="barbell-outline"
        title="Exercise details"
        accessibilityLabel={`${exercise.name} details`}
        divider
        onPress={() =>
          router.push({ pathname: "/exercise", params: { id: exercise.id } })
        }
      />
    </ForgeCard>
  );
}

function SessionLine({
  label,
  value,
  date,
}: {
  label: string;
  value: string;
  date: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}, ${dayLabel(date)}`}
      style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
    >
      <FText variant="label" tone="secondary" style={{ width: 64 }}>
        {label}
      </FText>
      <FText variant="body" weight="700" style={{ flex: 1 }}>
        {value}
      </FText>
      <FText variant="label" tone="secondary">
        {dayLabel(date)}
      </FText>
    </View>
  );
}

/** Working sets by primary muscle over the range (unchanged since Phase 5). */
function MuscleSets({
  model,
  window,
}: {
  model: ProgressModel;
  window: RangeWindow;
}) {
  const [all, setAll] = useState(false);
  const log = model.log.filter((e) => inWindow(e.date, window));
  const muscles = muscleSets(log, model.info);
  const top = muscles[0]?.sets ?? 1;
  if (!muscles.length) return null;
  return (
    <ForgeCard testID="muscle-card">
      <CardHeader title="Sets by primary muscle" />
      {(all ? muscles : muscles.slice(0, 5)).map((m) => (
        <View
          key={m.muscle}
          accessible
          accessibilityLabel={`${m.muscle}: ${plural(m.sets, "working set")}`}
          style={{ gap: 6 }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <FText variant="label" weight="600">
              {m.muscle}
            </FText>
            <FText variant="label" tone="secondary">
              {plural(m.sets, "set")}
            </FText>
          </View>
          <ForgeProgress
            value={m.sets / top}
            label={m.muscle}
            tone="accent"
            height={5}
          />
        </View>
      ))}
      {muscles.length > 5 && (
        <OutlineButton
          compact
          title={all ? "Show fewer" : `Show all ${muscles.length} muscles`}
          onPress={() => setAll(!all)}
        />
      )}
    </ForgeCard>
  );
}

/**
 * Measurements other than bodyweight (which has its own card), within the
 * selected range (7.4D, PD-2); all time on the new-lifter screen.
 */
function Body({ units, window }: { units: Units; window?: RangeWindow }) {
  const r = useRepo();
  // Spelling variants share a series, one point per day (the day's latest
  // entry), spaced by date (Phase 7B WP4B).
  const series = seriesOf(r.journal("measurement")).filter(
    (s) => !s.bodyweight,
  );
  const labels = series.map((s, i) =>
    series.findIndex((o) => o.name === s.name) === i
      ? s.name
      : `${s.name} (${displayUnit(s.family, units)})`,
  );
  const [key, setKey] = useState(series[0]?.key);
  if (!series.length) return null;
  const index = Math.max(
    0,
    series.findIndex((s) => s.key === key),
  );
  const s = series[index]!;
  const name = labels[index]!;
  // All time is every entry (Progress's all-time window starts at the first
  // workout or plan).
  const days =
    window && window.key !== "all"
      ? s.days.filter((d) => d.date >= window.from)
      : s.days;
  // Over a year of entries, axis dates carry the month and year ("Mar 25").
  const long =
    days.length > 1 &&
    dayNumber(days[days.length - 1]!.date) - dayNumber(days[0]!.date) > 330;
  const points = days.map((d) => ({
    key: d.date,
    value: toDisplay(d.value, d.entry.data.unit, units),
    description:
      d.count > 1
        ? `${dayLabel(d.date)} · ${d.count} entries`
        : dayLabel(d.date),
    tick: long
      ? new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        })
      : shortDate(d.date),
  }));
  return (
    <ForgeCard testID="measurements-card">
      <CardHeader
        title="Measurements"
        onPress={() =>
          router.push({ pathname: "/journal", params: { kind: "measurement" } })
        }
        accessibilityLabel="Measurements. Open body measurements"
      />
      {series.length > 1 ? (
        <ForgeChips
          bleed={forge.spacing.cardPadding}
          values={labels}
          value={name}
          onChange={(label) => setKey(series[labels.indexOf(label)]?.key)}
        />
      ) : (
        <FText variant="cardTitle" weight="700">
          {name}
        </FText>
      )}
      {points.length ? (
        <ForgeLineChart
          label={`${name} trend`}
          points={points}
          x={days.map((d) => dayNumber(d.date))}
          breakOver={GAP_DAYS}
          resetKey={`${s.key}-${window?.key ?? "all"}`}
          format={(v) => {
            const u = displayUnit(s.family, units);
            return `${Math.round(v * 10) / 10} ${u}`;
          }}
        />
      ) : (
        <FText variant="label" tone="secondary">
          {`No ${name} entries in ${window ? rangePhrase(window) : "all time"}.`}
        </FText>
      )}
    </ForgeCard>
  );
}

function Empty() {
  return (
    <ForgeEmpty
      title="Your progress starts here"
      detail="Finish a workout and Forge charts how consistently you train, how your lifts move and every record you set — all from what you log."
      action={
        <CtaButton
          compact
          title="Start a workout"
          icon="play"
          onPress={() => router.navigate("/(tabs)")}
        />
      }
    />
  );
}

export default function Progress() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const units = r.profile().units;
  const { now, today } = homeClock();
  const [range, setRange] = useState<RangeKey>("12w");
  const [milestones, setMilestones] = useState(false);
  // The repository is mutable; `revision` changes whenever stored data does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => progressModel(r), [r, revision]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => consistencyInput(r, today), [r, revision, today]);
  const workouts = r.workouts();
  // Lifetime totals read every workout's sets, so they are computed once per
  // data change (and per day, for the streak), not on every range tap or
  // render (7.4B, PD-1). Same function, same inputs.
  const lifetime = useMemo(
    () => summary(r.workouts(), (id) => r.workoutSets(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, revision, today],
  );
  const earned = achievements(
    lifetime.count,
    lifetime.totalVolume,
    model.events.length,
  );
  // All-time stats (7.4E): Progress's load volume over every session, and
  // training time summed as You sums it.
  const lifetimeLoad = useMemo(
    () => volumeBuckets(model.log, model.info, ALL_TIME)[0]!.loadVolume,
    [model],
  );
  const lifetimeSeconds = workouts
    .filter((w) => w.status === "completed")
    .reduce(
      (n, w) =>
        n +
        elapsedSeconds(w.startedAt, w.finishedAt ?? w.startedAt, w.pausedMs),
      0,
    );
  const record = latestRecord(model.events);
  const gain = record
    ? recordGain(record, model.exercises.get(record.exerciseId)?.bests ?? [])
    : undefined;
  const plan = planStatus(r);
  const bodyweight = seriesOf(r.journal("measurement")).find(
    (s) => s.bodyweight,
  );
  const context = plan ? planContext(r, today) : undefined;
  const frame = (children: React.ReactNode) => (
    <ForgeScreen
      brand={
        <BadgePill
          icon="flame"
          value={String(lifetime.streak)}
          accessibilityLabel={`${lifetime.streak} day streak`}
        />
      }
    >
      <TitleBlock
        greeting="Progress"
        subtitle="Evidence of a stronger you. Keep building."
        date={dayLabel(today)}
        spokenDate={longDayLabel(now)}
        plan={
          plan
            ? {
                text: context
                  ? `Week ${context.week} · ${context.phase}`
                  : plan.title,
                label: `${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`,
                open: plan.open,
              }
            : undefined
        }
      />
      {children}
    </ForgeScreen>
  );
  const more = (
    <>
      <SectionTitle title="More" />
      <ListSection>
        <ListRow
          icon="time-outline"
          title="Training history"
          onPress={() => router.push("/history")}
        />
        <ListRow
          icon="calendar-outline"
          title="Training calendar"
          onPress={() => router.push("/calendar")}
        />
        <ListRow
          icon="ribbon-outline"
          title="Milestones"
          value={String(earned.length)}
          onPress={() => setMilestones(true)}
        />
        <ListRow
          icon="body-outline"
          title="Body measurements"
          onPress={() =>
            router.push({
              pathname: "/journal",
              params: { kind: "measurement" },
            })
          }
        />
        <ListRow
          icon="nutrition-outline"
          title="Nutrition"
          onPress={() => router.navigate(NUTRITION_TODAY)}
        />
        <ListRow
          icon="pulse-outline"
          title="Recovery"
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
        <ListRow
          icon="flag-outline"
          title="Goals"
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "goal" } })
          }
        />
      </ListSection>
      <Sheet
        visible={milestones}
        onClose={() => setMilestones(false)}
        title="Milestones"
        dismissOnBackdrop
      >
        {earned.length ? (
          earned.map((x) => <AchievementCard key={x.id} title={x.name} />)
        ) : (
          <Txt tone="secondary">
            Your first finished workout starts the collection.
          </Txt>
        )}
      </Sheet>
    </>
  );
  if (!input.workouts.length)
    return frame(
      <>
        <Empty />
        <BodyweightCard series={bodyweight} units={units} />
        <Body units={units} />
        {more}
      </>,
    );
  const window = rangeWindow(range, today, firstActivity(input));
  const weeks = weekSummaries(input, weekStarts(window));
  const cons = consistency(weeks);
  const periods = bucketSummaries(weeks, buckets(window));
  const anyPlan = cons.planned > 0;
  const records = model.events.filter((e) => inWindow(e.date, window));
  const inRange = workouts.filter(
    (w) =>
      w.status === "completed" &&
      inWindow(localDate(w.finishedAt ?? w.startedAt), window),
  );
  const minutes = inRange.reduce(
    (n, w) =>
      n +
      elapsedSeconds(w.startedAt, w.finishedAt ?? w.startedAt, w.pausedMs) / 60,
    0,
  );
  const legacy = r
    .journal("program")
    .filter((p) => p.data.forgePath !== 1 && p.data.forgeProgram !== 1);
  const consistencyText = anyPlan
    ? cons.due
      ? `${cons.dueDone} of ${plural(cons.due, "planned session")} done`
      : "Your plan's first sessions are ahead"
    : `${cons.activeWeeks} of ${cons.weeks} weeks with a workout`;
  const volumeByPeriod = volumeBuckets(
    model.log.filter((e) => inWindow(e.date, window)),
    model.info,
    buckets(window),
  );
  return frame(
    <>
      <ForgeSegments
        accessibilityLabel="Time range"
        options={(Object.keys(rangeLabels) as RangeKey[]).map((k) => ({
          value: k,
          label: SHORT_RANGE[k],
          accessibilityLabel: rangeLabels[k],
        }))}
        value={range}
        onChange={setRange}
      />
      <BodyweightCard series={bodyweight} window={window} units={units} />
      <TrainingVolumeCard
        volume={volumeByPeriod}
        workouts={periods}
        window={window}
        units={units}
      />
      <CardPair>
        <RecordHighlightCard
          event={record}
          gain={gain}
          name={record ? model.info(record.exerciseId).name : undefined}
          units={units}
        />
        <AllTimeStatsCard
          workouts={lifetime.count}
          volumeKg={lifetimeLoad}
          seconds={lifetimeSeconds}
          units={units}
        />
      </CardPair>
      {model.exercises.size > 0 && (
        <Strength model={model} window={window} units={units} />
      )}
      <Consistency
        periods={periods}
        window={window}
        summaryText={consistencyText}
        anyPlan={anyPlan}
        stats={[
          { value: cons.completed.toLocaleString(), label: "Workouts" },
          cons.adherence !== undefined
            ? {
                value: `${Math.round(cons.adherence * 100)}%`,
                label: "On plan",
                detail: `${cons.dueDone} of ${cons.due} sessions`,
              }
            : {
                value: `${cons.activeWeeks}/${cons.weeks}`,
                label: "Active weeks",
              },
        ]}
      />
      {legacy.length > 0 && (
        <ForgeCard testID="saved-plans-card">
          <CardHeader title="Saved plans" />
          {legacy.map((program) => {
            const a = programAdherence(
              r
                .journal("schedule")
                .filter((j) => j.data.programId === program.id)
                .map((j) => ({
                  date: j.date,
                  templateId: String(j.data.templateId),
                })),
              workouts,
            );
            const text = `${a.completed} of ${a.due} due sessions completed on their planned dates`;
            return (
              <View
                key={program.id}
                accessible
                accessibilityLabel={`${String(program.data.name)}, ${text}`}
                style={{ gap: 2 }}
              >
                <FText variant="cardTitle" weight="700">
                  {String(program.data.name)}
                </FText>
                <FText variant="label" tone="secondary">
                  {text}
                </FText>
              </View>
            );
          })}
        </ForgeCard>
      )}
      <RowsCard
        testID="records-card"
        header={
          <InfoHeader
            title="Records"
            info={{ title: "How records work", paragraphs: recordInfo }}
          />
        }
        summary={
          <View style={{ gap: 2 }}>
            <ForgeMetric
              size="stat"
              value={String(records.length)}
              label="Records"
            />
            <FText variant="label" tone="secondary">
              {records.length
                ? `Set in ${rangePhrase(window)}`
                : "No new records in this range"}
            </FText>
            {!records.length && (
              <FText variant="label" tone="secondary">
                Beat a previous best and it appears here.
              </FText>
            )}
          </View>
        }
      >
        {records.slice(0, 3).map((e) => {
          const h = recordHeadline(e, units);
          const name = model.info(e.exerciseId).name;
          return (
            <ForgeListRow
              key={`${e.exerciseId}-${e.workoutId}`}
              icon="trophy-outline"
              title={name}
              description={keepSegmentsTogether(`${h.label} · ${h.value}`)}
              value={shortDate(e.date)}
              accessibilityLabel={`${name}, ${h.label} ${h.value}, ${dayLabel(e.date)}. Review workout`}
              divider
              onPress={() =>
                router.push({
                  pathname: "/workout",
                  params: { id: e.workoutId },
                })
              }
            />
          );
        })}
        <ForgeListRow
          icon="podium-outline"
          title="All records"
          divider
          onPress={() => router.push("/records")}
        />
      </RowsCard>
      <MuscleSets model={model} window={window} />
      <ForgeCard testID="training-time-card">
        <CardHeader title="Training time" />
        <StatStrip minColumn={84}>
          <ForgeMetric
            size="stat"
            value={String(
              Math.round(inRange.length ? minutes / inRange.length : 0),
            )}
            unit="min"
            label="Average workout"
          />
          <ForgeMetric
            size="stat"
            value={Math.round(minutes).toLocaleString()}
            unit="min"
            label="Total"
          />
          <ForgeMetric
            size="stat"
            value={String(lifetime.streak)}
            label="Day streak"
          />
        </StatStrip>
      </ForgeCard>
      <Body units={units} window={window} />
      {more}
    </>,
  );
}
