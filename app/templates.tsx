import React, { useState } from "react";
import { Alert } from "../src/platform/alert";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Sheet,
  Field,
  NumberField,
} from "../src/components/ui";
import { ExercisePicker } from "../src/components/ExercisePicker";
import { useRepo, mutate, confirm } from "../src/state";
import {
  localDate,
  type Template,
  type Prescription,
} from "../src/domain/types";
import {
  visibleSchedules,
  startScheduledSession,
  standaloneTemplates,
} from "../src/data/paths";
import { notifyAt } from "../src/notifications";
export default function Templates() {
  const r = useRepo();
  const [editor, setEditor] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Prescription[]>([]);
  const [baseline, setBaseline] = useState("");
  const [date, setDate] = useState(localDate());
  const draft = JSON.stringify({ name, notes, items });
  function edit(t?: Template) {
    setEditingId(t?.id);
    setName(t?.name ?? "");
    setNotes(t?.notes ?? "");
    setItems(t?.exercises ?? []);
    setBaseline(
      JSON.stringify({
        name: t?.name ?? "",
        notes: t?.notes ?? "",
        items: t?.exercises ?? [],
      }),
    );
    setEditor(true);
  }
  function schedule(t: Template) {
    const entry = mutate(() =>
      r.addJournal("schedule", { name: t.name, templateId: t.id }, date),
    );
    if (entry) {
      Alert.alert("Scheduled", `${t.name} on ${date}`);
      void notifyAt(
        "Planned workout",
        t.name,
        new Date(`${date}T09:00:00`).getTime(),
      ).catch((e) => Alert.alert("Reminder unavailable", String(e)));
    }
  }
  return (
    <Screen title="Workout templates" eyebrow="TRAIN">
      <Button title="Back" secondary onPress={() => router.back()} />
      <Field
        label="Schedule date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
      />
      <Button title="Create template" icon="add" onPress={() => edit()} />
      {standaloneTemplates(r).map((t) => (
        <Card key={t.id}>
          <Label size={21} bold>
            {t.name}
          </Label>
          <Label muted>
            {t.exercises.length} exercises ·{" "}
            {t.exercises.reduce((n, e) => n + e.sets, 0)} sets
          </Label>
          <Label muted size={12}>
            {t.notes}
          </Label>
          <Row>
            <Button
              title="Train"
              onPress={() => {
                const w = mutate(() => r.startWorkout(t.name, t.id));
                if (w) router.push("/workout");
              }}
            />
            <Button title="Edit" secondary onPress={() => edit(t)} />
            <Button
              title="Duplicate"
              secondary
              onPress={() =>
                mutate(() =>
                  r.saveTemplate(
                    `${t.name} copy`,
                    t.exercises,
                    undefined,
                    t.notes,
                  ),
                )
              }
            />
            <Button title="Schedule" secondary onPress={() => schedule(t)} />
            <Button
              title="Delete"
              secondary
              onPress={() =>
                confirm(
                  "Delete template?",
                  "Completed workouts are preserved. Planned sessions will need a new template.",
                  () => r.deleteTemplate(t.id),
                )
              }
            />
          </Row>
        </Card>
      ))}
      <Label bold size={23}>
        Your calendar
      </Label>
      {visibleSchedules(r)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 30)
        .map((j) => (
          <Card key={j.id}>
            <Label bold>
              {j.date} · {String(j.data.name)}
            </Label>
            {j.data.deload === true && (
              <Label muted>Deload: one fewer set per exercise</Label>
            )}
            <Row>
              <Button
                title="Start planned session"
                secondary
                onPress={() => {
                  const w = mutate(() => startScheduledSession(r, j));
                  if (w) router.push("/workout");
                }}
              />
              {j.data.forgePath === 1 ? (
                <Button
                  title="Manage Path session"
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/paths",
                      params: {
                        programId: String(j.data.programId),
                        week: String(j.data.week),
                      },
                    })
                  }
                />
              ) : (
                <Button
                  title="Remove plan"
                  secondary
                  onPress={() =>
                    confirm(
                      "Remove planned session?",
                      "Your recorded workouts will remain.",
                      () => r.deleteJournal(j.id),
                    )
                  }
                />
              )}
            </Row>
          </Card>
        ))}
      <Sheet
        visible={editor}
        onClose={() => setEditor(false)}
        title={editingId ? "Edit template" : "New template"}
        unsaved={draft !== baseline}
      >
        <Field label="Template name" value={name} onChangeText={setName} />
        <Field
          label="Training notes"
          value={notes}
          multiline
          onChangeText={setNotes}
        />
        {items.map((item, i) => (
          <Card key={`${item.exerciseId}-${i}`}>
            <Label bold>{r.exercise(item.exerciseId)?.name}</Label>
            <Row>
              {(["sets", "reps", "weight", "rest"] as const).map((k) => (
                <NumberField
                  key={k}
                  label={k === "weight" ? "kg" : k === "rest" ? "Rest sec" : k}
                  value={item[k]}
                  onSave={(value) =>
                    setItems((a) =>
                      a.map((p, n) =>
                        n === i
                          ? {
                              ...p,
                              [k]: value ?? 0,
                              ...(k === "reps" && p.repMax != null
                                ? { repMax: Math.max(value ?? 0, p.repMax) }
                                : {}),
                            }
                          : p,
                      ),
                    )
                  }
                />
              ))}
              <NumberField
                label="Maximum reps"
                value={item.repMax ?? item.reps}
                integer
                min={Math.max(1, item.reps)}
                max={1000}
                onSave={(repMax) =>
                  setItems((a) =>
                    a.map((p, n) => (n === i ? { ...p, repMax: repMax! } : p)),
                  )
                }
              />
            </Row>
            <Row>
              <Button
                title="Move up"
                secondary
                onPress={() => {
                  if (i > 0)
                    setItems((a) => {
                      const copy = [...a];
                      [copy[i - 1], copy[i]] = [copy[i]!, copy[i - 1]!];
                      return copy;
                    });
                }}
              />
              <Button
                title="Remove"
                secondary
                onPress={() => setItems((a) => a.filter((_, n) => n !== i))}
              />
            </Row>
          </Card>
        ))}
        <Button
          title="Add exercise"
          secondary
          onPress={() => setPicker(true)}
        />
        <Button
          title="Save template"
          disabled={!name.trim() || !items.length}
          onPress={() => {
            const t = mutate(() =>
              r.saveTemplate(name, items, editingId, notes),
            );
            if (t) setEditor(false);
          }}
        />
      </Sheet>
      <ExercisePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(e) =>
          setItems((a) => [
            ...a,
            { exerciseId: e.id, sets: 3, reps: 10, weight: 0, rest: 90 },
          ])
        }
      />
    </Screen>
  );
}
