import React, { memo, useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRepo, mutate } from "../state";
import { FilterChips, useColors } from "../components/ui";
import {
  FText,
  ForgeCard,
  ForgeEmpty,
  ForgeListRow,
  ForgeSearchField,
  ForgeSegments,
  ForgeSubHeader,
  ForgeTopGlow,
  OutlineButton,
  SectionLabel,
} from "../components/reforge";
import type { Exercise } from "../domain/types";
import { forge } from "../theme";
import { goBack } from "../navigation";
import { exerciseRowText } from "./explore/model";

// The exercise library (REFORGE, Phase 7.2C-3C), opened from Train. A
// text-first list: name, primary muscle (ember dot) and secondary muscles,
// equipment and movement pattern, and the favourite star. No thumbnails:
// the anatomy lives on each exercise's detail screen. `/explore` links keep
// working; `?search=1` focuses the search. Search, filter and sort logic
// are unchanged.

type Mode = "All exercises" | "Favorites" | "Recent";
const MODES: { value: Mode; label: string }[] = [
  { value: "All exercises", label: "All" },
  { value: "Favorites", label: "Favorites" },
  { value: "Recent", label: "Recent" },
];

const sameRow = (
  a: React.ComponentProps<typeof ExerciseRowView>,
  b: React.ComponentProps<typeof ExerciseRowView>,
) =>
  a.favorite === b.favorite &&
  a.first === b.first &&
  a.last === b.last &&
  a.onToggle === b.onToggle &&
  a.exercise.id === b.exercise.id &&
  a.exercise.name === b.exercise.name &&
  a.exercise.muscle === b.exercise.muscle &&
  a.exercise.equipment === b.exercise.equipment &&
  a.exercise.pattern === b.exercise.pattern &&
  a.exercise.secondary.join() === b.exercise.secondary.join();

/** One exercise: opens its detail; the star toggles the favourite. */
function ExerciseRowView({
  exercise: e,
  favorite,
  first,
  last,
  onToggle,
}: {
  exercise: Exercise;
  favorite: boolean;
  first: boolean;
  last: boolean;
  onToggle: (id: string) => void;
}) {
  const c = useColors();
  const text = exerciseRowText(e);
  return (
    <View
      testID="exercise-row"
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: c.cardBg,
        borderLeftWidth: forge.border.card,
        borderRightWidth: forge.border.card,
        borderTopWidth: forge.border.card,
        borderBottomWidth: last ? forge.border.card : 0,
        borderColor: c.cardBorder,
        // Rows after the first draw the divider above them.
        borderTopColor: first ? c.cardBorder : c.cardDivider,
        borderTopLeftRadius: first ? forge.radii.card : 0,
        borderTopRightRadius: first ? forge.radii.card : 0,
        borderBottomLeftRadius: last ? forge.radii.card : 0,
        borderBottomRightRadius: last ? forge.radii.card : 0,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${e.name}`}
        accessibilityHint={text.spoken}
        onPress={() =>
          router.push({ pathname: "/exercise", params: { id: e.id } })
        }
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 72,
          paddingLeft: forge.spacing.cardPadding,
          paddingRight: 4,
          paddingVertical: 11,
          justifyContent: "center",
          gap: 3,
          backgroundColor: pressed ? c.cardRaised : "transparent",
        })}
      >
        <FText variant="cardTitle" weight="700" numberOfLines={2}>
          {e.name}
        </FText>
        {!!text.primary && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: c.emberHot,
              }}
            />
            <FText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              <FText variant="label" weight="600">
                {text.primary}
              </FText>
              {text.secondary.length > 0 && (
                <FText variant="label" tone="secondary">
                  {` · ${text.secondary.join(", ")}`}
                </FText>
              )}
            </FText>
          </View>
        )}
        {!!text.detail && (
          <FText variant="label" tone="secondary" numberOfLines={1}>
            {text.detail}
          </FText>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${favorite ? "Unfavorite" : "Favorite"} ${e.name}`}
        accessibilityState={{ selected: favorite }}
        onPress={() => onToggle(e.id)}
        style={({ pressed }) => ({
          width: 52,
          minHeight: 72,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons
          name={favorite ? "star" : "star-outline"}
          size={22}
          color={favorite ? c.emberHot : c.text3}
        />
      </Pressable>
    </View>
  );
}
const ExerciseRow = memo(ExerciseRowView, sameRow);

export default function Explore() {
  const r = useRepo();
  const c = useColors();
  const { search } = useLocalSearchParams<{ search?: string }>();
  const [filters, setFilters] = useState(false);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [equipment, setEquipment] = useState("All");
  const [mode, setMode] = useState<Mode>("All exercises");
  const [sort, setSort] = useState("Name");
  const favorites = r.favorites();
  const all = r.exercises();
  const recentIds = new Set(
    r
      .workouts()
      .slice(0, 10)
      .flatMap((w) => r.workoutExercises(w.id).map((e) => e.exerciseId)),
  );
  const list = (() => {
    let data = r
      .exercises(q, muscle, equipment)
      .filter((e) =>
        mode === "Favorites"
          ? favorites.includes(e.id)
          : mode === "Recent"
            ? recentIds.has(e.id)
            : true,
      );
    if (sort === "Muscle")
      data = data.sort(
        (a, b) =>
          a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name),
      );
    return data;
  })();
  const filtered =
    !!q.trim() ||
    muscle !== "All" ||
    equipment !== "All" ||
    mode !== "All exercises";
  const active = [
    muscle !== "All" && { label: muscle, clear: () => setMuscle("All") },
    equipment !== "All" && {
      label: equipment,
      clear: () => setEquipment("All"),
    },
  ].filter((x): x is { label: string; clear: () => void } => !!x);
  const toggle = useCallback(
    (id: string) => mutate(() => r.toggleFavorite(id)),
    [r],
  );
  const header = (
    <View style={{ gap: forge.spacing.cardGap, paddingBottom: 8 }}>
      <ForgeSubHeader
        title="Exercise library"
        eyebrow={`${all.length} exercises`}
        onBack={() => goBack("/(tabs)/train")}
      />
      <ForgeSearchField
        label="Search exercises"
        placeholder="Try bench, dumbbell, back…"
        value={q}
        onChangeText={setQ}
        autoFocus={search === "1"}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <ForgeSegments options={MODES} value={mode} onChange={setMode} />
        </View>
        <OutlineButton
          title={active.length ? `Filters · ${active.length}` : "Filters"}
          accessibilityLabel={
            filters
              ? "Filters, hide"
              : `Filters${active.length ? `, ${active.length} active` : ""}`
          }
          icon={filters ? "chevron-up" : "options-outline"}
          onPress={() => setFilters(!filters)}
        />
      </View>
      {active.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {active.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${a.label} filter`}
              onPress={a.clear}
              style={({ pressed }) => ({
                minHeight: forge.heights.compact,
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  minHeight: forge.heights.chip,
                  paddingHorizontal: 10,
                  borderRadius: forge.radii.tile,
                  borderWidth: forge.border.active,
                  borderColor: c.emberMuted,
                  backgroundColor: c.emberTint,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FText variant="label" weight="600" tone="accent">
                  {a.label}
                </FText>
                <Ionicons name="close" size={14} color={c.emberHot} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {filters && (
        <ForgeCard gap={10}>
          <FText variant="overline" tone="secondary">
            Muscle
          </FText>
          <FilterChips
            values={["All", ...new Set(all.map((e) => e.muscle))]}
            value={muscle}
            onChange={setMuscle}
            bleed={forge.spacing.cardPadding}
          />
          <FText variant="overline" tone="secondary">
            Equipment
          </FText>
          <FilterChips
            values={["All", ...new Set(all.map((e) => e.equipment))]}
            value={equipment}
            onChange={setEquipment}
            bleed={forge.spacing.cardPadding}
          />
          <FText variant="overline" tone="secondary">
            Sort by
          </FText>
          <FilterChips
            values={["Name", "Muscle"]}
            value={sort}
            onChange={setSort}
            bleed={forge.spacing.cardPadding}
          />
        </ForgeCard>
      )}
      <ForgeCard padding={0} gap={0}>
        <ForgeListRow
          icon="add-circle-outline"
          title="Create custom exercise"
          onPress={() =>
            router.push({ pathname: "/exercise", params: { custom: "new" } })
          }
        />
      </ForgeCard>
      {list.length > 0 && (
        <SectionLabel
          title={sort === "Muscle" ? "By muscle" : "A – Z"}
          trailing={
            filtered ? (
              <FText variant="label" tone="secondary">
                {`${list.length} of ${all.length}`}
              </FText>
            ) : undefined
          }
        />
      )}
    </View>
  );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ForgeTopGlow />
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        initialNumToRender={12}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: forge.spacing.margin,
          paddingBottom: forge.spacing.margin * 2,
        }}
        ListHeaderComponent={header}
        renderItem={({ item: e, index }) => (
          <ExerciseRow
            exercise={e}
            favorite={favorites.includes(e.id)}
            first={index === 0}
            last={index === list.length - 1}
            onToggle={toggle}
          />
        )}
        ListEmptyComponent={
          <ForgeEmpty
            title={
              mode === "Favorites" && !favorites.length
                ? "No favorites yet"
                : mode === "Recent" && !recentIds.size
                  ? "No recent exercises"
                  : "No matching exercises"
            }
            detail={
              mode === "Favorites" && !favorites.length
                ? "Tap the star on an exercise to keep it here."
                : mode === "Recent" && !recentIds.size
                  ? "Exercises from your last 10 workouts appear here."
                  : "Change your search or filters, or create a custom exercise."
            }
            action={
              filtered ? (
                <OutlineButton
                  title="Clear search and filters"
                  onPress={() => {
                    setQ("");
                    setMuscle("All");
                    setEquipment("All");
                    setMode("All exercises");
                  }}
                />
              ) : undefined
            }
          />
        }
      />
    </SafeAreaView>
  );
}
