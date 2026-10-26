import React, { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Txt,
  Field,
  Choices,
  SegmentedControl,
  Sheet,
  FieldError,
  useColors,
} from "../components/ui";
import { ListRow } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeSubScreen,
  InfoChip,
  OutlineButton,
  RowDivider,
  SectionLabel,
} from "../components/reforge";
import { AnatomyCredits, MuscleAtlas } from "../components/anatomy/MuscleAtlas";
import { muscleMap } from "../anatomy/mapping";
import { useRepo, mutate } from "../state";
import { goBack } from "../navigation";
import { id, type Exercise } from "../domain/types";
import { LineChart } from "../components/charts";
import { exerciseProgress } from "../data/progress";
import { defaultMetric, progressionSeries } from "../domain/progress/strength";
import { estimateText, loadText, setText } from "../domain/progress/format";
import { dayLabel } from "../domain/training-display";
import { forge, theme } from "../theme";
import {
  exerciseChips,
  exerciseMeta,
  exerciseOverline,
} from "./exercise/model";

const OTHER = "Other…";
const CATEGORIES = [
  { value: "strength", label: "Strength" },
  { value: "duration", label: "Duration" },
  { value: "distance", label: "Distance" },
];
const SIDES = [
  { value: "bilateral", label: "Both sides" },
  { value: "unilateral", label: "One side" },
];
const ESTIMATE_NOTE =
  "Estimated 1RM uses the Epley formula, load × (1 + reps ÷ 30), for working sets of 2–12 reps; one rep counts as its load. An estimate, not a tested maximum.";

// An exercise (REFORGE, Phase 7.2C-3B): what it trains on the anatomy atlas,
// how to do it, your records and recent sessions; or the form for a custom
// exercise. Custom exercises keep their identity and stored shape.
export default function ExerciseScreen() {
  const r = useRepo();
  const { id: exerciseId, custom } = useLocalSearchParams<{
    id?: string;
    custom?: string;
  }>();
  const e = exerciseId ? r.exercise(exerciseId) : undefined;
  const [editing, setEditing] = useState(custom === "new");
  if (editing)
    return (
      <CustomExerciseForm
        exercise={e}
        onCancel={() => (e ? setEditing(false) : goBack("/explore"))}
        onSaved={(saved) => {
          setEditing(false);
          router.replace({ pathname: "/exercise", params: { id: saved.id } });
        }}
      />
    );
  if (!e)
    return (
      <ForgeSubScreen
        title="Exercise not found"
        onBack={() => goBack("/explore")}
      >
        <ForgeEmpty
          title="This exercise isn't available"
          detail="It may have been a custom exercise that was removed. Your recorded workouts are unchanged."
        />
      </ForgeSubScreen>
    );
  return <ExerciseDetail exercise={e} onEdit={() => setEditing(true)} />;
}

/** A card of rows separated by hairlines. */
function Rows({ children }: { children: React.ReactNode[] }) {
  return (
    <ForgeCard padding={0} gap={0}>
      {children.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <RowDivider />}
          {child}
        </React.Fragment>
      ))}
    </ForgeCard>
  );
}

function Guide({ exercise: e }: { exercise: Exercise }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel title="Movement guide" />
      <ForgeCard gap={10}>
        {e.instructions.map((step, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <FText
              variant="label"
              tone="accent"
              weight="700"
              style={{ width: 18, fontVariant: ["tabular-nums"] }}
            >
              {i + 1}
            </FText>
            <FText variant="body" style={{ flex: 1 }}>
              {step}
            </FText>
          </View>
        ))}
        {!!e.mistakes && (
          <View
            style={{
              gap: 4,
              paddingTop: 10,
              borderTopWidth: forge.border.card,
              borderTopColor: c.cardDivider,
            }}
          >
            <FText variant="overline" tone="secondary" header>
              Common mistakes
            </FText>
            <FText variant="body" tone="secondary">
              {e.mistakes}
            </FText>
          </View>
        )}
        {!!e.safety && (
          <View style={{ gap: 4 }}>
            <FText variant="overline" tone="secondary" header>
              Safety
            </FText>
            <FText variant="body" tone="secondary">
              {e.safety}
            </FText>
          </View>
        )}
      </ForgeCard>
    </View>
  );
}

function ExerciseDetail({
  exercise: e,
  onEdit,
}: {
  exercise: Exercise;
  onEdit: () => void;
}) {
  const r = useRepo();
  const units = r.profile().units;
  const progress = exerciseProgress(r, e.id);
  const isCustom = r.customExercises().some((x) => x.id === e.id);
  const metric = progress
    ? defaultMetric(progress.kind, progress.bests)
    : "reps";
  const history = r.history(e.id);
  const sessionText = (sets: (typeof history)[number]) =>
    sets
      .filter((x) => x.completed)
      .map((x) =>
        x.weight > 0
          ? `${loadText(x.weight, units)} × ${x.reps}`
          : `${x.reps} reps`,
      )
      .join(" · ") || "No completed sets";
  function addToWorkout() {
    const row = mutate(() => {
      const w = r.startWorkout();
      const row = r.addExercise(w.id, e.id);
      r.addSet(row.id);
      return row;
    });
    if (row) router.push("/workout");
  }
  return (
    <ForgeSubScreen
      title={e.name}
      eyebrow={exerciseOverline(e)}
      eyebrowTone="accent"
      onBack={() => goBack("/explore")}
      footer={
        <CtaButton title="Add to workout" icon="add" onPress={addToWorkout} />
      }
    >
      <View style={{ gap: 10, marginTop: -6 }}>
        <FText variant="subtitle" tone="secondary">
          {exerciseMeta(e)}
        </FText>
        <View
          testID="exercise-chips"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {exerciseChips(e).map((chip) => (
            <InfoChip key={chip} label={chip} />
          ))}
        </View>
      </View>
      <ForgeCard>
        <FText variant="overline" tone="secondary" header>
          Muscles worked
        </FText>
        <MuscleAtlas map={muscleMap(e)} />
      </ForgeCard>
      {e.instructions.length > 0 || !!e.mistakes || !!e.safety ? (
        <Guide exercise={e} />
      ) : null}
      {progress && progress.bests.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Strength history" />
          <ForgeCard>
            <LineChart
              label={`${e.name} ${metric === "e1rm" ? "estimated 1RM" : metric === "top" ? "heaviest set" : "most reps"} by session`}
              format={(v) =>
                metric === "reps"
                  ? `${v} reps`
                  : metric === "e1rm"
                    ? estimateText(v, units)
                    : loadText(v, units)
              }
              points={progressionSeries(progress.bests, metric).map((p) => ({
                key: p.workoutId,
                value: p.value,
                description: dayLabel(p.date),
              }))}
            />
            <FText variant="label" tone="secondary">
              {metric === "e1rm"
                ? "Estimated 1RM per session"
                : metric === "top"
                  ? "Heaviest completed working set per session"
                  : "Most reps in a working set per session. Forge can't tell assistance from added weight here, so load isn't compared."}
            </FText>
          </ForgeCard>
        </View>
      )}
      {progress?.kind === "load" && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Your records" />
          <Rows>
            {[
              <Record
                key="top"
                title="Heaviest set"
                value={
                  progress.records.heaviest
                    ? setText(progress.records.heaviest, units)
                    : "—"
                }
              />,
              <Record
                key="e1rm"
                title="Estimated 1RM"
                value={
                  progress.records.e1rm
                    ? estimateText(progress.records.e1rm.value, units)
                    : "—"
                }
              />,
              ...progress.records.repsAtWeight
                .slice(0, 3)
                .map((x) => (
                  <Record
                    key={x.weight}
                    title={`Best at ${loadText(x.weight, units)}`}
                    value={`${x.reps} reps`}
                  />
                )),
            ]}
          </Rows>
          <FText
            variant="label"
            tone="secondary"
            style={{ paddingHorizontal: 2 }}
          >
            {ESTIMATE_NOTE}
          </FText>
        </View>
      )}
      {progress?.kind === "reps" && (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Your records" />
          <Rows>
            {[
              <Record
                key="reps"
                title="Most reps in a set"
                value={String(progress.records.mostReps?.reps ?? "—")}
              />,
            ]}
          </Rows>
        </View>
      )}
      {history.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionLabel title="Recent sessions" />
          <Rows>
            {history.slice(0, 10).map((s, i) => (
              <ListRow
                key={i}
                title={`Session ${history.length - i}`}
                subtitle={sessionText(s)}
                accessibilityLabel={`Session ${history.length - i}: ${sessionText(s)}`}
              />
            ))}
          </Rows>
        </View>
      ) : (
        <FText variant="body" tone="secondary" style={{ paddingHorizontal: 2 }}>
          Complete this exercise in a workout to build your history.
        </FText>
      )}
      {isCustom && (
        <OutlineButton
          title="Edit custom exercise"
          icon="create-outline"
          onPress={onEdit}
        />
      )}
      <AnatomyCredits />
    </ForgeSubScreen>
  );
}

function Record({ title, value }: { title: string; value: string }) {
  return (
    <ListRow
      title={title}
      value={value}
      accessibilityLabel={`${title}: ${value}`}
    />
  );
}
/**
 * Creating or editing a custom exercise. Muscle and equipment are chosen from
 * the built-in catalogue's values ("Other…" keeps any other text, including
 * existing custom values); nothing is preselected for a new exercise, so the
 * equipment, which decides whether its weight counts as load, is always an
 * explicit choice. Identity and the stored shape are unchanged.
 */
function CustomExerciseForm({
  exercise: e,
  onCancel,
  onSaved,
}: {
  exercise?: Exercise;
  onCancel: () => void;
  onSaved: (saved: Exercise) => void;
}) {
  const r = useRepo();
  const customIds = new Set(r.customExercises().map((x) => x.id));
  const catalog = r.exercises().filter((x) => !customIds.has(x.id));
  const muscles = [...new Set(catalog.map((x) => x.muscle))].sort();
  const equipment = [...new Set(catalog.map((x) => x.equipment))].sort();
  const pick = (list: string[], value: string | undefined) =>
    value === undefined || value === ""
      ? ""
      : list.includes(value)
        ? value
        : OTHER;
  const [name, setName] = useState(e?.name ?? "");
  const [muscle, setMuscle] = useState(pick(muscles, e?.muscle));
  const [muscleText, setMuscleText] = useState(
    e && !muscles.includes(e.muscle) ? e.muscle : "",
  );
  const [gear, setGear] = useState(pick(equipment, e?.equipment));
  const [gearText, setGearText] = useState(
    e && !equipment.includes(e.equipment) ? e.equipment : "",
  );
  const [instructions, setInstructions] = useState(
    e?.instructions.join("\n") ?? "",
  );
  const [category, setCategory] = useState<Exercise["category"]>(
    e?.category ?? "strength",
  );
  const [unilateral, setUnilateral] = useState(e?.unilateral ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A field's message goes away as soon as it is changed.
  const edit =
    <T,>(key: string, set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setErrors(({ [key]: _, ...rest }) => rest);
    };

  const muscleValue =
    muscle === OTHER ? (muscleText.trim() ? muscleText : "") : muscle;
  const gearValue = gear === OTHER ? (gearText.trim() ? gearText : "") : gear;
  const saving = useRef(false);
  function save() {
    if (saving.current) return;
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "Enter a name for this exercise.";
    if (!muscleValue) problems.muscle = "Choose the main muscle it works.";
    if (!gearValue && !(e && e.equipment === ""))
      problems.equipment =
        "Choose the equipment. It decides whether the weight you log counts as load.";
    if (!instructions.trim()) problems.instructions = "Add at least one step.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    saving.current = true;
    const data: Exercise = {
      id: e?.id ?? id(),
      name,
      muscle: muscleValue,
      equipment: gearValue,
      instructions:
        e && instructions === e.instructions.join("\n")
          ? e.instructions
          : instructions.split("\n").filter((s) => s.trim()),
      secondary: e?.secondary ?? [],
      pattern: e?.pattern ?? "Custom",
      difficulty: e?.difficulty ?? "User defined",
      mistakes: e?.mistakes ?? "Use controlled technique.",
      safety: e?.safety ?? "Stop if movement is painful.",
      category,
      unilateral,
      tracking:
        e && category === e.category
          ? e.tracking
          : category === "strength"
            ? ["kg", "reps"]
            : category === "duration"
              ? ["seconds"]
              : ["meters", "seconds"],
    };
    // An untouched save leaves the stored exercise (and sync) alone.
    if (
      e &&
      (Object.keys(data) as (keyof Exercise)[]).every(
        (k) => JSON.stringify(data[k]) === JSON.stringify(e[k]),
      )
    )
      return onSaved(e);
    const result = mutate(() => r.saveExercise(data));
    if (result) onSaved(result);
    else saving.current = false;
  }
  return (
    <ForgeSubScreen
      title={e ? "Edit exercise" : "New exercise"}
      eyebrow="Custom exercise"
      onBack={onCancel}
      footer={
        <CtaButton title="Save exercise" icon="checkmark" onPress={save} />
      }
    >
      <ForgeCard>
        <Field
          label="Exercise name"
          value={name}
          onChangeText={edit("name", setName)}
          error={errors.name}
        />
        <SelectRow
          label="Main muscle"
          hint="The muscle this exercise mainly works"
          values={muscles}
          value={muscle}
          onChange={edit("muscle", setMuscle)}
          error={errors.muscle}
        />
        {muscle === OTHER && (
          <Field
            label="Muscle"
            value={muscleText}
            onChangeText={edit("muscle", setMuscleText)}
          />
        )}
        <SelectRow
          label="Equipment"
          hint="Decides whether the weight you log counts as load"
          values={equipment}
          value={gear}
          onChange={edit("equipment", setGear)}
          error={errors.equipment}
        />
        {gear === OTHER && (
          <Field
            label="Equipment name"
            value={gearText}
            onChangeText={edit("equipment", setGearText)}
          />
        )}
        <SegmentedControl
          label="Measured by"
          options={CATEGORIES}
          value={category}
          onChange={(c) => setCategory(c as Exercise["category"])}
        />
        <SegmentedControl
          label="Sides"
          options={SIDES}
          value={unilateral ? "unilateral" : "bilateral"}
          onChange={(s) => setUnilateral(s === "unilateral")}
        />
        <Field
          label="Instructions (one step per line)"
          multiline
          value={instructions}
          onChangeText={edit("instructions", setInstructions)}
          error={errors.instructions}
        />
      </ForgeCard>
    </ForgeSubScreen>
  );
}

/** A labelled choice that shows its current value and opens a list. */
function SelectRow({
  label,
  hint,
  values,
  value,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="caption" tone="secondary">
        {label}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || "not chosen"}. Choose ${label.toLowerCase()}`}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: theme.heights.control,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.spacing.md,
          paddingHorizontal: 14,
          borderRadius: theme.radii.control,
          backgroundColor: c.surfaceRaised,
          borderWidth: 1,
          borderColor: error ? c.error : "transparent",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Txt tone={value ? "primary" : "secondary"} style={{ flexShrink: 1 }}>
          {value || "Choose"}
        </Txt>
        <Txt tone="secondary">›</Txt>
      </Pressable>
      <FieldError label={label} error={error} />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={`Choose ${label.toLowerCase()}`}
      >
        <Choices
          label={hint}
          options={[...values, OTHER].map((v) => ({ value: v }))}
          value={value}
          onChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
