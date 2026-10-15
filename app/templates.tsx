import React, { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Row,
  Sheet,
  Field,
  NumberField,
  Chips,
} from "../src/components/ui";
import { ExercisePicker } from "../src/components/ExercisePicker";
import { useRepo, mutate, confirm } from "../src/state";
import { starterPrograms } from "../src/data/catalog";
import {
  localDate,
  type Template,
  type Prescription,
} from "../src/domain/types";
import { notifyAt } from "../src/notifications";
export default function Templates() {
  const r = useRepo();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const [view, setView] = useState(
    section === "programs" ? "Programs" : "Templates",
  );
  const [programDetails, setProgramDetails] = useState<string>();
  const [editor, setEditor] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Prescription[]>([]);
  const [date, setDate] = useState(localDate());
  function edit(t?: Template) {
    setEditingId(t?.id);
    setName(t?.name ?? "");
    setNotes(t?.notes ?? "");
    setItems(t?.exercises ?? []);
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
  function adopt(program: (typeof starterPrograms)[number]) {
    const saved = mutate(() =>
      r.transaction(() => {
        const templates = program.days.map((d) =>
          r.saveTemplate(
            d.name,
            d.items,
            undefined,
            `${program.name}: repeat for ${program.weeks} weeks; every fourth week reduce sets by one.`,
          ),
        );
        const plan = r.addJournal(
          "program",
          {
            name: program.name,
            weeks: program.weeks,
            started: date,
            templates: templates.map((t) => t.id).join(","),
            deloadEvery: 4,
          },
          date,
        );
        const offsets =
          templates.length === 3
            ? [0, 2, 4]
            : templates.length === 4
              ? [0, 1, 3, 4]
              : [0, 1, 2, 3, 4, 5];
        for (let week = 0; week < program.weeks; week++) {
          templates.forEach((t, i) => {
            const at = new Date(`${date}T12:00:00`);
            at.setDate(at.getDate() + week * 7 + offsets[i]!);
            r.addJournal(
              "schedule",
              {
                name: t.name,
                templateId: t.id,
                programId: plan.id,
                week: week + 1,
                deload: (week + 1) % 4 === 0,
              },
              localDate(at.getTime()),
            );
          });
        }
        return plan;
      }),
    );
    if (saved)
      Alert.alert(
        "Program added",
        `${program.name} has prescribed templates and ${program.weeks} weeks on your calendar. Deload sessions reduce each exercise by one set.`,
      );
  }
  return (
    <Screen title="Training plans" eyebrow="TRAIN">
      <Chips
        values={["Templates", "Programs"]}
        value={view}
        onChange={setView}
      />
      <Button title="Back" secondary onPress={() => router.back()} />
      <Field
        label="Schedule / program start date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
      />
      {view === "Templates" && (
        <>
          <Button title="Create template" icon="add" onPress={() => edit()} />
          {r.templates().map((t) => (
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
                <Button
                  title="Schedule"
                  secondary
                  onPress={() => schedule(t)}
                />
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
          {r
            .journal("schedule")
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
                      const w = mutate(() =>
                        r.transaction(() => {
                          const existing = r.active();
                          const w = r.startWorkout(
                            String(j.data.name),
                            String(j.data.templateId),
                          );
                          if (!existing && j.data.deload === true)
                            for (const e of r.workoutExercises(w.id)) {
                              const sets = r.sets(e.id);
                              if (sets.length > 1)
                                r.removeSet(sets[sets.length - 1]!.id);
                            }
                          return w;
                        }),
                      );
                      if (w) router.push("/workout");
                    }}
                  />
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
                </Row>
              </Card>
            ))}
        </>
      )}
      {view === "Programs" && (
        <>
          <Label bold size={23}>
            Starter programs
          </Label>
          <Label muted>
            Real prescriptions. Start light, choose loads yourself, and progress
            from recorded performance. These are general training examples.
          </Label>
          {starterPrograms.map((p) => (
            <Card key={p.id}>
              <Label size={21} bold>
                {p.name}
              </Label>
              <Label muted>
                {p.days.length} days / week · {p.weeks} weeks · deload every
                fourth week
              </Label>
              <Button
                title={
                  programDetails === p.id
                    ? "Hide program details"
                    : "View program details"
                }
                secondary
                onPress={() =>
                  setProgramDetails(programDetails === p.id ? undefined : p.id)
                }
              />
              {programDetails === p.id &&
                p.days.map((d) => (
                  <Label key={d.name} size={12}>
                    {d.name}:{" "}
                    {d.items
                      .map(
                        (x) =>
                          `${r.exercise(x.exerciseId)?.name} ${x.sets}×${x.reps}`,
                      )
                      .join(" · ")}
                  </Label>
                ))}
              <Button
                title={`Use ${p.name}`}
                secondary
                onPress={() => adopt(p)}
              />
            </Card>
          ))}
        </>
      )}
      <Sheet
        visible={editor}
        onClose={() => setEditor(false)}
        title={editingId ? "Edit template" : "New template"}
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
                        n === i ? { ...p, [k]: value ?? 0 } : p,
                      ),
                    )
                  }
                />
              ))}
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
