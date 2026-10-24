import React, { useState } from "react";
import { FlatList, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRepo, mutate } from "../src/state";
import {
  Field,
  Empty,
  FilterChips,
  Button,
  BackButton,
  Txt,
  useColors,
} from "../src/components/ui";
import { ExerciseCard } from "../src/components/design";
import { theme } from "../src/theme";
import { goBack } from "../src/navigation";

// The exercise library, opened from Train (Exercise library, Search
// exercises). `/explore` links keep working; `?search=1` focuses the search.
export default function Explore() {
  const r = useRepo();
  const c = useColors();
  const { search } = useLocalSearchParams<{ search?: string }>();
  const [filters, setFilters] = useState(false);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [equipment, setEquipment] = useState("All");
  const [mode, setMode] = useState("All exercises");
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
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        initialNumToRender={12}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.screen,
          gap: 12,
          paddingBottom: 40,
        }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 12 }}>
            <View style={{ gap: theme.spacing.xs }}>
              <BackButton onPress={() => goBack("/(tabs)/train")} />
              <Txt variant="overline" tone="secondary">
                {`${all.length} exercises`}
              </Txt>
              <Txt variant="display" header numberOfLines={2} fit>
                Exercise library
              </Txt>
            </View>
            <Field
              label="Search exercises"
              placeholder="Try bench, dumbbell, back…"
              value={q}
              onChangeText={setQ}
              autoFocus={search === "1"}
            />
            <FilterChips
              values={["All exercises", "Favorites", "Recent"]}
              value={mode}
              onChange={setMode}
            />
            <Button
              title={
                filters ? "Hide filters" : `Filters · ${muscle} / ${equipment}`
              }
              secondary
              icon="options-outline"
              onPress={() => setFilters(!filters)}
            />
            {filters && (
              <View style={{ gap: theme.spacing.sm }}>
                <Txt variant="caption" tone="secondary">
                  Muscle
                </Txt>
                <FilterChips
                  values={["All", ...new Set(all.map((e) => e.muscle))]}
                  value={muscle}
                  onChange={setMuscle}
                />
                <Txt variant="caption" tone="secondary">
                  Equipment
                </Txt>
                <FilterChips
                  values={["All", ...new Set(all.map((e) => e.equipment))]}
                  value={equipment}
                  onChange={setEquipment}
                />
                <Txt variant="caption" tone="secondary">
                  Sort by
                </Txt>
                <FilterChips
                  values={["Name", "Muscle"]}
                  value={sort}
                  onChange={setSort}
                />
              </View>
            )}
            <Button
              title="Create custom exercise"
              secondary
              icon="add"
              onPress={() =>
                router.push({
                  pathname: "/exercise",
                  params: { custom: "new" },
                })
              }
            />
          </View>
        }
        renderItem={({ item: e }) => (
          <ExerciseCard
            exercise={e}
            favorite={favorites.includes(e.id)}
            onFavorite={() => mutate(() => r.toggleFavorite(e.id))}
            onPress={() =>
              router.push({ pathname: "/exercise", params: { id: e.id } })
            }
          />
        )}
        ListEmptyComponent={
          <Empty
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
                <Button
                  title="Clear search and filters"
                  variant="text"
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
