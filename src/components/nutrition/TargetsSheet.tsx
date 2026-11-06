import React, { useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Sheet, confirmDiscard, useColors } from "../ui";
import { CtaButton, FText, ForgeField, OutlineButton } from "../reforge";
import { useRepo, mutate } from "../../state";
import {
  TARGETS_SAVED,
  kcalText,
  targetsPersonalized,
} from "../../domain/nutrition";
import {
  TARGET_KEYS,
  macroEnergy,
  readTargets,
  targetTexts,
  type TargetKey,
  type TargetTexts,
} from "../../domain/targets";
import { readFormNumber } from "../../domain/numbers";
import { forge } from "../../theme";

const LABELS: Record<TargetKey, string> = {
  calories: "Calories (kcal)",
  protein: "Protein (g)",
  carbs: "Carbs (g)",
  fat: "Fat (g)",
};

/**
 * Daily targets, edited inside Nutrition (Phase 7.3G G2): calories and the
 * three macros. The same storage, reading and validation as the You tab's
 * editor; saving marks the targets as the lifter's own (as an explicit save
 * there does), Cancel and Close keep nothing. One target never changes
 * another. Mount it when needed.
 */
export function TargetsSheet({ onClose }: { onClose: () => void }) {
  const r = useRepo();
  const c = useColors();
  const [start] = useState(() => {
    const p = r.profile();
    return {
      texts: targetTexts(p),
      own: targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1"),
    };
  });
  const [texts, setTexts] = useState<TargetTexts>(start.texts);
  const [errors, setErrors] = useState<
    Partial<Record<TargetKey | "form", string>>
  >({});
  const saving = useRef(false);
  const dirty = TARGET_KEYS.some((k) => texts[k] !== start.texts[k]);

  function change(key: TargetKey, text: string) {
    setTexts((t) => ({ ...t, [key]: text }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      delete next.form;
      return next;
    });
  }
  function cancel() {
    if (dirty) confirmDiscard(onClose);
    else onClose();
  }
  function save() {
    if (saving.current) return;
    const result = readTargets(r.profile(), texts);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    saving.current = true;
    const ok = mutate(() => {
      r.saveProfile(result.values);
      // An explicit save makes them the lifter's own, even if they match
      // the suggested defaults (as in You).
      r.setSetting(TARGETS_SAVED, "1");
      return true;
    });
    if (!ok) {
      saving.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility("Daily targets saved");
    onClose();
  }

  const macros = TARGET_KEYS.slice(1).map((k) => readFormNumber(texts[k]));
  const implied = macros.every((n) => Number.isFinite(n) && n >= 0)
    ? macroEnergy({
        protein: macros[0]!,
        carbs: macros[1]!,
        fat: macros[2]!,
      })
    : undefined;
  const field = (key: TargetKey) => (
    <ForgeField
      key={key}
      label={LABELS[key]}
      value={texts[key]}
      keyboardType="decimal-pad"
      placeholder="0"
      selectTextOnFocus
      error={errors[key]}
      onChangeText={(t) => change(key, t)}
    />
  );
  const card = {
    gap: forge.spacing.group,
    padding: forge.spacing.cardPadding,
    borderRadius: forge.radii.card,
    borderWidth: forge.border.card,
    borderColor: c.cardBorder,
    backgroundColor: c.cardBg,
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Daily targets"
      unsaved={dirty}
      footer={
        <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
          <View style={{ flex: 1 }}>
            <OutlineButton title="Cancel" onPress={cancel} />
          </View>
          <View style={{ flex: 2 }}>
            <CtaButton
              compact
              title="Save targets"
              icon="checkmark"
              onPress={save}
            />
          </View>
        </View>
      }
    >
      <View style={{ gap: forge.spacing.cardGap }}>
        <FText variant="body" tone="secondary">
          {start.own
            ? "Your targets for every day. Totals and the calorie goal update as soon as you save."
            : "Suggested starting targets. Adjust them and save to make them your own."}
        </FText>
        <View style={card}>
          <FText variant="overline" tone="secondary" header>
            Energy
          </FText>
          {field("calories")}
        </View>
        <View style={card}>
          <FText variant="overline" tone="secondary" header>
            Macros
          </FText>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: forge.spacing.tight,
            }}
          >
            {field("protein")}
            {field("carbs")}
            {field("fat")}
          </View>
          {implied !== undefined && (
            <FText variant="label" tone="secondary">
              {`These macros add up to about ${kcalText(implied)} (4 kcal per gram of protein and carbs, 9 per gram of fat). Each target is saved as you enter it.`}
            </FText>
          )}
        </View>
        {errors.form && (
          <FText variant="label" tone="error">
            {errors.form}
          </FText>
        )}
      </View>
    </Sheet>
  );
}
