import React, { useState } from "react";
import { Alert } from "../platform/alert";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Label,
  Button,
  Field,
  Sheet,
  Row,
  Chips,
  ProgressBar,
} from "../components/ui";
import { useRepo, mutate, confirm } from "../state";
import {
  goalProgress,
  latestBodyweight,
  bodyweightGoal,
} from "../domain/analytics";
import { localDate, type Journal, type JournalKind } from "../domain/types";
import {
  nutritionTotals,
  readiness,
  summary,
  records,
  canonicalMeasurement,
  displayMeasurement,
} from "../domain/metrics";
const config = {
  measurement: {
    title: "Measure your change.",
    fields: [
      ["name", "Measurement name", "Bodyweight"],
      ["value", "Value", ""],
      ["unit", "Entry unit", "kg"],
      ["notes", "Notes", ""],
    ],
  },
  nutrition: {
    title: "Fuel your effort.",
    fields: [
      ["name", "Food / meal name", ""],
      ["meal", "Meal", "Lunch"],
      ["calories", "Calories per serving", ""],
      ["protein", "Protein g per serving", ""],
      ["carbs", "Carbohydrate g per serving", ""],
      ["fat", "Fat g per serving", ""],
      ["quantity", "Servings consumed", "1"],
      ["serving", "Serving description (e.g. 100 g)", ""],
      ["notes", "Notes", ""],
    ],
  },
  recovery: {
    title: "Listen to your body.",
    fields: [
      ["sleep", "Sleep hours", "8"],
      ["quality", "Sleep quality (1–5)", "3"],
      ["soreness", "Soreness (1–5)", "3"],
      ["energy", "Energy (1–5)", "3"],
      ["stress", "Stress (1–5)", "3"],
      ["readiness", "Subjective readiness (1–5)", "3"],
      ["restDay", "Rest day: yes / no", "no"],
      ["notes", "Notes", ""],
    ],
  },
  goal: {
    title: "Give your effort direction.",
    fields: [
      ["name", "Goal name", ""],
      ["metric", "Metric", "workouts"],
      ["target", "Target", "3"],
      ["start", "Starting value (kg for bodyweight goals)", "0"],
      ["exerciseId", "Exercise ID (strength goals, optional)", ""],
      ["notes", "Notes", ""],
    ],
  },
  food: {
    title: "Your saved foods.",
    fields: [
      ["name", "Food name", ""],
      ["calories", "Calories per serving", ""],
      ["protein", "Protein g per serving", ""],
      ["carbs", "Carbohydrate g per serving", ""],
      ["fat", "Fat g per serving", ""],
      ["quantity", "Default servings", "1"],
      ["serving", "Serving description", ""],
    ],
  },
} as const;
const numbers = new Set([
  "value",
  "calories",
  "protein",
  "carbs",
  "fat",
  "quantity",
  "sleep",
  "quality",
  "soreness",
  "energy",
  "stress",
  "readiness",
  "target",
  "start",
]);
export default function JournalScreen() {
  const r = useRepo();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (
    params.kind && params.kind in config ? params.kind : "measurement"
  ) as keyof typeof config;
  const settings = config[kind];
  const [form, setForm] = useState<Record<string, string>>({});
  const [date, setDate] = useState(localDate());
  const [editing, setEditing] = useState<string>();
  const [visible, setVisible] = useState(false);
  // Set by any edit in the entry sheet; cleared when the sheet opens.
  const [changed, setChanged] = useState(false);
  const [filter, setFilter] = useState("All");
  const entries = r.journal(kind);
  const today = entries.filter((e) => e.date === localDate());
  const totals = nutritionTotals(
    today.map((j) => ({
      calories: Number(j.data.calories),
      protein: Number(j.data.protein),
      carbs: Number(j.data.carbs),
      fat: Number(j.data.fat),
      quantity: Number(j.data.quantity),
    })),
  );
  const p = r.profile();
  const stats = summary(r.workouts(), (w) => r.workoutSets(w));
  function open(entry?: Journal) {
    setEditing(entry?.id);
    setDate(entry?.date ?? localDate());
    setForm(
      entry
        ? Object.fromEntries(
            Object.entries(entry.data).map(([k, v]) => [k, String(v)]),
          )
        : Object.fromEntries(
            settings.fields.map(([key, , initial]) => [key, initial]),
          ),
    );
    if (kind === "measurement" && entry) {
      const display = displayMeasurement(
        Number(entry.data.value),
        String(entry.data.unit),
        p.units,
      );
      setForm((f) => ({
        ...f,
        value: String(Math.round(display.value * 10000) / 10000),
        unit: display.unit,
      }));
    }
    if (kind === "goal" && !entry)
      setForm((f) => ({
        ...f,
        start: String(latestBodyweight(r.journal("measurement")) ?? 0),
      }));
    setVisible(true);
    setChanged(false);
  }
  function edit(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setChanged(true);
  }
  function payload() {
    return Object.fromEntries(
      Object.entries(form).map(([key, v]) => [
        key,
        numbers.has(key) ? Number(v) : v,
      ]),
    );
  }
  function save() {
    let data = payload();
    if (kind === "measurement") {
      try {
        const canonical = canonicalMeasurement(
          Number(data.value),
          String(data.unit),
        );
        data = { ...data, ...canonical };
      } catch (e) {
        Alert.alert("Invalid measurement", String(e));
        return;
      }
    }
    if (Object.entries(form).some(([k, v]) => numbers.has(k) && !v.trim())) {
      Alert.alert(
        "Missing value",
        "Enter each numeric field; use zero when appropriate.",
      );
      return;
    }
    const result = mutate(() => {
      if (editing) r.updateJournal(editing, data, date);
      else r.addJournal(kind as JournalKind, data, date);
      return true;
    });
    if (result) {
      setVisible(false);
    }
  }
  function goalValue(j: Journal) {
    const metric = j.data.metric;
    if (metric === "workouts") return stats.weekly;
    if (metric === "volume") return stats.totalVolume;
    if (metric === "duration") return stats.averageMinutes;
    if (metric === "nutrition")
      return nutritionTotals(
        r
          .journal("nutrition")
          .filter((e) => e.date === localDate())
          .map((e) => ({
            calories: Number(e.data.calories),
            protein: Number(e.data.protein),
            carbs: Number(e.data.carbs),
            fat: Number(e.data.fat),
            quantity: Number(e.data.quantity),
          })),
      ).calories;
    if (metric === "strength")
      return records(r.history(String(j.data.exerciseId)).flat()).load;
    return 0;
  }
  function goalStatus(j: Journal) {
    const target = Number(j.data.target);
    if (j.data.metric === "bodyweight") {
      const current = latestBodyweight(r.journal("measurement"));
      const start = Number(j.data.start);
      const { ratio } = bodyweightGoal(
        current,
        target,
        Number.isFinite(start) && start > 0 ? start : undefined,
      );
      return {
        text:
          current === undefined
            ? `No bodyweight logged yet · target ${target} kg`
            : `${current.toFixed(1)} kg now · target ${target} kg`,
        ratio,
      };
    }
    const current = goalValue(j);
    return {
      text: `${current.toFixed(1)} / ${j.data.target} ${j.data.metric}`,
      ratio: goalProgress(current, target).ratio,
    };
  }
  return (
    <Screen title={settings.title} eyebrow={`PROGRESS / ${kind.toUpperCase()}`}>
      <Button title="Back" secondary onPress={() => router.back()} />
      <Button
        title={`Add ${kind === "nutrition" ? "meal" : kind === "food" ? "saved food" : "entry"}`}
        icon="add"
        onPress={() => open()}
      />
      {kind === "nutrition" && (
        <>
          <Card>
            <Label size={24} bold>
              {Math.round(totals.calories)} / {p.calories} kcal today
            </Label>
            <ProgressBar
              value={totals.calories / Math.max(1, p.calories)}
              label="Daily calorie intake"
            />
            <Row>
              <Label>
                Protein {Math.round(totals.protein)} / {p.protein} g
              </Label>
              <Label>
                Carbs {Math.round(totals.carbs)} / {p.carbs} g
              </Label>
              <Label>
                Fat {Math.round(totals.fat)} / {p.fat} g
              </Label>
            </Row>
            <Label muted size={12}>
              Values are entered by you, per serving. Totals multiply by serving
              quantity.
            </Label>
          </Card>
          <Button
            title="Manage saved foods"
            secondary
            onPress={() =>
              router.push({ pathname: "/journal", params: { kind: "food" } })
            }
          />
          {r.journal("food").map((food) => (
            <Button
              key={food.id}
              title={`Log ${food.data.name}`}
              secondary
              onPress={() => {
                setForm(
                  Object.fromEntries(
                    Object.entries(food.data).map(([k, v]) => [k, String(v)]),
                  ),
                );
                setEditing(undefined);
                setDate(localDate());
                setVisible(true);
                setChanged(false);
              }}
            />
          ))}
        </>
      )}
      {kind === "measurement" && (
        <>
          <Label muted>
            Values are stored in kg, cm and percent. Imperial entries are
            converted on save and display follows your Profile preference.
          </Label>
          <Chips
            values={[
              "All",
              ...new Set(entries.map((e) => String(e.data.name))),
            ]}
            value={filter}
            onChange={setFilter}
          />
        </>
      )}
      {!entries.length && (
        <Card>
          <Label bold>No entries yet</Label>
          <Label muted>
            Start with your own data. Nothing is prefilled as history.
          </Label>
        </Card>
      )}
      {entries
        .filter((e) => filter === "All" || e.data.name === filter)
        .map((j) => (
          <Card key={j.id}>
            <Label size={19} bold>
              {String(j.data.name ?? "Recovery check-in")}
            </Label>
            <Label muted size={12}>
              {j.date}
            </Label>
            {kind === "measurement" && (
              <Label size={24} bold>
                {Math.round(
                  displayMeasurement(
                    Number(j.data.value),
                    String(j.data.unit),
                    p.units,
                  ).value * 100,
                ) / 100}{" "}
                {
                  displayMeasurement(
                    Number(j.data.value),
                    String(j.data.unit),
                    p.units,
                  ).unit
                }
              </Label>
            )}
            {kind === "nutrition" || kind === "food" ? (
              <Label>
                {Math.round(Number(j.data.calories) * Number(j.data.quantity))}{" "}
                kcal · {j.data.quantity} servings ·{" "}
                {j.data.meal ?? j.data.serving}
              </Label>
            ) : null}
            {kind === "recovery" && (
              <>
                <Label size={28} bold>
                  {
                    readiness({
                      sleep: Number(j.data.sleep),
                      quality: Number(j.data.quality),
                      soreness: Number(j.data.soreness),
                      energy: Number(j.data.energy),
                      stress: Number(j.data.stress),
                    }).score
                  }{" "}
                  / 100
                </Label>
                <Label muted>
                  {
                    readiness({
                      sleep: Number(j.data.sleep),
                      quality: Number(j.data.quality),
                      soreness: Number(j.data.soreness),
                      energy: Number(j.data.energy),
                      stress: Number(j.data.stress),
                    }).reason
                  }
                </Label>
                <Label muted>
                  Sleep {j.data.sleep} h · soreness {j.data.soreness}/5 · energy{" "}
                  {j.data.energy}/5 · rest day {j.data.restDay ?? "not logged"}
                </Label>
              </>
            )}
            {kind === "goal" && (
              <>
                <Label>{goalStatus(j).text}</Label>
                <ProgressBar
                  value={goalStatus(j).ratio}
                  label={String(j.data.name)}
                />
                <Label muted size={12}>
                  Workouts: this week; volume: lifetime kg; duration: average
                  minutes; nutrition: today’s kcal; strength: best added load
                  kg; bodyweight: latest kg.
                </Label>
              </>
            )}
            {j.data.notes && <Label muted>{String(j.data.notes)}</Label>}
            <Row>
              <Button title="Edit" secondary onPress={() => open(j)} />
              {kind === "nutrition" && (
                <>
                  <Button
                    title="Repeat today"
                    secondary
                    onPress={() =>
                      mutate(() => r.addJournal("nutrition", j.data))
                    }
                  />
                  <Button
                    title="Save food"
                    secondary
                    onPress={() => mutate(() => r.addJournal("food", j.data))}
                  />
                </>
              )}
              <Button
                title="Delete"
                secondary
                onPress={() =>
                  confirm(
                    "Delete entry?",
                    "This removes this recorded entry.",
                    () => r.deleteJournal(j.id),
                  )
                }
              />
            </Row>
          </Card>
        ))}
      <Sheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={editing ? "Edit entry" : "New entry"}
        unsaved={changed}
      >
        <Field
          label="Date (YYYY-MM-DD)"
          value={date}
          onChangeText={(value) => {
            setDate(value);
            setChanged(true);
          }}
        />
        {settings.fields.map(([key, label]) =>
          key === "metric" ? (
            <Chips
              key={key}
              values={[
                "workouts",
                "volume",
                "bodyweight",
                "strength",
                "duration",
                "nutrition",
              ]}
              value={form[key] ?? "workouts"}
              onChange={(value) => edit(key, value)}
            />
          ) : key === "unit" ? (
            <Chips
              key={key}
              values={["kg", "lb", "cm", "in", "percent"]}
              value={form[key] ?? "kg"}
              onChange={(value) => edit(key, value)}
            />
          ) : (
            <Field
              key={key}
              label={label}
              value={form[key] ?? ""}
              keyboardType={numbers.has(key) ? "decimal-pad" : "default"}
              onChangeText={(value) => edit(key, value)}
            />
          ),
        )}
        <Button title="Save entry" onPress={save} />
      </Sheet>
    </Screen>
  );
}
