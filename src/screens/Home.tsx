import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useRepo, mutate } from "../state";
import { Screen, Card, Label, Button, Row, Empty } from "../components/ui";
import {
  MetricCard,
  ProgressRing,
  SectionHeader,
  WeeklyConsistency,
} from "../components/design";
import { summary, readiness, volume, kgToLb } from "../domain/metrics";
import { localDate } from "../domain/types";
export default function Home() {
  const r = useRepo();
  const p = r.profile();
  const all = r.workouts();
  const stats = summary(all, (id) => r.workoutSets(id));
  const last = all.find((w) => w.status === "completed");
  const active = r.active();
  const today = r.journal("schedule").find((j) => j.date === localDate());
  const template = today
    ? r.templates().find((t) => t.id === today.data.templateId)
    : undefined;
  const recovery = r.journal("recovery").find((j) => j.date === localDate());
  useEffect(() => {
    if (!p.onboarded) router.replace("/onboarding");
  }, [p.onboarded]);
  function start() {
    if (!active && today && !template) {
      router.push("/templates");
      return;
    }
    const w = mutate(() =>
      r.transaction(() => {
        const existing = r.active();
        const session = r.startWorkout(template?.name, template?.id);
        if (!existing && template && today?.data.deload === true) {
          for (const row of r.workoutExercises(session.id)) {
            const sets = r.sets(row.id);
            if (sets.length > 1) r.removeSet(sets[sets.length - 1]!.id);
          }
        }
        return session;
      }),
    );
    if (w) router.push("/workout");
  }
  return (
    <Screen
      title={`Ready, ${p.name.split(" ")[0]}?`}
      eyebrow={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}
    >
      <Card style={{ padding: 24, gap: 16 }}>
        <Label muted size={13}>
          {active
            ? "YOUR ACTIVE SESSION"
            : today
              ? "PLANNED TODAY"
              : "TODAY’S TRAINING"}
        </Label>
        <Label size={30} bold>
          {active?.name ??
            (today ? String(today.data.name) : "Make your next rep count.")}
        </Label>
        <Label muted>
          {active
            ? "Pick up where you left off."
            : today
              ? template
                ? "Your planned session is ready."
                : "The saved template is unavailable. Choose a replacement."
              : "Start freestyle or choose a training plan."}
        </Label>
        <Button
          title={
            active
              ? "Resume workout"
              : today && !template
                ? "Choose a template"
                : "Start workout"
          }
          icon="play"
          onPress={start}
        />
        {!active && !today && (
          <Button
            title="Choose a program"
            secondary
            onPress={() => router.push("/templates")}
          />
        )}
      </Card>
      <Card>
        <Row>
          <ProgressRing
            value={stats.weekly / p.frequency}
            label="Weekly training goal"
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Label size={24} bold>
              {stats.weekly} / {p.frequency} sessions
            </Label>
            <Label muted size={13}>
              Your weekly commitment
            </Label>
          </View>
        </Row>
        <WeeklyConsistency workouts={all} />
      </Card>
      <Row>
        <MetricCard value={stats.count} label="Completed sessions" />
        <MetricCard value={stats.streak} label="Day streak" />
      </Row>
      <Card>
        <SectionHeader title="Today’s focus" />
        <Label muted>
          {recovery
            ? `Readiness ${readiness({ sleep: Number(recovery.data.sleep), quality: Number(recovery.data.quality), soreness: Number(recovery.data.soreness), energy: Number(recovery.data.energy), stress: Number(recovery.data.stress) }).score}/100 · Your check-in reflects sleep, energy and recovery.`
            : stats.weekly >= p.frequency
              ? "Your weekly session goal is met. Choose your next session with recovery in mind."
              : "Consistency starts with a session you can repeat. Keep your next workout focused."}
        </Label>
        <Button
          title="Recovery check-in"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
      </Card>
      <SectionHeader title="Last session" />
      {last ? (
        <Card>
          <Label size={20} bold>
            {last.name}
          </Label>
          <Label muted>
            {new Date(last.finishedAt ?? last.startedAt).toLocaleDateString()} ·{" "}
            {Math.round(
              p.units === "lb"
                ? kgToLb(volume(r.workoutSets(last.id)))
                : volume(r.workoutSets(last.id)),
            ).toLocaleString()}{" "}
            {p.units} volume
          </Label>
          <Button
            title="View session"
            secondary
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: last.id } })
            }
          />
        </Card>
      ) : (
        <Empty
          title="One session starts the story"
          detail="Your progress appears here after your first completed workout."
        />
      )}
    </Screen>
  );
}
