import React, { useState } from "react";
import { Screen, Button, Field, Txt, Empty } from "../components/ui";
import { ListRow, ListSection, OverflowMenu } from "../components/system";
import {
  FoodEditorSheet,
  type FoodEditorTarget,
} from "../components/nutrition/FoodEditorSheet";
import { useRepo, confirm } from "../state";
import { goBack } from "../navigation";
import { amount, kcalText } from "../domain/nutrition";
import { personalInfo } from "../domain/personal-foods";
import type { Journal } from "../domain/types";

// Saved foods: the lifter's own library of label values, searchable. Logged
// entries keep their own copy of the values, so editing or deleting a food
// here never changes what was eaten before.

export default function SavedFoods() {
  const r = useRepo();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FoodEditorTarget>();
  const foods = r.journal("food");
  const q = query.trim().toLowerCase();
  const shown = foods
    .filter(
      (f) =>
        !q ||
        String(f.data.name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(f.data.serving ?? "")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) =>
      String(a.data.name ?? "").localeCompare(
        String(b.data.name ?? ""),
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );

  function remove(f: Journal) {
    const own = personalInfo(f.data);
    const effect =
      own?.kind === "correction"
        ? " Scanning or opening the product will show USDA's values again."
        : own?.kind === "food"
          ? " Scanning its barcode will show Product not found again."
          : "";
    confirm(
      own?.kind === "correction" ? "Remove correction?" : "Delete saved food?",
      `${String(f.data.name)} will be removed from your saved foods.${effect} Entries you've already logged keep their values.`,
      () => r.deleteJournal(f.id),
      {
        action:
          own?.kind === "correction" ? "Remove correction" : "Delete food",
      },
    );
  }
  const macros = (f: Journal) =>
    // Non-breaking spaces keep each value with its unit.
    `P\u00a0${amount(Number(f.data.protein))}\u00a0g · C\u00a0${amount(Number(f.data.carbs))}\u00a0g · F\u00a0${amount(Number(f.data.fat))}\u00a0g`;
  /** "Your label · Dr Pepper · ": a personal barcode food's origin. */
  const origin = (f: Journal) => {
    const own = personalInfo(f.data);
    if (!own) return "";
    return `${own.kind === "correction" ? "Your correction" : "Your label"}${own.brand ? ` · ${own.brand}` : ""} · `;
  };

  return (
    <Screen
      title="Saved foods"
      eyebrow={
        foods.length
          ? `${foods.length} ${foods.length === 1 ? "food" : "foods"}`
          : undefined
      }
      onBack={() => goBack("/(tabs)/nutrition")}
      footer={
        <Button
          title="Create food"
          icon="add"
          onPress={() => setEditing({ kind: "food" })}
        />
      }
    >
      {foods.length ? (
        <>
          <Field
            label="Search saved foods"
            value={query}
            onChangeText={setQuery}
            placeholder="Name or serving"
            autoCorrect={false}
          />
          {shown.length ? (
            <ListSection footer="Values are per serving. Changing a food here doesn't change entries already logged.">
              {shown.map((f) => {
                const name = String(f.data.name);
                const per = kcalText(Number(f.data.calories));
                return (
                  <ListRow
                    key={f.id}
                    title={name}
                    subtitle={`${origin(f)}${String(f.data.serving ?? "").trim() || "1 serving"} · ${macros(f)}`}
                    value={per}
                    chevron={false}
                    accessibilityLabel={`Edit ${name}`}
                    onPress={() => setEditing({ kind: "food", food: f })}
                    trailing={
                      <OverflowMenu
                        label={`Options for ${name}`}
                        title={name}
                        actions={[
                          {
                            label: "Edit",
                            icon: "create-outline",
                            onPress: () =>
                              setEditing({ kind: "food", food: f }),
                          },
                          {
                            label:
                              personalInfo(f.data)?.kind === "correction"
                                ? "Remove correction"
                                : "Delete",
                            icon: "trash-outline",
                            destructive: true,
                            onPress: () => remove(f),
                          },
                        ]}
                      />
                    }
                  />
                );
              })}
            </ListSection>
          ) : (
            <Txt tone="secondary">{`No saved foods match “${query.trim()}”.`}</Txt>
          )}
        </>
      ) : (
        <Empty
          title="No saved foods yet"
          detail="Save the foods you eat often with the values from their label. They appear in Nutrition's Add food, ready to log in one tap."
        />
      )}
      {editing && (
        <FoodEditorSheet
          target={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Screen>
  );
}
