import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Field,
  Chips,
  Row,
} from "../src/components/ui";
import { useRepo, mutate } from "../src/state";
import { id, type Exercise } from "../src/domain/types";
import { records, kgToLb } from "../src/domain/metrics";
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
  const pr = records(history.flat());
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
            <Card>
              <Label bold size={20}>
                Your records
              </Label>
              <Row>
                <Label>
                  Best load:{" "}
                  {Math.round(
                    (r.profile().units === "lb" ? kgToLb(pr.load) : pr.load) *
                      100,
                  ) / 100}{" "}
                  {r.profile().units}
                </Label>
                <Label>Best reps: {pr.reps}</Label>
              </Row>
              <Label muted>
                Estimated 1RM:{" "}
                {Math.round(
                  (r.profile().units === "lb"
                    ? kgToLb(pr.estimatedMax)
                    : pr.estimatedMax) * 10,
                ) / 10}{" "}
                {r.profile().units}
              </Label>
              <Label muted size={12}>
                Epley: load × (1 + reps / 30), for 2–12 reps; one rep uses
                actual load. An estimate, not a tested maximum.
              </Label>
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
                    .map((x) => `${Math.round(x.weight)} kg × ${x.reps}`)
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
