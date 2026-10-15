import React, { useState, useMemo } from "react";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Chips,
  Button,
  Row,
  Stat,
  ProgressBar,
} from "../../src/components/ui";
import { PathSummary } from "../../src/components/PathSummary";
import { Chart } from "../../src/components/Chart";
import { useRepo } from "../../src/state";
import {
  analyze,
  measurementTrend,
  programAdherence,
} from "../../src/domain/analytics";
import {
  summary,
  achievements,
  kgToLb,
  displayMeasurement,
} from "../../src/domain/metrics";
import {
  WeeklyConsistency,
  AchievementCard,
} from "../../src/components/design";
export default function Progress() {
  const r = useRepo();
  const [range, setRange] = useState("30 days");
  const [metric, setMetric] = useState("Volume");
  const [measurement, setMeasurement] = useState("Bodyweight");
  const days =
    range === "7 days"
      ? 7
      : range === "30 days"
        ? 30
        : range === "90 days"
          ? 90
          : range === "1 year"
            ? 365
            : Infinity;
  const [now] = useState(() => Date.now());
  const cutoff = now - days * 86400000;
  const all = r.workouts();
  const a = useMemo(
    () =>
      analyze(
        all.filter((w) => (w.finishedAt ?? 0) >= cutoff),
        (id) =>
          r.workoutExercises(id).map((e) => ({
            exerciseId: e.exerciseId,
            muscle: r.exercise(e.exerciseId)?.muscle ?? "Unknown",
            sets: r.sets(e.id),
          })),
      ),
    [all, cutoff, r],
  );
  const p = r.profile();
  const convert = (n: number) => (p.units === "lb" ? kgToLb(n) : n);
  const points = Object.entries(a.days)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([label, d]) => ({
      label,
      value:
        metric === "Volume"
          ? convert(d.volume)
          : metric === "Sets"
            ? d.sets
            : metric === "Duration"
              ? d.minutes
              : d.workouts,
    }));
  const measurements = r.journal("measurement");
  const names = [...new Set(measurements.map((e) => String(e.data.name)))];
  const s = summary(all, (id) => r.workoutSets(id));
  return (
    <Screen title="Progress" eyebrow="YOUR EFFORT, OVER TIME">
      <PathSummary />
      <Card>
        <Label bold>This week</Label>
        <WeeklyConsistency workouts={all} />
        <Label muted size={12}>
          Completed workouts · Monday–Sunday
        </Label>
      </Card>
      <Chips
        values={["7 days", "30 days", "90 days", "1 year", "All time"]}
        value={range}
        onChange={setRange}
      />
      <Row>
        <Stat value={a.frequency} label="SESSIONS" />
        <Stat
          value={Math.round(convert(a.totalVolume)).toLocaleString()}
          label={`${p.units.toUpperCase()} VOLUME`}
        />
        <Stat value={a.totalSets} label="WORKING SETS" />
      </Row>
      <Card>
        <Label bold size={21}>
          Training trend
        </Label>
        <Chips
          values={["Volume", "Sets", "Duration", "Frequency"]}
          value={metric}
          onChange={setMetric}
        />
        <Chart
          points={points}
          unit={
            metric === "Volume"
              ? p.units
              : metric === "Duration"
                ? "min"
                : metric.toLowerCase()
          }
        />
        <Label muted size={12}>
          Recorded dates only. Completed working, drop and failure sets count
          once. Warmups excluded; bodyweight volume uses added load only.
        </Label>
      </Card>
      <Row>
        <Stat value={Math.round(a.averageMinutes)} label="AVG MINUTES" />
        <Stat value={Math.round(a.totalMinutes)} label="TOTAL MINUTES" />
        <Stat value={s.streak} label="DAY STREAK" />
      </Row>
      <Card>
        <Label bold size={21}>
          Muscle balance
        </Label>
        {Object.entries(a.muscles)
          .sort(([, x], [, y]) => y.sets - x.sets)
          .map(([name, m]) => (
            <React.Fragment key={name}>
              <Row>
                <Label bold>{name}</Label>
                <Label muted>
                  {m.sets} sets · {Math.round(convert(m.volume))} {p.units}
                </Label>
              </Row>
              <ProgressBar
                value={m.sets / Math.max(1, a.totalSets)}
                label={`${name} proportion of working sets`}
              />
            </React.Fragment>
          ))}
        {!a.totalSets && (
          <Label muted>
            Log working sets to see your distribution. Each set is attributed to
            its primary muscle only.
          </Label>
        )}
      </Card>
      <Card>
        <Label bold size={21}>
          Strength & exercise records
        </Label>
        {Object.entries(a.exercises).map(([exerciseId, e]) => (
          <React.Fragment key={exerciseId}>
            <Label bold>{r.exercise(exerciseId)?.name}</Label>
            <Label muted size={12}>
              {e.frequency} sessions · {e.sets} sets · best load{" "}
              {Math.round(convert(e.load) * 10) / 10} {p.units} · e1RM{" "}
              {Math.round(convert(e.estimatedMax) * 10) / 10} {p.units}
            </Label>
            <Button
              title="Exercise history"
              secondary
              onPress={() =>
                router.push({
                  pathname: "/exercise",
                  params: { id: exerciseId },
                })
              }
            />
          </React.Fragment>
        ))}
        <Label muted size={12}>
          Epley estimate, limited to 1–12 rep sets. Estimates reflect added load
          and are not a strength test.
        </Label>
      </Card>
      <Card>
        <Label bold size={21}>
          Body measurement trend
        </Label>
        <Chips
          values={names.length ? names : ["Bodyweight"]}
          value={measurement}
          onChange={setMeasurement}
        />
        <Chart
          points={measurementTrend(
            measurements.filter(
              (j) => new Date(`${j.date}T23:59:59`).getTime() >= cutoff,
            ),
            measurement,
          ).map((point) => ({
            ...point,
            value: displayMeasurement(
              point.value,
              String(
                measurements.find((j) => j.data.name === measurement)?.data
                  .unit ?? "kg",
              ),
              p.units,
            ).value,
          }))}
          unit={
            displayMeasurement(
              0,
              String(
                measurements.find((j) => j.data.name === measurement)?.data
                  .unit ?? "kg",
              ),
              p.units,
            ).unit
          }
        />
        <Button
          title="Track measurements"
          secondary
          onPress={() =>
            router.push({
              pathname: "/journal",
              params: { kind: "measurement" },
            })
          }
        />
      </Card>
      {r
        .journal("program")
        .filter((program) => program.data.forgePath !== 1)
        .map((program) => {
          const schedule = r
            .journal("schedule")
            .filter((j) => j.data.programId === program.id)
            .map((j) => ({
              date: j.date,
              templateId: String(j.data.templateId),
            }));
          const adherence = programAdherence(schedule, all);
          return (
            <Card key={program.id}>
              <Label bold>{String(program.data.name)}</Label>
              <Label muted>
                {adherence.completed} / {adherence.due} due sessions completed
                on their planned dates
              </Label>
              <ProgressBar value={adherence.ratio} label="Program adherence" />
            </Card>
          );
        })}
      <Card>
        <Label bold size={21}>
          Earned achievements
        </Label>
        {achievements(
          s.count,
          s.totalVolume,
          all.some(
            (w) =>
              w.status === "completed" &&
              r
                .workoutSets(w.id)
                .some(
                  (set) =>
                    set.completed && set.kind !== "warmup" && set.weight > 0,
                ),
          )
            ? 1
            : 0,
        ).map((x) => (
          <AchievementCard key={x.id} title={x.name} />
        ))}
        {!s.count && (
          <Label muted>
            Your first finished workout starts the collection.
          </Label>
        )}
      </Card>
      <Row>
        <Button
          title="Nutrition"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "nutrition" } })
          }
        />
        <Button
          title="Recovery"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
        <Button
          title="Goals"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "goal" } })
          }
        />
      </Row>
    </Screen>
  );
}
