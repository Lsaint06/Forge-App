import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  Sheet,
  Chips,
  SegmentedControl,
  useColors,
} from "../components/ui";
import { ListRow, ListSection, InfoButton } from "../components/system";
import { BarChart, Legend, LineChart } from "../components/charts";
import { AchievementCard } from "../components/design";
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
  compactNumber,
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
import { dayLabel } from "../domain/training-display";
import {
  consistencyInfo,
  recordInfo,
  strengthInfo,
  volumeInfo,
} from "../domain/progress/explain";
import { theme } from "../theme";

// Progress (Design System 2.0, Phase 5): am I showing up, am I getting
// stronger, what have I accomplished. Every number is derived from stored
// workouts and plans on demand; see docs/PROGRESS_METRICS.md.

type Units = "kg" | "lb";

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
const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const periodName = (p: PeriodSummary, w: RangeWindow) =>
  w.bucket === "week" ? `Week of ${shortDate(p.start)}` : monthName(p.start);

function Overview({
  stats,
}: {
  stats: { value: string; label: string; detail?: string }[];
}) {
  return (
    <Card style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 18 }}>
      {stats.map((s) => (
        <View
          key={s.label}
          accessible
          accessibilityLabel={`${s.label}: ${s.value}${s.detail ? `, ${s.detail}` : ""}`}
          style={{ width: "100%", gap: 2 }}
        >
          <Txt variant="metric" numberOfLines={1}>
            {s.value}
          </Txt>
          <Txt variant="overline" tone="secondary">
            {s.label}
          </Txt>
          {s.detail && (
            <Txt variant="caption" tone="secondary">
              {s.detail}
            </Txt>
          )}
        </View>
      ))}
    </Card>
  );
}

function SectionTitle({
  title,
  info,
}: {
  title: string;
  info?: { title: string; paragraphs: string[] };
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: -theme.spacing.sm,
        paddingLeft: theme.spacing.xs,
      }}
    >
      <Txt variant="overline" tone="secondary" header>
        {title}
      </Txt>
      {info && (
        <InfoButton
          title={info.title}
          paragraphs={info.paragraphs}
          label={info.title}
        />
      )}
    </View>
  );
}

function Consistency({
  periods,
  window,
  summaryText,
  anyPlan,
}: {
  periods: PeriodSummary[];
  window: RangeWindow;
  summaryText: string;
  anyPlan: boolean;
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
    <Card>
      <Txt variant="headline">{summaryText}</Txt>
      <BarChart
        label={`Workouts by ${window.bucket}`}
        bars={periods.map((p) => ({
          key: p.start,
          value: p.completed,
          ...(p.planned ? { target: p.planned } : {}),
          description: describe(p),
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
            { label: "Completed", color: c.success },
            { label: "Planned", color: c.text3, outline: true },
          ]}
        />
      )}
    </Card>
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
        <Field
          label="Search your exercises"
          value={query}
          onChangeText={setQuery}
          placeholder="Bench, squat, row…"
        />
      )}
      <ListSection>
        {shown.map((e) => (
          <ListRow
            key={e.id}
            title={e.name}
            subtitle={`${plural(e.bests.length, "session")} · last ${dayLabel(e.bests.at(-1)!.date)}`}
            chevron={false}
            onPress={() => {
              onPick(e.id);
              onClose();
            }}
          />
        ))}
      </ListSection>
      {!shown.length && (
        <Txt tone="secondary">No logged exercise matches “{query}”.</Txt>
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
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Exercise: ${exercise.name}. Change exercise`}
        onPress={() => setPicking(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt variant="headline" style={{ flexShrink: 1 }} numberOfLines={2}>
          {exercise.name}
        </Txt>
        <Ionicons name="chevron-down" size={18} color={c.text2} />
      </Pressable>
      {exercise.kind === "load" && exercise.bests.some((b) => b.e1rm) && (
        <SegmentedControl
          label="Strength measure"
          options={[
            { value: "e1rm", label: "Est. 1RM" },
            { value: "top", label: "Heaviest set" },
          ]}
          value={metric}
          onChange={(v) => setMetricChoice(v as Metric)}
        />
      )}
      {series.length ? (
        <LineChart
          label={`${exercise.name}, ${metric === "e1rm" ? "estimated 1RM" : metric === "top" ? "heaviest set" : "most reps"} by session`}
          format={format}
          points={series.map((s) => ({
            key: s.workoutId,
            value: s.value,
            description: dayLabel(s.date),
          }))}
        />
      ) : (
        <Txt tone="secondary">
          {`No ${exercise.name} sessions in the last ${rangeLabels[window.key].toLowerCase()}.`}
        </Txt>
      )}
      {series.length === 1 && (
        <Txt variant="caption" tone="secondary">
          Your trend line appears after your next session.
        </Txt>
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
          <Txt variant="caption" tone="secondary">
            {change}
          </Txt>
        </View>
      )}
      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        exercises={ranked.map((x) => x.e)}
        onPick={(id) => {
          setChosen(id);
          setMetricChoice(undefined);
        }}
      />
      <View style={{ marginHorizontal: -theme.spacing.md, marginBottom: -8 }}>
        <ListRow
          icon="barbell-outline"
          title="Exercise details"
          accessibilityLabel={`${exercise.name} details`}
          onPress={() =>
            router.push({ pathname: "/exercise", params: { id: exercise.id } })
          }
        />
      </View>
    </Card>
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
      <Txt variant="caption" tone="secondary" style={{ width: 64 }}>
        {label}
      </Txt>
      <Txt weight="600" tabular style={{ flex: 1 }}>
        {value}
      </Txt>
      <Txt variant="caption" tone="secondary">
        {dayLabel(date)}
      </Txt>
    </View>
  );
}

function Volume({
  model,
  window,
  units,
}: {
  model: ProgressModel;
  window: RangeWindow;
  units: Units;
}) {
  const c = useColors();
  const [all, setAll] = useState(false);
  const log = model.log.filter((e) => inWindow(e.date, window));
  const periods = volumeBuckets(log, model.info, buckets(window));
  const sets = periods.reduce((n, p) => n + p.workingSets, 0);
  const load = periods.reduce((n, p) => n + p.loadVolume, 0);
  const muscles = muscleSets(log, model.info);
  const top = muscles[0]?.sets ?? 1;
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="metric">{compactNumber(sets)}</Txt>
          <Txt variant="overline" tone="secondary">
            Working sets
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="metric">{compactNumber(loadIn(load, units))}</Txt>
          <Txt variant="overline" tone="secondary">
            {`Volume (${units})`}
          </Txt>
        </View>
      </View>
      {sets > 0 && (
        <BarChart
          label={`Working sets by ${window.bucket}`}
          height={72}
          bars={periods.map((p) => ({
            key: p.start,
            value: p.workingSets,
            description: `${window.bucket === "week" ? `Week of ${shortDate(p.start)}` : monthName(p.start)} · ${plural(p.workingSets, "working set")} · ${compactNumber(loadIn(p.loadVolume, units))} ${units}`,
          }))}
          startLabel={
            window.bucket === "week"
              ? shortDate(periods[0]!.start)
              : monthName(periods[0]!.start)
          }
          endLabel={window.bucket === "week" ? "This week" : "This month"}
        />
      )}
      {muscles.length > 0 && (
        <View style={{ gap: 10 }}>
          <Txt variant="overline" tone="secondary">
            Sets by primary muscle
          </Txt>
          {(all ? muscles : muscles.slice(0, 5)).map((m) => (
            <View
              key={m.muscle}
              accessible
              accessibilityLabel={`${m.muscle}: ${plural(m.sets, "working set")}`}
              style={{ gap: 4 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Txt variant="caption">{m.muscle}</Txt>
                <Txt variant="caption" tone="secondary" tabular>
                  {plural(m.sets, "set")}
                </Txt>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: c.surfaceRaised,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${Math.max(4, (m.sets / top) * 100)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: c.text2,
                  }}
                />
              </View>
            </View>
          ))}
          {muscles.length > 5 && (
            <Button
              title={all ? "Show fewer" : `Show all ${muscles.length} muscles`}
              variant="text"
              neutral
              onPress={() => setAll(!all)}
            />
          )}
        </View>
      )}
    </Card>
  );
}

function Body({ units }: { units: Units }) {
  const r = useRepo();
  // Spelling variants share a series, one point per day (the day's latest
  // entry), spaced by date (Phase 7B WP4B).
  const series = seriesOf(r.journal("measurement"));
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
  const points = s.days.map((d) => ({
    key: d.date,
    value: toDisplay(d.value, d.entry.data.unit, units),
    description:
      d.count > 1
        ? `${dayLabel(d.date)} · ${d.count} entries`
        : dayLabel(d.date),
  }));
  return (
    <>
      <SectionTitle title="Body" />
      <Card>
        {series.length > 1 ? (
          <Chips
            bleed={theme.spacing.md}
            values={labels}
            value={name}
            onChange={(label) => setKey(series[labels.indexOf(label)]?.key)}
          />
        ) : (
          <Txt variant="headline">{name}</Txt>
        )}
        <LineChart
          label={`${name} trend`}
          points={points}
          x={s.days.map((d) => dayNumber(d.date))}
          breakOver={GAP_DAYS}
          resetKey={s.key}
          format={(v) => {
            const u = displayUnit(s.family, units);
            return `${Math.round(v * 10) / 10} ${u}`;
          }}
        />
      </Card>
    </>
  );
}

function Empty() {
  const c = useColors();
  return (
    <Card style={{ padding: 20 }}>
      <Ionicons name="trending-up-outline" size={28} color={c.text2} />
      <Txt variant="title" header>
        Your progress starts here
      </Txt>
      <Txt tone="secondary">
        Finish a workout and Forge charts how consistently you train, how your
        lifts move and every record you set — all from what you log.
      </Txt>
      <Button
        title="Start a workout"
        icon="play"
        onPress={() => router.navigate("/(tabs)")}
      />
    </Card>
  );
}

export default function Progress() {
  const r = useRepo();
  const revision = useApp((s) => s.revision);
  const units = r.profile().units;
  const today = localDate();
  const [range, setRange] = useState<RangeKey>("12w");
  const [milestones, setMilestones] = useState(false);
  // The repository is mutable; `revision` changes whenever stored data does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => progressModel(r), [r, revision]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => consistencyInput(r, today), [r, revision, today]);
  const workouts = r.workouts();
  const lifetime = summary(workouts, (id) => r.workoutSets(id));
  const earned = achievements(
    lifetime.count,
    lifetime.totalVolume,
    model.events.length,
  );
  const more = (
    <>
      <ListSection title="More">
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
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "nutrition" } })
          }
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
    return (
      <Screen title="Progress">
        <Empty />
        <Body units={units} />
        {more}
      </Screen>
    );
  const window = rangeWindow(range, today, firstActivity(input));
  const weeks = weekSummaries(input, weekStarts(window));
  const cons = consistency(weeks);
  const periods = bucketSummaries(weeks, buckets(window));
  const anyPlan = cons.planned > 0;
  const records = model.events.filter((e) => inWindow(e.date, window));
  const loadVolume = volumeBuckets(
    model.log.filter((e) => inWindow(e.date, window)),
    model.info,
    [{ start: window.from, end: window.to }],
  )[0]!.loadVolume;
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
  return (
    <Screen title="Progress">
      <SegmentedControl
        label="Time range"
        options={(Object.keys(rangeLabels) as RangeKey[]).map((k) => ({
          value: k,
          label: rangeLabels[k],
        }))}
        value={range}
        onChange={(v) => setRange(v as RangeKey)}
      />
      <Overview
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
          { value: String(records.length), label: "Records" },
          {
            value: compactNumber(loadIn(loadVolume, units)),
            label: `Volume (${units})`,
          },
        ]}
      />
      <SectionTitle
        title="Consistency"
        info={{
          title: "How consistency is counted",
          paragraphs: consistencyInfo,
        }}
      />
      <Consistency
        periods={periods}
        window={window}
        summaryText={consistencyText}
        anyPlan={anyPlan}
      />
      {legacy.length > 0 && (
        <ListSection title="Saved plans">
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
            return (
              <ListRow
                key={program.id}
                title={String(program.data.name)}
                subtitle={`${a.completed} of ${a.due} due sessions completed on their planned dates`}
              />
            );
          })}
        </ListSection>
      )}
      {model.exercises.size > 0 && (
        <>
          <SectionTitle
            title="Strength"
            info={{
              title: "How strength is measured",
              paragraphs: strengthInfo,
            }}
          />
          <Strength model={model} window={window} units={units} />
        </>
      )}
      <SectionTitle
        title="Records"
        info={{ title: "How records work", paragraphs: recordInfo }}
      />
      <ListSection>
        {records.slice(0, 3).map((e) => {
          const h = recordHeadline(e, units);
          return (
            <ListRow
              key={`${e.exerciseId}-${e.workoutId}`}
              icon="trophy-outline"
              title={model.info(e.exerciseId).name}
              subtitle={keepSegmentsTogether(`${h.label} · ${h.value}`)}
              value={shortDate(e.date)}
              chevron={false}
            />
          );
        })}
        {!records.length && (
          <ListRow
            icon="trophy-outline"
            title="No new records in this range"
            subtitle="Beat a previous best and it appears here."
          />
        )}
        <ListRow
          icon="podium-outline"
          title="All records"
          onPress={() => router.push("/records")}
        />
      </ListSection>
      <SectionTitle
        title="Volume"
        info={{ title: "How volume is counted", paragraphs: volumeInfo }}
      />
      <Volume model={model} window={window} units={units} />
      <ListSection title="Training time">
        <ListRow
          title="Average workout"
          value={`${Math.round(inRange.length ? minutes / inRange.length : 0)} min`}
        />
        <ListRow
          title="Total"
          value={`${Math.round(minutes).toLocaleString()} min`}
        />
        <ListRow title="Day streak" value={String(lifetime.streak)} />
      </ListSection>
      <Body units={units} />
      {more}
    </Screen>
  );
}
