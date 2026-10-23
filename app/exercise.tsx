import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Field,
  Chips,
} from "../src/components/ui";
import { useRepo, mutate } from "../src/state";
import { id, type Exercise } from "../src/domain/types";
import { LineChart } from "../src/components/charts";
import { ExerciseVisual, ChartContainer } from "../src/components/design";
import { exerciseProgress } from "../src/data/progress";
import {
  defaultMetric,
  progressionSeries,
} from "../src/domain/progress/strength";
import { estimateText, loadText, setText } from "../src/domain/progress/format";
import { dayLabel } from "../src/domain/training-display";
export default function ExerciseScreen() {
  const r = useRepo();
  const { id: exerciseId, custom } = useLocalSearchParams<{
    id?: string;
    custom?: string;
  }>();
  const e = exerciseId ? r.exercise(exerciseId) : undefined;
  const [editing, setEditing] = useState(custom === "new");
  const [name, setName] = useState(e?.name ?? "");
  const [muscle, setMuscle] = useState(e?.muscle ?? "Chest");
  const [equipment, setEquipment] = useState(e?.equipment ?? "Bodyweight");
  const [instructions, setInstructions] = useState(
    e?.instructions.join("\n") ?? "",
  );
  const [category, setCategory] = useState(e?.category ?? "strength");
  const [unilateral, setUnilateral] = useState(e?.unilateral ?? false);
  const history = e ? r.history(e.id) : [];
  const units = r.profile().units;
  const progress = e ? exerciseProgress(r, e.id) : undefined;
  const metric = progress
    ? defaultMetric(progress.kind, progress.bests)
    : "reps";
  return (
    <Screen
      title={editing ? "Your movement." : (e?.name ?? "Exercise not found")}
      eyebrow="EXPLORE / EXERCISE"
    >
      <Button title="Back" secondary onPress={() => router.back()} />
      {editing ? (
        <Card>
          <Field label="Exercise name" value={name} onChangeText={setName} />
          <Field
            label="Primary muscle"
            value={muscle}
            onChangeText={setMuscle}
          />
          <Field
            label="Equipment"
            value={equipment}
            onChangeText={setEquipment}
          />
          <Chips
            values={["strength", "duration", "distance"]}
            value={category}
            onChange={(x) => setCategory(x as Exercise["category"])}
          />
          <Chips
            values={["Bilateral", "Unilateral"]}
            value={unilateral ? "Unilateral" : "Bilateral"}
            onChange={(x) => setUnilateral(x === "Unilateral")}
          />
          <Field
            label="Instructions (one step per line)"
            multiline
            value={instructions}
            onChangeText={setInstructions}
          />
          <Button
            title="Save exercise"
            disabled={!name.trim() || !instructions.trim()}
            onPress={() => {
              const data: Exercise = {
                id: e?.id ?? id(),
                name,
                muscle,
                equipment,
                instructions: instructions.split("\n").filter(Boolean),
                secondary: e?.secondary ?? [],
                pattern: e?.pattern ?? "Custom",
                difficulty: e?.difficulty ?? "User defined",
                mistakes: e?.mistakes ?? "Use controlled technique.",
                safety: e?.safety ?? "Stop if movement is painful.",
                category,
                unilateral,
                tracking:
                  category === "strength"
                    ? ["kg", "reps"]
                    : category === "duration"
                      ? ["seconds"]
                      : ["meters", "seconds"],
              };
              const result = mutate(() => r.saveExercise(data));
              if (result) {
                setEditing(false);
                router.replace({
                  pathname: "/exercise",
                  params: { id: result.id },
                });
              }
            }}
          />
        </Card>
      ) : (
        e && (
          <>
            <Card>
              <ExerciseVisual exercise={e} large />
              <Label muted>
                {e.muscle} · {e.equipment} · {e.difficulty}
              </Label>
              <Label muted>
                {e.unilateral ? "Unilateral" : "Bilateral"} · {e.pattern}
              </Label>
              {e.secondary.length > 0 && (
                <Label muted>Secondary: {e.secondary.join(", ")}</Label>
              )}
              <Label bold size={20}>
                Movement guide
              </Label>
              {e.instructions.map((s, i) => (
                <Label key={i}>
                  {i + 1}. {s}
                </Label>
              ))}
              <Label bold>Common mistakes</Label>
              <Label muted>{e.mistakes}</Label>
              <Label bold>Safety</Label>
              <Label muted>{e.safety}</Label>
            </Card>
            {progress && progress.bests.length > 0 && (
              <ChartContainer title="Strength history">
                <LineChart
                  label={`${e.name} ${metric === "e1rm" ? "estimated 1RM" : metric === "top" ? "heaviest set" : "most reps"} by session`}
                  format={(v) =>
                    metric === "reps"
                      ? `${v} reps`
                      : metric === "e1rm"
                        ? estimateText(v, units)
                        : loadText(v, units)
                  }
                  points={progressionSeries(progress.bests, metric).map(
                    (p) => ({
                      key: p.workoutId,
                      value: p.value,
                      description: dayLabel(p.date),
                    }),
                  )}
                />
                <Label muted size={12}>
                  {metric === "e1rm"
                    ? "Estimated 1RM per session"
                    : metric === "top"
                      ? "Heaviest completed working set per session"
                      : "Most reps in a working set per session. Forge can't tell assistance from added weight here, so load isn't compared."}
                </Label>
              </ChartContainer>
            )}
            <Card>
              <Label bold size={20}>
                Your records
              </Label>
              {progress?.kind === "load" && (
                <>
                  <Label>
                    Heaviest set:{" "}
                    {progress.records.heaviest
                      ? setText(progress.records.heaviest, units)
                      : "—"}
                  </Label>
                  <Label muted>
                    Estimated 1RM:{" "}
                    {progress.records.e1rm
                      ? estimateText(progress.records.e1rm.value, units)
                      : "—"}
                  </Label>
                  {progress.records.repsAtWeight.slice(0, 3).map((x) => (
                    <Label key={x.weight} muted size={13}>
                      Best at {loadText(x.weight, units)}: {x.reps} reps
                    </Label>
                  ))}
                  <Label muted size={12}>
                    Epley: load × (1 + reps / 30), for 2–12 reps; one rep uses
                    actual load. An estimate, not a tested maximum.
                  </Label>
                </>
              )}
              {progress?.kind === "reps" && (
                <Label>
                  Most reps in a set: {progress.records.mostReps?.reps ?? "—"}
                </Label>
              )}
              {history.length === 0 && (
                <Label muted>
                  Complete this exercise in a workout to build your history.
                </Label>
              )}
              {history.slice(0, 10).map((s, i) => (
                <Label key={i}>
                  Session {history.length - i}:{" "}
                  {s
                    .filter((x) => x.completed)
                    .map((x) =>
                      x.weight > 0
                        ? `${loadText(x.weight, units)} × ${x.reps}`
                        : `${x.reps} reps`,
                    )
                    .join(" · ") || "No completed sets"}
                </Label>
              ))}
            </Card>
            <Button
              title="Add to workout"
              onPress={() => {
                const row = mutate(() => {
                  const w = r.startWorkout();
                  const row = r.addExercise(w.id, e.id);
                  r.addSet(row.id);
                  return row;
                });
                if (row) router.push("/workout");
              }}
            />
            {r.customExercises().some((x) => x.id === e.id) && (
              <Button
                title="Edit custom exercise"
                secondary
                onPress={() => setEditing(true)}
              />
            )}
          </>
        )
      )}
    </Screen>
  );
}
