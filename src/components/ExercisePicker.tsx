import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Sheet, Field, Txt, Chips, useColors } from "./ui";
import { useRepo } from "../state";
import { theme } from "../theme";
import type { Exercise } from "../domain/types";

/**
 * The shared exercise chooser. `action` is the spoken verb on each row:
 * "Add" where picking adds the exercise (workout, template, substitute) and
 * "Choose" where it only selects one (a Lift goal).
 */
export function ExercisePicker({
  visible,
  onClose,
  onPick,
  action = "Add",
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
  action?: "Add" | "Choose";
}) {
  const r = useRepo();
  const c = useColors();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("All");
  // One pick per opening: a second tap before the sheet closes is ignored.
  const picked = useRef(false);
  useEffect(() => {
    if (visible) picked.current = false;
  }, [visible]);
  const muscles = [...new Set(r.exercises().map((e) => e.muscle))].sort();
  const list = r.exercises(query, muscle);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose your movement"
      scroll={false}
    >
      {/* Only the list gives way to the keyboard; search and filters keep their size. */}
      <View style={{ flexShrink: 0, gap: theme.spacing.md }}>
        <Field
          label="Search exercises"
          value={query}
          onChangeText={setQuery}
          placeholder="Name, muscle or equipment"
        />
        <Chips
          values={["All", ...muscles]}
          value={muscle}
          onChange={setMuscle}
          bleed={theme.spacing.screen}
        />
      </View>
      <View style={{ height: 560, flexShrink: 1, minHeight: 120 }}>
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          renderItem={({ item: e }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${action} ${e.name}`}
              accessibilityHint={`${e.muscle} · ${e.equipment}`}
              onPress={() => {
                if (picked.current) return;
                picked.current = true;
                onPick(e);
                onClose();
              }}
              style={({ pressed }) => ({
                minHeight: theme.heights.rowTall,
                paddingVertical: 10,
                justifyContent: "center",
                gap: 2,
                borderBottomWidth: 1,
                borderColor: c.hairline,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Txt weight="600" numberOfLines={2}>
                {e.name}
              </Txt>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {`${e.muscle} · ${e.equipment}`}
              </Txt>
            </Pressable>
          )}
          ListEmptyComponent={
            <Txt tone="secondary">
              {muscle === "All"
                ? "No matching exercises. Try fewer search words."
                : `No matching ${muscle.toLowerCase()} exercises. Try fewer search words or All.`}
            </Txt>
          }
        />
      </View>
    </Sheet>
  );
}
