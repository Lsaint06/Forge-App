import React from "react";
import { View } from "react-native";
import { Label, useColors } from "./ui";
import type { Exercise, Prescription } from "../domain/types";
import { exerciseStimulus } from "../domain/paths/stimulus";

export function PathWorkoutList({
  items,
  catalog,
  explain = false,
}: {
  items: Prescription[];
  catalog: Exercise[];
  explain?: boolean;
}) {
  const colors = useColors();
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={`${index}-${item.exerciseId}`}
          style={{
            paddingVertical: 13,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderColor: colors.border,
            gap: 5,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Label muted size={12}>
              {String(index + 1).padStart(2, "0")}
            </Label>
            <View style={{ flex: 1 }}>
              <Label bold size={16}>
                {catalog.find((e) => e.id === item.exerciseId)?.name ??
                  "Unavailable movement"}
              </Label>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Label bold>
                {item.sets} × {item.reps}
              </Label>
              <Label muted size={11}>
                {item.rest}s rest
              </Label>
            </View>
          </View>
          {explain && (
            <Label muted size={13}>
              {exerciseStimulus(item.exerciseId).purpose}
            </Label>
          )}
        </View>
      ))}
    </View>
  );
}
