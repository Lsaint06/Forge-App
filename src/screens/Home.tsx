import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useRepo, mutate } from "../state";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Stat,
  ProgressBar,
  Empty,
} from "../components/ui";
import {
  summary,
  readiness,
  achievements,
  volume,
  displayMeasurement,
} from "../domain/metrics";
import { analyze } from "../domain/analytics";
import { localDate } from "../domain/types";
export default function Home() {
  const r = useRepo();
  const p = r.profile();
  const all = r.workouts();
  const stats = summary(all, (w) => r.workoutSets(w));
  const last = all.find((w) => w.status === "completed");
  const recovery = r.journal("recovery")[0];
  const measurement = r
    .journal("measurement")
    .find((j) => j.data.name === "Bodyweight");
  const next = r
    .journal("schedule")
    .filter((j) => j.date >= localDate())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const performance = analyze(all, (id) =>
    r.workoutExercises(id).map((e) => ({
      exerciseId: e.exerciseId,
      muscle: r.exercise(e.exerciseId)?.muscle ?? "Unknown",
      sets: r.sets(e.id),
    })),
  );
  const prCount = Object.values(performance.exercises).filter(
    (e) => e.load > 0,
  ).length;
  useEffect(() => {
    if (!p.onboarded) router.replace("/onboarding");
  }, [p.onboarded]);
  function start() {
    const w = mutate(() => r.startWorkout());
    if (w) router.push("/workout");
  }
  return (
    <Screen
      title={`Let's build, ${p.name.split(" ")[0]}.`}
      eyebrow="FORGE / YOUR DAILY EDGE"
    >
      <Card style={{ borderColor: "#FF5A36", padding: 24 }}>
        <Label size={12} bold style={{ color: "#FF5A36", letterSpacing: 2 }}>
          SHOW UP. GET STRONGER.
        </Label>
        <Label size={28} bold>
          {r.active()
            ? "Your session is waiting."
            : "Your next rep starts here."}
        </Label>
        <Label muted>
          {r.active()
            ? "Every saved set is ready where you left it."
            : "Train with intent. Track every effort. Build your own momentum."}
        </Label>
        <Button
          title={r.active() ? "Resume workout" : "Start a workout"}
          icon="play"
          onPress={start}
        />
      </Card>
      <Row>
        <Stat value={stats.streak} label="DAY STREAK" />
        <Stat
          value={`${stats.weekly}/${p.frequency}`}
          label="WEEKLY WORKOUTS"
        />
        <Stat
          value={Math.round(stats.weeklyVolume).toLocaleString()}
          label="KG VOLUME / WEEK"
        />
      </Row>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Label bold>Your weekly commitment</Label>
            <Label muted size={12}>
              {stats.weekly} sessions recorded this week
            </Label>
          </View>
          <Label bold style={{ color: "#FF5A36" }}>
            {Math.round(Math.min(1, stats.weekly / p.frequency) * 100)}%
          </Label>
        </Row>
        <ProgressBar
          value={stats.weekly / p.frequency}
          label="Weekly workout goal"
        />
      </Card>
      {last ? (
        <Card>
          <Label muted size={11}>
            LAST SESSION
          </Label>
          <Label size={22} bold>
            {last.name}
          </Label>
          <Label muted>
            {new Date(last.finishedAt ?? last.startedAt).toLocaleDateString()} ·{" "}
            {Math.round(volume(r.workoutSets(last.id)))} kg volume
          </Label>
          <Button
            title="Review workout"
            secondary
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: last.id } })
            }
          />
        </Card>
      ) : (
        <Empty
          title="Your story starts with one session"
          detail="Your dashboard will grow from your workouts. No demo history, just your effort."
        />
      )}
      <Row>
        <Button
          title="Log nutrition"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "nutrition" } })
          }
        />
        <Button
          title="Check readiness"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
      </Row>
      <Card>
        <Label bold>Next on your calendar</Label>
        <Label muted>
          {next
            ? `${next.date} · ${String(next.data.name)}`
            : "No workout planned. Choose a program or schedule a template."}
        </Label>
        <Button
          title="Plan training"
          secondary
          onPress={() => router.push("/templates")}
        />
      </Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Card>
            <Label muted size={12}>
              RECOVERY
            </Label>
            <Label size={24} bold>
              {recovery
                ? `${readiness({ sleep: Number(recovery.data.sleep), quality: Number(recovery.data.quality), soreness: Number(recovery.data.soreness), energy: Number(recovery.data.energy), stress: Number(recovery.data.stress) }).score}/100`
                : "No check-in"}
            </Label>
            <Label muted size={11}>
              {recovery?.date ?? "Log how you feel"}
            </Label>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <Label muted size={12}>
              BODYWEIGHT
            </Label>
            <Label size={24} bold>
              {measurement
                ? `${Math.round(displayMeasurement(Number(measurement.data.value), "kg", p.units).value * 10) / 10} ${p.units}`
                : "Not logged"}
            </Label>
            <Label muted size={11}>
              {measurement?.date ?? "Your own trend"}
            </Label>
          </Card>
        </View>
      </Row>
      <Card>
        <Label bold>Earned milestones</Label>
        {achievements(stats.count, stats.totalVolume, prCount).map((a) => (
          <Label key={a.id}>✦ {a.name}</Label>
        ))}
        {stats.count === 0 && (
          <Label muted>Complete your first workout to earn First spark.</Label>
        )}
      </Card>
    </Screen>
  );
}
