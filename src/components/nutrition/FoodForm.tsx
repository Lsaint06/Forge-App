import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Field, Txt, SegmentedControl, parseNumber } from "../ui";
import { NumberControl } from "../Stepper";
import { DateSheet } from "../DateSheet";
import {
  MEALS,
  canonicalMeal,
  gramsText,
  kcalText,
  type NutritionData,
} from "../../domain/nutrition";
import { dayTitle } from "../../domain/calendar-dates";
import { localDate } from "../../domain/types";
import { theme } from "../../theme";

// The fields of a food or a logged entry: label values per serving, the
// serving, how many servings, and (for entries) the meal, day and notes.
// Values are kept as typed until saving, so nothing is rounded on the way.

export type FoodDraft = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  serving: string;
  quantity: number;
  meal: string;
  notes: string;
};
const MACROS = ["calories", "protein", "carbs", "fat"] as const;
type Macro = (typeof MACROS)[number];

const text = (v: unknown) =>
  v === undefined || v === null || v === "" ? "" : String(v);

export function draftFrom(data?: NutritionData, meal = ""): FoodDraft {
  const q = Number(data?.quantity);
  return {
    name: text(data?.name),
    calories: text(data?.calories),
    protein: text(data?.protein),
    carbs: text(data?.carbs),
    fat: text(data?.fat),
    serving: text(data?.serving),
    quantity: Number.isFinite(q) && q > 0 ? q : 1,
    meal: data && "meal" in data ? text(data.meal) : meal,
    notes: text(data?.notes),
  };
}

export type DraftErrors = Partial<Record<keyof FoodDraft, string>>;

/**
 * The fields to store, or what to fix. When `initial` is given (an edit),
 * only fields that differ from it are returned, so untouched values are
 * never rewritten.
 */
export function readDraft(
  draft: FoodDraft,
  { withMeal, initial }: { withMeal: boolean; initial?: FoodDraft },
): { data: NutritionData } | { errors: DraftErrors } {
  const errors: DraftErrors = {};
  const data: NutritionData = {};
  if (!draft.name.trim()) errors.name = "Enter a name";
  else data.name = draft.name.trim();
  for (const key of MACROS) {
    const result = parseNumber(draft[key], { min: 0, max: 20000 });
    if ("error" in result)
      errors[key] = draft[key].trim()
        ? "Enter a number from 0 to 20000"
        : "Enter a number (0 if none)";
    else data[key] = result.value!;
  }
  if (!(draft.quantity >= 0.01 && draft.quantity <= 1000))
    errors.quantity = "Enter servings from 0.01 to 1000";
  else data.quantity = draft.quantity;
  data.serving = draft.serving.trim();
  if (withMeal) data.meal = draft.meal;
  data.notes = draft.notes.trim();
  if (Object.keys(errors).length) return { errors };
  if (!initial) {
    // New records carry no empty optional text.
    if (!data.serving) delete data.serving;
    if (!data.notes) delete data.notes;
    return { data };
  }
  const changed: NutritionData = {};
  for (const [key, value] of Object.entries(data)) {
    const before = initial[key as keyof FoodDraft];
    const after = draft[key as keyof FoodDraft];
    const same =
      typeof before === "number"
        ? before === after
        : before.trim() === String(after).trim();
    if (!same) changed[key] = value;
  }
  return { data: changed };
}

export const sameDraft = (a: FoodDraft, b: FoodDraft) =>
  JSON.stringify(a) === JSON.stringify(b);

/** "195 kcal · P 4 g · C 42 g · F 0 g" for the servings chosen. */
export function previewText(draft: FoodDraft) {
  const values = MACROS.map((k) => parseNumber(draft[k], { min: 0 }));
  if (values.some((v) => "error" in v)) return undefined;
  const [kcal, p, c, f] = values.map(
    (v) => ((v as { value: number }).value ?? 0) * draft.quantity,
  ) as [number, number, number, number];
  return `${kcalText(kcal)} · P ${gramsText(p)} · C ${gramsText(c)} · F ${gramsText(f)}`;
}

export function FoodFields({
  draft,
  onChange,
  errors,
  kind,
  date,
  onDate,
}: {
  draft: FoodDraft;
  onChange: (patch: Partial<FoodDraft>) => void;
  errors: DraftErrors;
  /**
   * "entry" edits a logged entry (meal, day, notes); "new-entry" logs one
   * (meal only); "food" is a saved food (default servings, no meal).
   */
  kind: "entry" | "new-entry" | "food";
  date?: string;
  onDate?: (date: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const entry = kind !== "food";
  const legacyMeal =
    entry && draft.meal.trim() && !canonicalMeal(draft.meal)
      ? draft.meal.trim()
      : undefined;
  const preview = entry ? previewText(draft) : undefined;
  const today = localDate();
  const macro = (key: Macro, label: string) => (
    <Field
      key={key}
      label={label}
      value={draft[key]}
      keyboardType="decimal-pad"
      error={errors[key]}
      onChangeText={(v) => onChange({ [key]: v })}
    />
  );
  return (
    <>
      <Field
        label="Food name"
        value={draft.name}
        autoCapitalize="sentences"
        placeholder="e.g. Greek yogurt"
        error={errors.name}
        onChangeText={(v) => onChange({ name: v })}
      />
      <Txt variant="overline" tone="secondary" header>
        Per serving
      </Txt>
      {macro("calories", "Calories (kcal)")}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.sm,
        }}
      >
        {macro("protein", "Protein (g)")}
        {macro("carbs", "Carbs (g)")}
        {macro("fat", "Fat (g)")}
      </View>
      <Field
        label="Serving size (optional)"
        value={draft.serving}
        placeholder="e.g. 40 g, 1 scoop"
        onChangeText={(v) => onChange({ serving: v })}
      />
      <View style={{ gap: 6 }}>
        <Txt variant="caption" tone="secondary">
          {entry ? "Servings eaten" : "Default servings"}
        </Txt>
        <NumberControl
          label={entry ? "Servings" : "Default servings"}
          value={draft.quantity}
          step={0.25}
          min={0.01}
          floor={0.25}
          max={1000}
          onChange={(quantity) => onChange({ quantity })}
        />
        {!!errors.quantity && (
          <Txt variant="caption" tone="error">
            {errors.quantity}
          </Txt>
        )}
        {preview && (
          <Txt variant="caption" tone="secondary" tabular>
            {`Total ${preview}`}
          </Txt>
        )}
      </View>
      {entry && (
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="secondary">
            Meal
          </Txt>
          <SegmentedControl
            label="Meal"
            options={[...MEALS]}
            value={canonicalMeal(draft.meal) ?? ""}
            onChange={(meal) => onChange({ meal })}
          />
          {legacyMeal && (
            <Txt variant="caption" tone="secondary">
              {`Logged under “${legacyMeal}”. Choose a meal to move it.`}
            </Txt>
          )}
        </View>
      )}
      {kind === "entry" && date && onDate && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Day, ${dayTitle(date, today)}. Change day`}
            onPress={() => setPicking(true)}
            style={({ pressed }) => ({
              minHeight: theme.heights.control,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Txt tone="secondary">Day</Txt>
            <Txt weight="600">{`${dayTitle(date, today)} ›`}</Txt>
          </Pressable>
          {/* Rendered inside the editor sheet so iOS presents it on top. */}
          <DateSheet
            visible={picking}
            range="past"
            title="Move to a day"
            confirmLabel="Move"
            initial={date > today ? today : date}
            onClose={() => setPicking(false)}
            onConfirm={(day) => {
              setPicking(false);
              onDate(day);
            }}
          />
        </>
      )}
      {kind === "entry" && (
        <Field
          label="Notes (optional)"
          value={draft.notes}
          multiline
          onChangeText={(v) => onChange({ notes: v })}
        />
      )}
    </>
  );
}
