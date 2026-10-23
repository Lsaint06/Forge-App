import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRepo, mutate } from "../state";
import { Txt, Button, Sheet, useColors, type IconName } from "./ui";
import { moveExerciseTo } from "../data/workout-session";
import { plural } from "../domain/training-display";
import { theme } from "../theme";

/**
 * Reordering a workout's exercises: pick an exercise, then move it to the
 * top, up, down or to the bottom. Every move saves at once; sets and logged
 * values stay with their exercise. Screen readers get the same moves as
 * actions on each row.
 */
export function ReorderSheet({
  workoutId,
  initial,
  onClose,
}: {
  workoutId: string;
  /** The exercise row to select first (from an exercise's menu). */
  initial?: string;
  onClose: () => void;
}) {
  const r = useRepo();
  const c = useColors();
  const rows = r.workoutExercises(workoutId);
  const [selected, setSelected] = useState(initial);
  const index = rows.findIndex((row) => row.id === selected);
  const name = (exerciseId: string) =>
    r.exercise(exerciseId)?.name ?? "Missing exercise";
  const selectedName = index >= 0 ? name(rows[index]!.exerciseId) : "";
  function move(rowId: string, to: number) {
    mutate(() => moveExerciseTo(r, workoutId, rowId, to));
  }
  const last = rows.length - 1;
  const moves: {
    key: string;
    title: string;
    spoken: string;
    icon: IconName;
    to: number;
    disabled: boolean;
  }[] = [
    {
      key: "top",
      title: "To top",
      spoken: "to top",
      icon: "arrow-up-circle-outline",
      to: 0,
      disabled: index <= 0,
    },
    {
      key: "up",
      title: "Up",
      spoken: "up",
      icon: "arrow-up",
      to: index - 1,
      disabled: index <= 0,
    },
    {
      key: "down",
      title: "Down",
      spoken: "down",
      icon: "arrow-down",
      to: index + 1,
      disabled: index < 0 || index >= last,
    },
    {
      key: "bottom",
      title: "To bottom",
      spoken: "to bottom",
      icon: "arrow-down-circle-outline",
      to: last,
      disabled: index < 0 || index >= last,
    },
  ];
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Reorder exercises"
      dismissOnBackdrop
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            {moves.map((m) => (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityLabel={
                  selectedName
                    ? `Move ${selectedName} ${m.spoken}`
                    : `Move ${m.spoken}`
                }
                accessibilityState={{ disabled: m.disabled }}
                disabled={m.disabled}
                onPress={() => move(rows[index]!.id, m.to)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 56,
                  paddingVertical: 6,
                  borderRadius: theme.radii.control,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  backgroundColor: pressed ? c.selected : c.surfaceRaised,
                  opacity: m.disabled ? 0.4 : 1,
                })}
              >
                <Ionicons name={m.icon} size={20} color={c.text} />
                <Txt variant="caption" weight="600" numberOfLines={1} fit>
                  {m.title}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Button
            title="Done"
            accessibilityLabel="Done reordering"
            onPress={onClose}
          />
        </View>
      }
    >
      <Txt variant="caption" tone="secondary">
        {index >= 0
          ? `${selectedName} is selected. Its sets move with it.`
          : "Choose an exercise, then move it. Its sets move with it."}
      </Txt>
      <View
        style={{
          backgroundColor: c.surfaceRaised,
          borderRadius: theme.radii.card,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => {
          const isSelected = row.id === selected;
          const title = name(row.exerciseId);
          const sets = r.sets(row.id).length;
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}. ${title}`}
              accessibilityHint="Selects this exercise to move it"
              accessibilityState={{ selected: isSelected }}
              accessibilityActions={[
                { name: "top", label: "Move to top" },
                { name: "up", label: "Move up" },
                { name: "down", label: "Move down" },
                { name: "bottom", label: "Move to bottom" },
              ]}
              onAccessibilityAction={(event) => {
                const to = {
                  top: 0,
                  up: i - 1,
                  down: i + 1,
                  bottom: last,
                }[event.nativeEvent.actionName];
                if (to !== undefined && to >= 0 && to <= last && to !== i) {
                  setSelected(row.id);
                  move(row.id, to);
                }
              }}
              onPress={() => setSelected(row.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.group,
                minHeight: 56,
                paddingHorizontal: theme.spacing.row,
                paddingVertical: 8,
                borderTopWidth: i ? 0.5 : 0,
                borderColor: c.hairline,
                backgroundColor: isSelected
                  ? c.selected
                  : pressed
                    ? c.surface
                    : "transparent",
              })}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? c.ember : c.surface,
                }}
              >
                <Txt
                  variant="caption"
                  weight="700"
                  tone={isSelected ? "onAccent" : "secondary"}
                  tabular
                >
                  {i + 1}
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="600" numberOfLines={2}>
                  {title}
                </Txt>
                <Txt variant="caption" tone="secondary">
                  {plural(sets, "set")}
                </Txt>
              </View>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={c.ember} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
