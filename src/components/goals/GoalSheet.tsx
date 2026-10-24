import React, { useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Switch, View } from "react-native";
import { Alert } from "../../platform/alert";
import {
  Sheet,
  Field,
  Txt,
  Button,
  TextButton,
  Choices,
  useColors,
} from "../ui";
import { Stepper } from "../Stepper";
import { DateSheet } from "../DateSheet";
import { ExercisePicker } from "../ExercisePicker";
import { useRepo, mutate } from "../../state";
import {
  GOAL_TYPES,
  REPS_MAX,
  TYPES,
  NAME_MAX,
  bestLift,
  confirmations,
  defaultName,
  draftChanged,
  draftOf,
  editedGoal,
  isV2,
  latestWeighIn,
  massEditText,
  newGoal,
  readTarget,
  volumeText,
  type DraftContext,
  type Goal,
  type GoalDraft,
  type GoalType,
  type Sources,
} from "../../domain/goals";
import { readValue, valueText } from "../../domain/measurements";
import { loadText } from "../../domain/progress/format";
import { dayTitle } from "../../domain/calendar-dates";
import { localDate } from "../../domain/types";
import { theme } from "../../theme";

export type GoalTarget =
  { kind: "new"; like?: Goal } | { kind: "edit"; goal: Goal };

const DIRECTIONS = [
  { value: "atLeast", title: "At least" },
  { value: "atMost", title: "At most" },
];

/**
 * Creating or editing a goal: the type first, then only that type's fields,
 * in the lifter's units. Save sits in the footer above the keyboard; a double
 * tap saves once; editing writes only what changed and never changes a
 * legacy goal's meaning unless "Use the new measurement" is chosen.
 */
export function GoalSheet({
  target,
  sources,
  frequency,
  onClose,
  onSaved,
}: {
  target: GoalTarget;
  sources: Sources;
  /** The lifter's planned workouts per week (a starting suggestion). */
  frequency?: number;
  onClose: () => void;
  onSaved: (text: string, undo: () => void) => void;
}) {
  const r = useRepo();
  const c = useColors();
  const today = localDate();
  const units = sources.units;
  const editing = target.kind === "edit" ? target.goal : undefined;
  const ctx: DraftContext = {
    units,
    today,
    best: (id, reps) => bestLift(sources.lifts(id), reps)?.weight,
  };
  const latest = latestWeighIn(sources.measurements);
  const [draft, setDraft] = useState<GoalDraft>(() => {
    if (editing) return draftOf(editing, units);
    const like = target.kind === "new" ? target.like : undefined;
    const base: GoalDraft = {
      name: "",
      target: "",
      start: "",
      exerciseId: "",
      reps: 1,
      date: today,
      notes: "",
      convert: false,
    };
    if (!like) return base;
    const copy = draftOf(like, units);
    return {
      ...base,
      type: copy.type,
      exerciseId: copy.exerciseId,
      reps: copy.reps,
      direction: copy.direction,
    };
  });
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState<"from" | "by" | "exercise">();
  const [showNotes, setShowNotes] = useState(!!draft.notes.trim());
  const busy = useRef(false);

  const type = draft.type;
  const legacy = !!editing && !isV2(editing);
  const windowed = !!type && (type === "volume" || type === "duration");
  const ruled = !editing || !legacy || draft.convert;
  const exercise = draft.exerciseId
    ? sources.exercise(draft.exerciseId)
    : undefined;
  const best = draft.exerciseId
    ? bestLift(sources.lifts(draft.exerciseId), draft.reps)
    : undefined;

  function update(patch: Partial<GoalDraft>) {
    busy.current = false;
    setError(undefined);
    setDraft((d) => ({ ...d, ...patch }));
  }
  function choose(t: GoalType) {
    const patch: Partial<GoalDraft> = { type: t, target: "", start: "" };
    if (t === "bodyweight" && latest)
      patch.start = massEditText(Number(latest.data.value), units);
    if (t === "workouts") patch.target = String(Math.max(1, frequency ?? 3));
    update(patch);
  }
  function fail(message: string) {
    busy.current = false;
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }

  function write() {
    if (editing) {
      const result = editedGoal(editing, draft, ctx);
      if (result === undefined) {
        // Nothing changed: nothing is written or queued for sync.
        onClose();
        return;
      }
      if ("error" in result) return fail(result.error);
      const before = { data: editing.data, date: editing.date };
      const ok = mutate(() => {
        r.updateJournal(editing.id, result.data, result.date);
        return true;
      });
      if (!ok) {
        busy.current = false;
        return;
      }
      onSaved(`Updated ${String(result.data.name)}`, () =>
        mutate(() => r.updateJournal(editing.id, before.data, before.date)),
      );
      onClose();
      return;
    }
    const result = newGoal(draft, ctx, exercise?.name);
    if ("error" in result) return fail(result.error);
    const entry = mutate(() => r.addJournal("goal", result.data, result.date));
    if (!entry) {
      busy.current = false;
      return;
    }
    onSaved(`Saved ${String(result.data.name)}`, () =>
      mutate(() => r.deleteJournal(entry.id)),
    );
    onClose();
  }
  function save() {
    if (busy.current) return;
    busy.current = true;
    if (!type) return fail("Choose what kind of goal this is");
    if (type === "strength" && exercise && !exercise.load)
      return fail(
        "Choose an exercise with external load. Bodyweight, assisted and band work can't be measured by weight lifted.",
      );
    const asks = confirmations(draft, ctx, editing);
    if (!asks.length) return write();
    busy.current = false;
    Alert.alert("Check this goal", asks.join("\n\n"), [
      { text: "Edit", style: "cancel" },
      {
        text: "Save anyway",
        onPress: () => {
          if (busy.current) return;
          busy.current = true;
          write();
        },
      },
    ]);
  }

  const unit =
    type === "bodyweight" || type === "strength" || type === "volume"
      ? units
      : type === "duration"
        ? "minutes"
        : type === "nutrition"
          ? "kcal a day"
          : "";
  const startKg = (() => {
    const read = draft.start.trim()
      ? readValue(draft.start, "mass", units)
      : undefined;
    return read && "value" in read ? read.value : undefined;
  })();
  const targetValue = (() => {
    if (!type) return undefined;
    const read = readTarget(type, draft.target, units);
    return "value" in read ? read.value : undefined;
  })();
  const volumeSoFar =
    type === "volume"
      ? sources.workouts
          .filter((w) => !ruled || w.date >= draft.date)
          .reduce((t, w) => t + sources.volumeOf(w.id), 0)
      : 0;
  const placeholder = defaultName(draft, units, exercise?.name);

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing ? "Edit goal" : "New goal"}
      unsaved={draftChanged(draft, ctx, editing)}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error && (
            <Txt tone="error" align="center">
              {error}
            </Txt>
          )}
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {editing && (
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={onClose} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button
                title={editing ? "Save changes" : "Save goal"}
                icon="checkmark"
                onPress={save}
              />
            </View>
          </View>
        </View>
      }
    >
      {editing ? (
        <Txt tone="secondary">{type ? TYPES[type].title : "Goal"}</Txt>
      ) : (
        <Choices
          label="What will you work toward?"
          value={type}
          onChange={(t) => choose(t as GoalType)}
          options={GOAL_TYPES.map((t) => ({
            value: t,
            title: TYPES[t].title,
            detail: TYPES[t].detail,
          }))}
        />
      )}
      {type === "strength" && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Exercise, ${exercise?.name ?? "not chosen"}. Choose exercise`}
            onPress={() => setPicking("exercise")}
            style={({ pressed }) => ({
              minHeight: theme.heights.control,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.spacing.md,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Txt tone="secondary">Exercise</Txt>
            <Txt weight="600" style={{ flexShrink: 1 }} align="right">
              {`${exercise?.name ?? (draft.exerciseId ? `Not found (${draft.exerciseId})` : "Choose")} ›`}
            </Txt>
          </Pressable>
          {exercise && (
            <Txt variant="caption" tone="secondary">
              {!exercise.load
                ? "This exercise's logged weight isn't counted as load."
                : best
                  ? `Your best: ${loadText(best.weight, units)} × ${best.reps} · ${dayTitle(best.date, today)}`
                  : "No sets recorded for this exercise yet."}
            </Txt>
          )}
        </>
      )}
      {type && type !== "workouts" && (
        <Field
          label={`Target (${unit})`}
          value={draft.target}
          keyboardType="decimal-pad"
          placeholder={type === "bodyweight" ? "e.g. 80" : undefined}
          onChangeText={(t) => update({ target: t })}
        />
      )}
      {type === "workouts" && (
        <Stepper
          label="Workouts per week"
          value={Number(draft.target) || 1}
          min={1}
          max={14}
          onChange={(n) => update({ target: String(n) })}
        />
      )}
      {type === "workouts" && frequency !== undefined && frequency > 0 && (
        <Txt variant="caption" tone="secondary">
          {`Your plan: ${frequency} a week. Counted Monday to Sunday.`}
        </Txt>
      )}
      {type === "strength" && (!editing || isV2(editing)) && (
        <Stepper
          label="For at least (reps)"
          value={draft.reps}
          min={1}
          max={REPS_MAX}
          onChange={(n) => update({ reps: n })}
        />
      )}
      {type === "bodyweight" && (
        <>
          <Field
            label={`Starting weight (${units})`}
            value={draft.start}
            keyboardType="decimal-pad"
            onChangeText={(t) => update({ start: t })}
          />
          <Txt variant="caption" tone="secondary">
            {[
              latest
                ? `Latest weigh-in: ${valueText(Number(latest.data.value), "mass", units)} · ${dayTitle(latest.date, today)}`
                : "No weigh-in yet. Enter your current weight.",
              startKg !== undefined &&
              targetValue !== undefined &&
              startKg !== targetValue
                ? `${targetValue < startKg ? "Lose" : "Gain"} ${valueText(Math.abs(startKg - targetValue), "mass", units)}`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
        </>
      )}
      {legacy &&
        (type === "volume" || type === "duration" || type === "nutrition") && (
          <View style={{ gap: theme.spacing.xs }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.md,
                minHeight: theme.heights.control,
              }}
            >
              <View style={{ flex: 1 }}>
                <Txt variant="headline">Use the new measurement</Txt>
                <Txt variant="caption" tone="secondary">
                  {type === "volume"
                    ? `Count from ${dayTitle(draft.date, today)} instead of all your workouts.`
                    : type === "duration"
                      ? "Average of the last 4 weeks, at least or at most your target."
                      : "Each day's logged calories, at least or at most your target."}
                </Txt>
              </View>
              <Switch
                accessibilityLabel="Use the new measurement"
                value={draft.convert}
                onValueChange={(v) => update({ convert: v })}
                trackColor={{ true: c.ember, false: c.surfaceRaised }}
                thumbColor={c.text}
              />
            </View>
            {!draft.convert && (
              <Txt variant="caption" tone="tertiary">
                {type === "volume"
                  ? "Now: counted over all your workouts."
                  : type === "duration"
                    ? "Now: the average of all your workouts, no direction."
                    : "Now: today's logged calories, no direction."}
              </Txt>
            )}
          </View>
        )}
      {(type === "duration" || type === "nutrition") && ruled && (
        <Choices
          label={
            type === "duration" ? "Each session should be" : "Each day, eat"
          }
          value={draft.direction}
          onChange={(d) => update({ direction: d as GoalDraft["direction"] })}
          options={DIRECTIONS}
        />
      )}
      {type === "duration" && ruled && (
        <Txt variant="caption" tone="secondary">
          Measured as the average length of your workouts over the last 4 weeks.
        </Txt>
      )}
      {type === "nutrition" && ruled && (
        <Txt variant="caption" tone="secondary">
          Measured from the food you log in Nutrition. Days with nothing logged
          aren&apos;t counted, and a day is only as complete as what you log.
        </Txt>
      )}
      {windowed && ruled && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Counts from, ${dayTitle(draft.date, today)}. Change day`}
            onPress={() => setPicking("from")}
            style={({ pressed }) => ({
              minHeight: theme.heights.control,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Txt tone="secondary">Counts from</Txt>
            <Txt weight="600">{`${dayTitle(draft.date, today)} ›`}</Txt>
          </Pressable>
          {type === "volume" && (
            <Txt variant="caption" tone="secondary">
              {`${volumeText(volumeSoFar, units)} recorded since then.`}
            </Txt>
          )}
        </>
      )}
      {type && (
        <>
          <Field
            label="Name (optional)"
            value={draft.name}
            placeholder={placeholder || undefined}
            onChangeText={(t) => update({ name: t.slice(0, NAME_MAX) })}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.spacing.sm,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Target date, ${draft.targetDate ? dayTitle(draft.targetDate, today) : "none"}. Change`}
              onPress={() => setPicking("by")}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: theme.heights.control,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Txt tone="secondary">Target date (optional)</Txt>
              <Txt weight="600">
                {`${draft.targetDate ? dayTitle(draft.targetDate, today) : "None"} ›`}
              </Txt>
            </Pressable>
            {draft.targetDate && (
              <TextButton
                title="Clear"
                neutral
                accessibilityLabel="Clear target date"
                onPress={() => update({ targetDate: undefined })}
              />
            )}
          </View>
          {showNotes ? (
            <Field
              label="Note (optional)"
              value={draft.notes}
              onChangeText={(t) => update({ notes: t })}
            />
          ) : (
            <TextButton
              title="Add note"
              icon="add"
              neutral
              onPress={() => setShowNotes(true)}
            />
          )}
        </>
      )}
      {/* Rendered inside this sheet so iOS presents them on top. */}
      <DateSheet
        visible={picking === "from"}
        range="past"
        title="Counts from"
        detail="Workouts from this day on count toward the goal."
        confirmLabel="Choose"
        initial={draft.date > today ? today : draft.date}
        onClose={() => setPicking(undefined)}
        onConfirm={(day) => {
          update({ date: day });
          setPicking(undefined);
        }}
      />
      <DateSheet
        visible={picking === "by"}
        range="future"
        title="Target date"
        confirmLabel="Choose"
        initial={
          draft.targetDate && draft.targetDate >= today
            ? draft.targetDate
            : undefined
        }
        onClose={() => setPicking(undefined)}
        onConfirm={(day) => {
          update({ targetDate: day });
          setPicking(undefined);
        }}
      />
      <ExercisePicker
        visible={picking === "exercise"}
        onClose={() => setPicking(undefined)}
        onPick={(e) => update({ exerciseId: e.id })}
      />
    </Sheet>
  );
}
