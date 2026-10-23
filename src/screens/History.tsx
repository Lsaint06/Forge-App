import React from "react";
import { router } from "expo-router";
import { Screen, Empty } from "../components/ui";
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

// Every completed workout, newest first and grouped by month. A row opens
// the workout review; Repeat and Delete live in each row's menu.
export default function History() {
  const r = useRepo();
  const units = r.profile().units;
  const done = r.workouts().filter((w) => w.status === "completed");
  return (
    <Screen
      title="History"
      eyebrow={`${done.length} ${done.length === 1 ? "workout" : "workouts"}`}
      onBack={() => goBack("/(tabs)/train")}
    >
      {!done.length && (
        <Empty
          title="No workouts yet"
          detail="Finished workouts appear here with their date, duration and volume."
        />
      )}
      {byMonth(done).map((month) => (
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
                            "This removes this session and its sets.",
                            () => r.deleteWorkout(w.id),
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
    </Screen>
  );
}
