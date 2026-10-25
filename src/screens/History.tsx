import React, { useState } from "react";
import { router } from "expo-router";
import { Screen, Empty, TextButton } from "../components/ui";
import { ListRow, ListSection, OverflowMenu } from "../components/system";
import { useRepo, mutate, confirm } from "../state";
import { volume } from "../domain/metrics";
import { localDate } from "../domain/types";
import {
  byMonth,
  dayLabel,
  workoutLine,
  workoutTime,
} from "../domain/training-display";
import { workoutTitle } from "../domain/workout-display";
import { goBack } from "../navigation";
import { blockIfTraining } from "../startGuard";

const PAGE = 60;

// Every completed workout, newest first and grouped by month. A row opens
// the workout review; Repeat and Delete live in each row's menu. Long
// histories show the newest 60 first; "Show earlier" reveals the rest in the
// same order, so nothing is hidden or reordered.
export default function History() {
  const r = useRepo();
  const units = r.profile().units;
  const done = r.workouts().filter((w) => w.status === "completed");
  const [shown, setShown] = useState(PAGE);
  return (
    <Screen
      title="History"
      eyebrow={`${done.length} ${done.length === 1 ? "workout" : "workouts"}`}
      onBack={() => goBack("/(tabs)/profile")}
    >
      {!done.length && (
        <Empty
          title="No workouts yet"
          detail="Finished workouts appear here with their date, duration and volume."
        />
      )}
      {byMonth(done.slice(0, shown)).map((month) => (
        <ListSection key={month.key} title={month.title}>
          {month.items.map((w) => {
            const day = dayLabel(localDate(workoutTime(w)));
            return (
              <ListRow
                key={w.id}
                title={workoutTitle(w.name)}
                subtitle={workoutLine(w, volume(r.workoutSets(w.id)), units)}
                accessibilityLabel={`Review ${w.name}, ${day}`}
                chevron={false}
                onPress={() =>
                  router.push({ pathname: "/workout", params: { id: w.id } })
                }
                trailing={
                  <OverflowMenu
                    label={`Options for ${w.name}, ${day}`}
                    title={w.name}
                    actions={[
                      {
                        label: "Repeat workout",
                        icon: "repeat",
                        onPress: () => {
                          if (blockIfTraining(r)) return;
                          const copy = mutate(() => r.duplicateWorkout(w.id));
                          if (copy) router.push("/workout");
                        },
                      },
                      {
                        label: "Delete workout",
                        icon: "trash-outline",
                        destructive: true,
                        onPress: () =>
                          confirm(
                            "Delete workout?",
                            "The session and all its sets are removed from your history and progress. This cannot be undone.",
                            () => r.deleteWorkout(w.id),
                            { action: "Delete workout" },
                          ),
                      },
                    ]}
                  />
                }
              />
            );
          })}
        </ListSection>
      ))}
      {done.length > shown && (
        <TextButton
          title={`Show earlier (${done.length - shown})`}
          neutral
          onPress={() => setShown((n) => n + PAGE)}
        />
      )}
    </Screen>
  );
}
