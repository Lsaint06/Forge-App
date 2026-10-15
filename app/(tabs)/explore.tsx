import React, { useState, useMemo } from "react";
import { FlatList, View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRepo, mutate } from "../../src/state";
import {
  Field,
  Label,
  Chips,
  Button,
  useColors,
} from "../../src/components/ui";
export default function Explore() {
  const r = useRepo();
  const c = useColors();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [equipment, setEquipment] = useState("All");
  const [mode, setMode] = useState("All exercises");
  const [sort, setSort] = useState("Name");
  const favorites = r.favorites();
  const all = r.exercises();
  const recentIds = useMemo(
    () =>
      new Set(
        r
          .workouts()
          .slice(0, 10)
          .flatMap((w) => r.workoutExercises(w.id).map((e) => e.exerciseId)),
      ),
    [r],
  );
  const list = useMemo(() => {
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
  }, [r, q, muscle, equipment, mode, sort, favorites, recentIds]);
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
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 12 }}>
            <Label size={11} bold style={{ color: c.accent, letterSpacing: 3 }}>
              YOUR MOVEMENT TOOLKIT
            </Label>
            <Label size={32} bold>
              Built for your body.
            </Label>
            <Label muted>
              {all.length} movements. Find your next challenge.
            </Label>
            <Field
              label="Search exercises"
              placeholder="Try bench, dumbbell, back…"
              value={q}
              onChangeText={setQ}
            />
            <Chips
              values={["All exercises", "Favorites", "Recent"]}
              value={mode}
              onChange={setMode}
            />
            <Chips
              values={["All", ...new Set(all.map((e) => e.muscle))]}
              value={muscle}
              onChange={setMuscle}
            />
            <Chips
              values={["All", ...new Set(all.map((e) => e.equipment))]}
              value={equipment}
              onChange={setEquipment}
            />
            <Chips
              values={["Name", "Muscle"]}
              value={sort}
              onChange={setSort}
            />
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              backgroundColor: c.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/exercise", params: { id: e.id } })
              }
              style={{
                flex: 1,
                minHeight: 48,
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Label bold>{e.name}</Label>
              <Label muted size={12}>
                {e.muscle} · {e.equipment} · {e.category}
              </Label>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${favorites.includes(e.id) ? "Unfavorite" : "Favorite"} ${e.name}`}
              onPress={() => mutate(() => r.toggleFavorite(e.id))}
              style={{ padding: 14 }}
            >
              <Label size={24} style={{ color: c.accent }}>
                {favorites.includes(e.id) ? "★" : "☆"}
              </Label>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Label muted>
            No results. Change your filters or create a custom exercise.
          </Label>
        }
      />
    </SafeAreaView>
  );
}
