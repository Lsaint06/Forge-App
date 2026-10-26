import React, { useRef, useState } from "react";
import { View } from "react-native";
import { Alert } from "../../platform/alert";
import { Sheet, confirmDiscard } from "../ui";
import { CtaButton, FText, OutlineButton } from "../reforge";
import {
  FoodFields,
  LabelFields,
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
import {
  labelDraftFrom,
  personalConflict,
  personalInfo,
  readLabelDraft,
  type LabelDraft,
  type LabelErrors,
} from "../../domain/personal-foods";
import type { Journal } from "../../domain/types";
import { forge } from "../../theme";

export type FoodEditorTarget =
  { kind: "entry"; entry: Journal } | { kind: "food"; food?: Journal };

/**
 * Edits a logged entry, or creates or edits a saved food. A personal
 * barcode food or correction (Phase 7.3F.2 M2) is edited with its label
 * form, so its barcode and serving stay linked. Mount it when needed.
 */
export function FoodEditorSheet({
  target,
  onClose,
}: {
  target: FoodEditorTarget;
  onClose: () => void;
}) {
  if (target.kind === "food" && target.food && personalInfo(target.food.data))
    return <PersonalFoodEditor food={target.food} onClose={onClose} />;
  return <GenericFoodEditor target={target} onClose={onClose} />;
}

function PersonalFoodEditor({
  food,
  onClose,
}: {
  food: Journal;
  onClose: () => void;
}) {
  const r = useRepo();
  const info = personalInfo(food.data)!;
  const [initial] = useState<LabelDraft>(() => labelDraftFrom(food.data));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<LabelErrors>({});
  const saving = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const correction = info.kind === "correction";
  function cancel() {
    if (dirty) confirmDiscard(onClose);
    else onClose();
  }
  function save() {
    if (saving.current) return;
    const result = readLabelDraft(
      draft,
      correction
        ? {
            kind: "correction",
            of: {
              sourceId: String(food.data.sourceId ?? ""),
              ...(typeof food.data.sourceCatalog === "string"
                ? { sourceCatalog: food.data.sourceCatalog }
                : {}),
            },
          }
        : { kind: "food" },
    );
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    const conflict = personalConflict(r.journal("food"), result.data, food.id);
    if (conflict) {
      setErrors({
        form: `You've already saved this barcode as “${String(conflict.data.name)}”.`,
      });
      return;
    }
    saving.current = true;
    const ok = mutate(() => {
      r.updateJournal(food.id, result.data);
      return true;
    });
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
      title={correction ? "Edit correction" : "Edit food"}
      unsaved={dirty}
      footer={
        <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
          <View style={{ flex: 1 }}>
            <OutlineButton title="Cancel" onPress={cancel} />
          </View>
          <View style={{ flex: 2 }}>
            <CtaButton
              compact
              title="Save"
              accessibilityLabel={correction ? "Save correction" : "Save food"}
              icon="checkmark"
              onPress={save}
            />
          </View>
        </View>
      }
    >
      <View style={{ gap: forge.spacing.cardGap }}>
        <FText variant="label" tone="secondary">
          {correction
            ? `Your correction of ${sourceLabel(String(food.data.sourceId ?? ""))}. Entries already logged keep their values.`
            : "Your food, from its package label. Entries already logged keep their values."}
        </FText>
        <LabelFields
          draft={draft}
          onChange={(patch) => {
            setDraft((d) => ({ ...d, ...patch }));
            setErrors({});
          }}
          errors={errors}
          barcodeNote={
            correction ? "Barcode of the USDA product" : "Linked barcode"
          }
        />
      </View>
    </Sheet>
  );
}

function GenericFoodEditor({
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
        <View style={{ flexDirection: "row", gap: forge.spacing.tight }}>
          <View style={{ flex: 1 }}>
            <OutlineButton title="Cancel" onPress={cancel} />
          </View>
          <View style={{ flex: 2 }}>
            <CtaButton
              compact
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
 * Where a library or branded food's values came from, and the amount eaten,
 * so a reopened entry reads plainly ("USDA FNDDS · FDC 2707154 · 2 × 50 g =
 * 100 g", or "QUEST · USDA Branded Foods · FDC 2758974 · 1 serving = 60 g ·
 * barcode 00888849000708"). Edited values are labelled as based on, not
 * from, USDA.
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
  const per = meta.sourceGrams ?? meta.sourceMl;
  const unit = meta.sourceMl !== undefined && !meta.sourceGrams ? "ml" : "g";
  const weight = per
    ? quantity === 1
      ? ` · 1 serving = ${amount(per)} ${unit}`
      : ` · ${amount(quantity)} × ${amount(per)} ${unit} = ${amount(per * quantity)} ${unit}`
    : "";
  return (
    <FText variant="label" tone="secondary">
      {`${meta.sourceBrand ? `${meta.sourceBrand} · ` : ""}${meta.sourceEdited ? "Based on " : "From "}${sourceLabel(meta.sourceId)}${meta.sourceEdited ? " (values edited)" : ""}${weight}${meta.sourceBarcode ? ` · barcode ${meta.sourceBarcode}` : ""}`}
    </FText>
  );
}
