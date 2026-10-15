import React, { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Sheet, Field, Label, Chips, useColors } from "./ui";
import { useRepo } from "../state";
import type { Exercise } from "../domain/types";
export function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
  const r = useRepo();
  const c = useColors();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("All");
  const list = r.exercises(query, muscle);
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose your movement">
      <Field
        label="Search exercises"
        value={query}
        onChangeText={setQuery}
        placeholder="Name, muscle or equipment"
      />
      <Chips
        values={[
          "All",
          "Chest",
          "Back",
          "Quadriceps",
          "Hamstrings",
          "Glutes",
          "Shoulders",
          "Biceps",
          "Triceps",
          "Core",
        ]}
        value={muscle}
        onChange={setMuscle}
      />
      <View style={{ height: 350 }}>
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          renderItem={({ item: e }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${e.name}`}
              onPress={() => {
                onPick(e);
                onClose();
              }}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderColor: c.border,
                minHeight: 64,
              }}
            >
              <Label bold>{e.name}</Label>
              <Label muted size={12}>
                {e.muscle} · {e.equipment}
              </Label>
            </Pressable>
          )}
          ListEmptyComponent={
            <Label muted>No matching exercises. Try fewer search words.</Label>
          }
        />
      </View>
    </Sheet>
  );
}
