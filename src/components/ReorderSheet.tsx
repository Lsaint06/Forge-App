import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRepo, mutate } from "../state";
import { Txt, Button, Sheet, useColors, type IconName } from "./ui";
import { moveExerciseTo } from "../data/workout-session";
import { plural } from "../domain/training-display";
import { theme } from "../theme";

export type ReorderItem = { key: string; title: string; subtitle?: string };

/**
 * Reordering a list of exercises: pick one, then move it to the top, up,
 * down or to the bottom. `onMove` applies each move at once. Screen readers
 * get the same moves as actions on each row.
 */
export function ReorderList({
  items,
  initial,
  onMove,
  onClose,
}: {
  items: ReorderItem[];
  /** The item to select first (from an exercise's menu). */
  initial?: string;
  /** Moves `key` to the 0-based position `to`. */
  onMove: (key: string, to: number) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const rows = items;
  const [selected, setSelected] = useState(initial);
  const index = rows.findIndex((row) => row.key === selected);
  const selectedName = index >= 0 ? rows[index]!.title : "";
  const move = onMove;
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
                onPress={() => move(rows[index]!.key, m.to)}
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
          const isSelected = row.key === selected;
          const title = row.title;
          return (
            <Pressable
              key={row.key}
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
                  setSelected(row.key);
                  move(row.key, to);
                }
              }}
              onPress={() => setSelected(row.key)}
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
                {!!row.subtitle && (
                  <Txt variant="caption" tone="secondary">
                    {row.subtitle}
                  </Txt>
                )}
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

/**
 * Reordering a workout's exercises. Every move saves at once; sets and
 * logged values stay with their exercise.
 */
export function ReorderSheet({
  workoutId,
  initial,
  onClose,
}: {
  workoutId: string;
  initial?: string;
  onClose: () => void;
}) {
  const r = useRepo();
  return (
    <ReorderList
      items={r.workoutExercises(workoutId).map((row) => ({
        key: row.id,
        title: r.exercise(row.exerciseId)?.name ?? "Missing exercise",
        subtitle: plural(r.sets(row.id).length, "set"),
      }))}
      initial={initial}
      onMove={(rowId, to) =>
        mutate(() => moveExerciseTo(r, workoutId, rowId, to))
      }
      onClose={onClose}
    />
  );
}
