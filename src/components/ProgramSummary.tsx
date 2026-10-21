import React from "react";
import { router } from "expo-router";
import { useRepo, mutate } from "../state";
import {
  currentEnrollment,
  programProgress,
  startProgramSession,
} from "../data/programs";
import { Card, Label, Button, ProgressBar } from "./ui";

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export function ProgramSummary() {
  const r = useRepo();
  const enrollment = currentEnrollment(r);
  if (!enrollment) return null;
  const progress = programProgress(r, enrollment);
  const next = progress.next;
  return (
    <Card>
      <Label muted size={11}>
        YOUR PROGRAM
      </Label>
      <Label bold size={22}>
        {enrollment.data.name}
      </Label>
      <Label muted>
        {progress.complete
          ? "Program complete"
          : next
            ? `Week ${next.week} · Next: ${next.session.name}`
            : "Unavailable in this app version"}
        {next?.state === "ready" && progress.upcoming[0]
          ? ` · suggested ${dayLabel(progress.upcoming[0].suggested)}`
          : ""}
      </Label>
      {progress.total !== undefined && (
        <ProgressBar
          value={progress.completed / progress.total}
          label="Program completion"
        />
      )}
      {next && (
        <Button
          title={
            next.state === "in-progress"
              ? "Resume program session"
              : "Start program session"
          }
          icon="play"
          onPress={() => {
            const workout = mutate(() =>
              startProgramSession(r, enrollment.record.id),
            );
            if (workout) router.push("/workout");
          }}
        />
      )}
      <Button
        title="Open your program"
        secondary
        icon="trail-sign-outline"
        onPress={() => router.push("/forge-paths")}
      />
    </Card>
  );
}
