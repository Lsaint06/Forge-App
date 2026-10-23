import React from "react";
import { router } from "expo-router";
import type { Repository } from "../data/repository";
import { currentEnrollment, programProgress } from "../data/programs";
import { currentPath, pathSummary } from "../data/paths";
import { ListRow } from "./system";
import { keepSegmentsTogether } from "../domain/workout-display";

// The lifter's current plan as one row: name and where they are. It opens
// the program dashboard or the existing Path.

export function planStatus(r: Repository) {
  const enrollment = currentEnrollment(r);
  if (enrollment) {
    const progress = programProgress(r, enrollment);
    const next = progress.next;
    const subtitle = progress.complete
      ? "Program complete"
      : !enrollment.program
        ? "Not available in this app version"
        : progress.total !== undefined
          ? `Week ${next?.week ?? 1} · ${progress.completed} of ${progress.total} sessions`
          : `Week ${next?.week ?? 1} · ${progress.completed} sessions completed`;
    return {
      kind: "program" as const,
      title: enrollment.data.name,
      subtitle,
      open: () => router.push("/forge-paths/current"),
    };
  }
  const path = currentPath(r);
  if (path) {
    const stats = pathSummary(r, path);
    const subtitle =
      path.data.status === "paused"
        ? "Paused"
        : stats.complete
          ? "Cycle complete"
          : `Week ${stats.week} of 8 · ${stats.completed} of ${stats.expected} workouts` +
            (stats.missed > 0 ? ` · ${stats.missed} missed` : "");
    return {
      kind: "path" as const,
      title: path.data.name,
      subtitle,
      open: () =>
        router.push({
          pathname: "/paths",
          params: { programId: path.record.id },
        }),
    };
  }
  return undefined;
}

export type PlanStatus = NonNullable<ReturnType<typeof planStatus>>;

export function PlanRow({ plan }: { plan: PlanStatus }) {
  return (
    <ListRow
      icon="trail-sign-outline"
      title={plan.title}
      subtitle={keepSegmentsTogether(plan.subtitle)}
      accessibilityLabel={`${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`}
      onPress={plan.open}
    />
  );
}
