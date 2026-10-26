import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useColors } from "../components/ui";
import { OverflowMenu } from "../components/system";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeSearchField,
  ForgeSegments,
  ForgeSubScreen,
  OutlineButton,
  SectionLabel,
} from "../components/reforge";
import {
  FoodEditorSheet,
  type FoodEditorTarget,
} from "../components/nutrition/FoodEditorSheet";
import { useRepo, confirm } from "../state";
import { goBack } from "../navigation";
import { personalInfo } from "../domain/personal-foods";
import type { Journal } from "../domain/types";
import { forge } from "../theme";
import {
  EMPTY_FILTER,
  SAVED_FILTERS,
  filterCounts,
  savedFoodRow,
  shownFoods,
  type SavedFilter,
} from "./nutrition/saved-foods";

// Saved foods (REFORGE, Phase 7.3G G1): the lifter's own library of label
// values, barcode foods and corrections, searchable and filterable. Logged
// entries keep their own copy of the values, so editing or deleting a food
// here never changes what was eaten before. Editing opens the existing
// editors (a personal food or correction opens its label form).

export default function SavedFoods() {
  const r = useRepo();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SavedFilter>("all");
  const [editing, setEditing] = useState<FoodEditorTarget>();
  const foods = r.journal("food");
  const counts = filterCounts(foods);
  const shown = shownFoods(foods, query, filter);
  const searching = !!query.trim();

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

  const empty = () => {
    if (searching)
      return (
        <ForgeEmpty
          title="No matching foods"
          detail={`Nothing saved matches “${query.trim()}”${filter === "all" ? "" : " in this filter"}.`}
          action={
            <OutlineButton
              title="Show all saved foods"
              onPress={() => {
                setQuery("");
                setFilter("all");
              }}
            />
          }
        />
      );
    const note = filter === "all" ? undefined : EMPTY_FILTER[filter];
    return note ? <ForgeEmpty title={note.title} detail={note.detail} /> : null;
  };

  return (
    <ForgeSubScreen
      title="Saved foods"
      eyebrow={
        foods.length
          ? `${foods.length} ${foods.length === 1 ? "food" : "foods"}`
          : undefined
      }
      onBack={() => goBack("/(tabs)/nutrition")}
      footer={
        <CtaButton
          title="Create food"
          icon="add"
          onPress={() => setEditing({ kind: "food" })}
        />
      }
    >
      {foods.length ? (
        <>
          <ForgeSearchField
            label="Search saved foods"
            placeholder="Name, brand or serving"
            value={query}
            onChangeText={setQuery}
          />
          <ForgeSegments
            options={SAVED_FILTERS.map((o) => ({
              value: o.value,
              label: o.label,
              accessibilityLabel: `${o.label}, ${counts[o.value]} ${counts[o.value] === 1 ? "food" : "foods"}`,
            }))}
            value={filter}
            onChange={setFilter}
          />
          {shown.length ? (
            <View style={{ gap: 8 }}>
              <SectionLabel
                title="Per serving"
                trailing={
                  searching || filter !== "all" ? (
                    <FText variant="label" tone="secondary">
                      {`${shown.length} of ${foods.length}`}
                    </FText>
                  ) : undefined
                }
              />
              <ForgeCard padding={0} gap={0}>
                {shown.map((f, i) => (
                  <SavedFoodRow
                    key={f.id}
                    food={f}
                    divider={i > 0}
                    onEdit={() => setEditing({ kind: "food", food: f })}
                    onRemove={() => remove(f)}
                  />
                ))}
              </ForgeCard>
              <FText
                variant="label"
                tone="secondary"
                style={{ paddingHorizontal: 2 }}
              >
                Changing a food here doesn&apos;t change entries already logged.
              </FText>
            </View>
          ) : (
            empty()
          )}
        </>
      ) : (
        <ForgeEmpty
          title="No saved foods yet"
          detail="Save the foods you eat often with the values from their label, or scan a barcode in Add food. They appear in Add food, ready to log in one tap."
        />
      )}
      {editing && (
        <FoodEditorSheet
          target={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </ForgeSubScreen>
  );
}

/**
 * One saved food: name, brand, serving and macros (tap to edit), its
 * calories, an understated source pill for the lifter's own label values
 * or corrections, and its ••• menu.
 */
function SavedFoodRow({
  food,
  divider,
  onEdit,
  onRemove,
}: {
  food: Journal;
  divider: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const c = useColors();
  const row = savedFoodRow(food);
  const correction = row.kind === "correction";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 4,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${row.name}`}
        accessibilityHint={row.spoken}
        onPress={onEdit}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 64,
          flexDirection: "row",
          alignItems: "center",
          gap: forge.spacing.group,
          paddingLeft: forge.spacing.cardPadding,
          paddingRight: 8,
          paddingVertical: 10,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <FText variant="body" weight="700" numberOfLines={2}>
            {row.name}
          </FText>
          {!!row.brand && (
            <FText
              variant="label"
              weight="600"
              tone="secondary"
              numberOfLines={1}
            >
              {row.brand}
            </FText>
          )}
          <FText variant="label" tone="secondary" numberOfLines={2}>
            {`${row.serving} · ${row.macros}`}
          </FText>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <FText variant="body" weight="700" numberOfLines={1}>
            {row.kcal}
          </FText>
          {row.source && (
            <View
              style={{
                paddingHorizontal: 6,
                borderRadius: forge.radii.pill,
                borderWidth: forge.border.card,
                borderColor: c.cardBorder,
              }}
            >
              <FText
                variant="label"
                tone="secondary"
                style={{ fontSize: 11, lineHeight: 16 }}
              >
                {row.source}
              </FText>
            </View>
          )}
        </View>
      </Pressable>
      <OverflowMenu
        label={`Options for ${row.name}`}
        title={row.name}
        actions={[
          {
            label: correction ? "Edit correction" : "Edit",
            icon: "create-outline",
            onPress: onEdit,
          },
          {
            label: correction ? "Remove correction" : "Delete",
            icon: "trash-outline",
            destructive: true,
            onPress: onRemove,
          },
        ]}
      />
    </View>
  );
}
