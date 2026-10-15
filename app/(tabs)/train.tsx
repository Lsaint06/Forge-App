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
import { volume, elapsedSeconds } from "../../src/domain/metrics";
export default function Train() {
  const r = useRepo();
  const history = r.workouts().filter((w) => w.status === "completed");
  return (
    <Screen title="Train with intent." eyebrow="THE WORK / TRAIN">
      <Button
        title={r.active() ? "Resume active workout" : "Start empty workout"}
        icon="add"
        onPress={() => {
          const w = mutate(() => r.startWorkout());
          if (w) router.push("/workout");
        }}
      />
      <Button
        title="Templates & programs"
        secondary
        icon="calendar-outline"
        onPress={() => router.push("/templates")}
      />
      <Label bold size={22}>
        Session history
      </Label>
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
            min · {Math.round(volume(r.workoutSets(w.id)))} kg
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
