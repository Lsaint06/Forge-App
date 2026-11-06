import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FieldError, parseNumber, useColors } from "../ui";
import { FText, ForgeField, ForgeSegments, ForgeStepper } from "../reforge";
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
import {
  displayBarcode,
  energyWarning,
  servingLabel,
  servingValues,
  type LabelDraft,
  type LabelErrors,
} from "../../domain/personal-foods";
import { forge } from "../../theme";

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
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const entry = kind !== "food";
  const legacyMeal =
    entry && draft.meal.trim() && !canonicalMeal(draft.meal)
      ? draft.meal.trim()
      : undefined;
  const preview = entry ? previewText(draft) : undefined;
  const today = localDate();
  const macro = (key: Macro, label: string) => (
    <ForgeField
      key={key}
      label={label}
      value={draft[key]}
      keyboardType="decimal-pad"
      error={errors[key]}
      onChangeText={(v) => onChange({ [key]: v })}
    />
  );
  const servings = entry ? "Servings" : "Default servings";
  return (
    <View style={{ gap: forge.spacing.cardGap }}>
      <ForgeField
        label="Food name"
        value={draft.name}
        autoCapitalize="sentences"
        placeholder="e.g. Greek yogurt"
        error={errors.name}
        onChangeText={(v) => onChange({ name: v })}
      />
      {/* The label's values, for one serving. */}
      <View
        style={{
          gap: forge.spacing.group,
          padding: forge.spacing.cardPadding,
          borderRadius: forge.radii.card,
          borderWidth: forge.border.card,
          borderColor: c.cardBorder,
          backgroundColor: c.cardBg,
        }}
      >
        <FText variant="overline" tone="secondary" header>
          Per serving
        </FText>
        {macro("calories", "Calories (kcal)")}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: forge.spacing.tight,
          }}
        >
          {macro("protein", "Protein (g)")}
          {macro("carbs", "Carbs (g)")}
          {macro("fat", "Fat (g)")}
        </View>
        <ForgeField
          label="Serving size (optional)"
          value={draft.serving}
          placeholder="e.g. 40 g, 1 scoop"
          onChangeText={(v) => onChange({ serving: v })}
        />
      </View>
      <View style={{ gap: 8 }}>
        <FText variant="overline" tone="secondary">
          {entry ? "Servings eaten" : "Default servings"}
        </FText>
        <ForgeStepper
          label={servings}
          value={draft.quantity}
          step={0.25}
          min={0.01}
          floor={0.25}
          max={1000}
          unit={draft.serving.trim() ? `× ${draft.serving.trim()}` : "servings"}
          onChange={(quantity) => onChange({ quantity })}
        />
        <FieldError label={servings} error={errors.quantity || undefined} />
        {preview && (
          <FText variant="label" tone="secondary">
            {`Total ${preview}`}
          </FText>
        )}
      </View>
      {entry && (
        <View style={{ gap: 8 }}>
          <FText variant="overline" tone="secondary">
            Meal
          </FText>
          <ForgeSegments
            options={MEALS.map((m) => ({ value: m as string, label: m }))}
            value={canonicalMeal(draft.meal) ?? ""}
            onChange={(meal) => onChange({ meal })}
          />
          {legacyMeal && (
            <FText variant="label" tone="secondary">
              {`Logged under “${legacyMeal}”. Choose a meal to move it.`}
            </FText>
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
              minHeight: forge.heights.button,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: forge.spacing.group,
              borderRadius: forge.radii.tile,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: pressed ? c.cardRaised : c.cardBg,
            })}
          >
            <Ionicons name="calendar-outline" size={18} color={c.text2} />
            <FText variant="body" tone="secondary" style={{ flex: 1 }}>
              Day
            </FText>
            <FText variant="body" weight="700">
              {dayTitle(date, today)}
            </FText>
            <Ionicons name="chevron-forward" size={16} color={c.text2} />
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
        <ForgeField
          label="Notes (optional)"
          value={draft.notes}
          multiline
          style={{ minHeight: 88, textAlignVertical: "top" }}
          onChangeText={(v) => onChange({ notes: v })}
        />
      )}
    </View>
  );
}

/**
 * The label form for a barcode-linked food or a correction (Phase 7.3F.2
 * M2): the scanned barcode (shown, never typed), name and brand, the serving
 * as printed ("1 can", 355 ml), and the Nutrition Facts values, read per
 * serving (the usual label) or per 100 g / 100 ml. The values per serving
 * that will be saved are previewed, so a per-100 conversion can be checked
 * before saving.
 */
export function LabelFields({
  draft,
  onChange,
  errors,
  barcodeNote,
}: {
  draft: LabelDraft;
  onChange: (patch: Partial<LabelDraft>) => void;
  errors: LabelErrors;
  /** Where the barcode came from ("From your scan"). */
  barcodeNote: string;
}) {
  const c = useColors();
  const per100 = draft.basis === "100";
  const values = per100 ? draft.per100 : draft.perServing;
  const setValue = (key: keyof typeof values, v: string) =>
    onChange(
      per100
        ? { per100: { ...draft.per100, [key]: v } }
        : { perServing: { ...draft.perServing, [key]: v } },
    );
  const macro = (key: keyof typeof values, label: string) => (
    <ForgeField
      key={key}
      label={label}
      value={values[key]}
      keyboardType="decimal-pad"
      error={errors[key]}
      onChangeText={(v) => setValue(key, v)}
    />
  );
  const amount = Number(draft.amount.replace(",", "."));
  const serving =
    servingLabel(
      draft.household,
      draft.amount.trim() && Number.isFinite(amount) && amount > 0
        ? amount
        : undefined,
      draft.unit,
    ) ?? "1 serving";
  const preview = servingValues(draft);
  const warning = preview && energyWarning(preview);
  const card = {
    gap: forge.spacing.group,
    padding: forge.spacing.cardPadding,
    borderRadius: forge.radii.card,
    borderWidth: forge.border.card,
    borderColor: c.cardBorder,
    backgroundColor: c.cardBg,
  };
  return (
    <View style={{ gap: forge.spacing.cardGap }}>
      {!!draft.barcode && (
        <View
          accessible
          accessibilityLabel={`Barcode ${displayBarcode(draft.barcode)}, ${barcodeNote}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Ionicons name="barcode-outline" size={22} color={c.emberHot} />
          <View style={{ flex: 1 }}>
            <FText
              variant="body"
              weight="700"
              style={{ fontVariant: ["tabular-nums"], letterSpacing: 1 }}
            >
              {displayBarcode(draft.barcode)}
            </FText>
            <FText variant="label" tone="secondary">
              {barcodeNote}
            </FText>
          </View>
        </View>
      )}
      {errors.barcode && (
        <FText variant="label" tone="error">
          {errors.barcode}
        </FText>
      )}
      <ForgeField
        label="Food name"
        value={draft.name}
        autoCapitalize="words"
        placeholder="As on the package, e.g. Dr Pepper"
        error={errors.name}
        onChangeText={(v) => onChange({ name: v })}
      />
      <ForgeField
        label="Brand (optional)"
        value={draft.brand}
        autoCapitalize="words"
        placeholder="e.g. Keurig Dr Pepper"
        error={errors.brand}
        onChangeText={(v) => onChange({ brand: v })}
      />
      <View style={card}>
        <FText variant="overline" tone="secondary" header>
          Serving size
        </FText>
        <ForgeField
          label="Serving name (optional)"
          value={draft.household}
          placeholder="e.g. 1 can, 1 bar, 2 cookies"
          error={errors.household}
          onChangeText={(v) => onChange({ household: v })}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: forge.spacing.tight,
          }}
        >
          <View style={{ flex: 1 }}>
            <ForgeField
              label={`Amount (${draft.unit})`}
              value={draft.amount}
              keyboardType="decimal-pad"
              placeholder={draft.unit === "ml" ? "e.g. 355" : "e.g. 40"}
              error={errors.amount}
              onChangeText={(v) => onChange({ amount: v })}
            />
          </View>
          <View style={{ width: 128, paddingBottom: errors.amount ? 22 : 0 }}>
            <ForgeSegments
              options={[
                { value: "g", label: "g", accessibilityLabel: "Grams" },
                { value: "ml", label: "ml", accessibilityLabel: "Millilitres" },
              ]}
              value={draft.unit}
              onChange={(unit) => onChange({ unit })}
            />
          </View>
        </View>
        <FText variant="label" tone="secondary">
          {`1 serving = ${serving}. As printed on the label; grams and millilitres are never converted.`}
        </FText>
      </View>
      <View style={card}>
        <FText variant="overline" tone="secondary" header>
          Nutrition facts
        </FText>
        <ForgeSegments
          options={[
            { value: "serving", label: "Per serving" },
            { value: "100", label: `Per 100 ${draft.unit}` },
          ]}
          value={draft.basis}
          onChange={(basis) => onChange({ basis })}
        />
        <FText variant="label" tone="secondary">
          {per100
            ? `Values for 100 ${draft.unit}. FORGE works out one serving from the amount above.`
            : "Values for one serving, as the Nutrition Facts label lists them."}
        </FText>
        {macro("calories", "Calories (kcal)")}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: forge.spacing.tight,
          }}
        >
          {macro("protein", "Protein (g)")}
          {macro("carbs", "Carbs (g)")}
          {macro("fat", "Fat (g)")}
        </View>
        {preview && (
          <FText variant="label" weight="600">
            {`${capitalizeFirst(serving)}: ${kcalText(preview.calories)} · P ${gramsText(preview.protein)} · C ${gramsText(preview.carbs)} · F ${gramsText(preview.fat)}`}
          </FText>
        )}
        {warning && (
          <FText variant="label" tone="accent">
            {warning}
          </FText>
        )}
      </View>
      {errors.form && (
        <FText variant="label" tone="error">
          {errors.form}
        </FText>
      )}
    </View>
  );
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
