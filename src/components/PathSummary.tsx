import React from "react";
import { router } from "expo-router";
import { useRepo } from "../state";
import { currentPath, pathSummary } from "../data/paths";
import { Card, Label, Button, ProgressBar } from "./ui";

export function PathSummary() {
  const r = useRepo();
  const path = currentPath(r);
  if (!path) return null;
  const stats = pathSummary(r, path);
  return (
    <Card>
      <Label muted size={11}>
        YOUR FORGE PATH
      </Label>
      <Label bold size={22}>
        {path.data.name}
      </Label>
      <Label muted>
        {path.data.status === "paused"
          ? "Paused"
          : stats.complete
            ? "Cycle complete"
            : `Week ${stats.week} · ${stats.phase.name}`}{" "}
        · {stats.completed} / {stats.expected} workouts completed
      </Label>
      <ProgressBar value={stats.ratio} label="Forge Path completion" />
      {stats.missed > 0 && (
        <Label muted>
          {stats.missed} missed sessions · reschedule when ready
        </Label>
      )}
      <Button
        title="Open your Path"
        secondary
        icon="trail-sign-outline"
        onPress={() =>
          router.push({
            pathname: "/paths",
            params: { programId: path.record.id },
          })
        }
      />
    </Card>
  );
}
