import React from "react";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Empty,
  Row,
} from "../../src/components/ui";
import { useRepo, mutate, confirm } from "../../src/state";
import { SectionHeader, WorkoutCard } from "../../src/components/design";
import { PathSummary } from "../../src/components/PathSummary";
import { standaloneTemplates } from "../../src/data/paths";
import { volume, elapsedSeconds, kgToLb } from "../../src/domain/metrics";
export default function Train() {
  const r = useRepo();
  const history = r.workouts().filter((w) => w.status === "completed");
  return (
    <Screen title="Train" eyebrow="YOUR NEXT SESSION">
      <Button
        title="Forge Paths"
        icon="trail-sign-outline"
        onPress={() => router.push("/paths")}
      />
      <PathSummary />
      {r.active() && (
        <WorkoutCard
          title={r.active()!.name}
          detail="Active session · every edit is saved"
        >
          <Button
            title="Resume active workout"
            icon="play"
            onPress={() => router.push("/workout")}
          />
        </WorkoutCard>
      )}
      <Button
        title={r.active() ? "Return to workout" : "Start freestyle workout"}
        icon="add"
        onPress={() => {
          const w = mutate(() => r.startWorkout());
          if (w) router.push("/workout");
        }}
      />
      <SectionHeader
        title="Your training plans"
        detail={`${standaloneTemplates(r).length} saved templates`}
      />
      <Button
        title="Templates & programs"
        secondary
        icon="calendar-outline"
        onPress={() => router.push("/templates")}
      />
      <Button
        title="Training programs"
        secondary
        icon="layers-outline"
        onPress={() =>
          router.push({
            pathname: "/templates",
            params: { section: "programs" },
          })
        }
      />
      {standaloneTemplates(r)
        .slice(0, 3)
        .map((template) => (
          <WorkoutCard
            key={template.id}
            title={template.name}
            detail={`${template.exercises.length} exercises`}
          >
            <Button
              title={`Start ${template.name}`}
              secondary
              icon="play"
              onPress={() => {
                const session = mutate(() =>
                  r.startWorkout(template.name, template.id),
                );
                if (session) router.push("/workout");
              }}
            />
          </WorkoutCard>
        ))}
      <SectionHeader title="Workout history" />
      {!history.length && (
        <Empty
          title="A clean slate"
          detail="Finish a workout to see your history, performance and personal records here."
        />
      )}
      {history.map((w) => (
        <Card key={w.id}>
          <Label size={20} bold>
            {w.name}
          </Label>
          <Label muted>
            {new Date(w.finishedAt ?? w.startedAt).toLocaleDateString()} ·{" "}
            {Math.round(
              elapsedSeconds(
                w.startedAt,
                w.finishedAt ?? w.startedAt,
                w.pausedMs,
              ) / 60,
            )}{" "}
            min ·{" "}
            {Math.round(
              r.profile().units === "lb"
                ? kgToLb(volume(r.workoutSets(w.id)))
                : volume(r.workoutSets(w.id)),
            )}{" "}
            {r.profile().units}
          </Label>
          <Row>
            <Button
              title="Review / edit"
              secondary
              onPress={() =>
                router.push({ pathname: "/workout", params: { id: w.id } })
              }
            />
            <Button
              title="Repeat"
              secondary
              onPress={() => {
                const copy = mutate(() => r.duplicateWorkout(w.id));
                if (copy) router.push("/workout");
              }}
            />
            <Button
              title="Delete"
              danger
              onPress={() =>
                confirm(
                  "Delete workout?",
                  "This removes this session and its sets.",
                  () => r.deleteWorkout(w.id),
                )
              }
            />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
