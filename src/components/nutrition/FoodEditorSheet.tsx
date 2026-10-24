import React, { useRef, useState } from "react";
import { View } from "react-native";
import { Alert } from "../../platform/alert";
import { Sheet, Button, Txt, confirmDiscard } from "../ui";
import {
  FoodFields,
  draftFrom,
  readDraft,
  sameDraft,
  type DraftErrors,
  type FoodDraft,
} from "./FoodForm";
import { useRepo, mutate } from "../../state";
import {
  amount,
  isDuplicateFood,
  mergeEntry,
  sourceMeta,
  withSourceEdits,
  type NutritionData,
} from "../../domain/nutrition";
import { sourceLabel } from "../../domain/food-library";
import type { Journal } from "../../domain/types";
import { theme } from "../../theme";

export type FoodEditorTarget =
  { kind: "entry"; entry: Journal } | { kind: "food"; food?: Journal };

/**
 * Edits a logged entry, or creates or edits a saved food. Saving changes
 * only the fields that were edited and runs once even if tapped twice;
 * closing with changes asks first. Mount it when needed.
 */
export function FoodEditorSheet({
  target,
  onClose,
}: {
  target: FoodEditorTarget;
  onClose: () => void;
}) {
  const r = useRepo();
  const original =
    target.kind === "entry" ? target.entry : (target.food ?? undefined);
  const [initial] = useState<FoodDraft>(() => draftFrom(original?.data));
  const [draft, setDraft] = useState(initial);
  const [date, setDate] = useState(original?.date ?? "");
  const [errors, setErrors] = useState<DraftErrors>({});
  const saving = useRef(false);
  const dirty =
    !sameDraft(draft, initial) || (!!original && date !== original.date);
  const title =
    target.kind === "entry"
      ? "Edit entry"
      : target.food
        ? "Edit saved food"
        : "New saved food";

  function change(patch: Partial<FoodDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof FoodDraft];
      return next;
    });
  }
  function cancel() {
    if (dirty) confirmDiscard(onClose);
    else onClose();
  }
  function save() {
    if (saving.current) return;
    const result = readDraft(draft, {
      withMeal: target.kind === "entry",
      initial: original ? initial : undefined,
    });
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    saving.current = true;
    const changes: NutritionData = result.data;
    const ok = mutate(() => {
      if (original) {
        if (!Object.keys(changes).length && date === original.date) return true;
        r.updateJournal(
          original.id,
          withSourceEdits(mergeEntry(original.data, changes), changes),
          target.kind === "entry" ? date : undefined,
        );
        return true;
      }
      if (isDuplicateFood(r.journal("food"), changes)) return "duplicate";
      r.addJournal("food", changes);
      return true;
    });
    if (ok === "duplicate") {
      saving.current = false;
      Alert.alert(
        "Already saved",
        `${String(changes.name)} with these values is already in your saved foods.`,
      );
      return;
    }
    if (!ok) {
      saving.current = false;
      return;
    }
    onClose();
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      unsaved={dirty}
      footer={
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="secondary" onPress={cancel} />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              title={
                target.kind === "food" && !target.food ? "Save food" : "Save"
              }
              accessibilityLabel={
                target.kind === "entry" ? "Save entry" : "Save food"
              }
              icon="checkmark"
              onPress={save}
            />
          </View>
        </View>
      }
    >
      <SourceNote data={original?.data} quantity={draft.quantity} />
      <FoodFields
        draft={draft}
        onChange={change}
        errors={errors}
        kind={target.kind === "entry" ? "entry" : "food"}
        date={target.kind === "entry" ? date : undefined}
        onDate={target.kind === "entry" ? setDate : undefined}
      />
    </Sheet>
  );
}

/**
 * Where a library food's values came from, and the weight eaten, so a
 * reopened entry reads plainly ("USDA FNDDS · FDC 2707154 · 2 × 50 g =
 * 100 g"). Edited values are labelled as based on, not from, USDA.
 */
function SourceNote({
  data,
  quantity,
}: {
  data?: NutritionData;
  quantity: number;
}) {
  const meta = data && sourceMeta(data);
  if (!meta?.sourceId) return null;
  const weight = meta.sourceGrams
    ? quantity === 1
      ? ` · 1 serving = ${amount(meta.sourceGrams)} g`
      : ` · ${amount(quantity)} × ${amount(meta.sourceGrams)} g = ${amount(meta.sourceGrams * quantity)} g`
    : "";
  return (
    <Txt variant="caption" tone="secondary">
      {`${meta.sourceEdited ? "Based on " : "From "}${sourceLabel(meta.sourceId)}${meta.sourceEdited ? " (values edited)" : ""}${weight}`}
    </Txt>
  );
}
