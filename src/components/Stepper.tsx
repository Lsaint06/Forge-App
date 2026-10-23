import React from "react";
import { View } from "react-native";
import { Txt, IconButton, NumberField } from "./ui";
import { theme } from "../theme";

// Compact numeric controls for prescriptions: a stepper for small whole
// numbers, and a load control that also accepts direct entry.

/**
 * A labelled value with − and + buttons (44 pt). Screen readers treat it as
 * one adjustable control: swipe up or down to change the value.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  format = String,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Display text, e.g. seconds as "2:00". */
  format?: (value: number) => string;
}) {
  const set = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        set(value + (e.nativeEvent.actionName === "increment" ? step : -step))
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 48,
        gap: theme.spacing.sm,
      }}
    >
      <Txt style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      <IconButton
        icon="remove-circle-outline"
        label={`Decrease ${label}`}
        size={26}
        onPress={() => set(value - step)}
      />
      <Txt
        variant="headline"
        tabular
        align="center"
        style={{ minWidth: 52 }}
        numberOfLines={1}
      >
        {format(value)}
      </Txt>
      <IconButton
        icon="add-circle-outline"
        label={`Increase ${label}`}
        size={26}
        onPress={() => set(value + step)}
      />
    </View>
  );
}

/**
 * A load in the profile's units: type it, or step it by the lifter's
 * increment. `value` and `onChange` are in display units.
 */
export function LoadControl({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.sm,
      }}
    >
      <IconButton
        icon="remove-circle-outline"
        label={`Decrease ${label} by ${step}`}
        size={26}
        onPress={() => onChange(Math.max(0, round(value - step)))}
      />
      <View style={{ flex: 1 }}>
        <NumberField
          label={label}
          compact
          max={2000}
          value={value}
          onSave={(n) => onChange(n ?? 0)}
        />
      </View>
      <IconButton
        icon="add-circle-outline"
        label={`Increase ${label} by ${step}`}
        size={26}
        onPress={() => onChange(round(value + step))}
      />
    </View>
  );
}
