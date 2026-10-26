import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { FieldError, formatNumber, parseNumber, useColors } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";
import { SquareIconButton } from "./Buttons";

// REFORGE form controls (Phase 7.3D). Same behaviour and accessibility as the
// Design System 2.0 `Field`, `NumberField`, `NumberControl` and `Chips`
// (labels, comma decimals, range errors announced to screen readers), drawn
// on REFORGE surfaces. Additive: the 2.0 controls are unchanged and keep
// serving the screens not yet transformed.

/** A labelled text input with its error below. */
export function ForgeField({
  label,
  error,
  hideLabel = false,
  ...props
}: TextInputProps & { label: string; error?: string; hideLabel?: boolean }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const numeric = /decimal|number|numeric/.test(props.keyboardType ?? "");
  return (
    <View style={{ gap: 6, flexGrow: 1, flexShrink: 1, minWidth: 96 }}>
      {!hideLabel && (
        <FText variant="label" tone="secondary">
          {label}
        </FText>
      )}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        placeholderTextColor={c.text3}
        selectionColor={c.emberHot}
        maxFontSizeMultiplier={1.6}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            minHeight: forge.heights.button,
            color: c.text,
            backgroundColor: c.cardBg,
            borderRadius: forge.radii.input,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 16,
            borderWidth:
              error || focused ? forge.border.active : forge.border.card,
            borderColor: error ? c.error : focused ? c.emberHot : c.cardBorder,
            ...(numeric ? { fontVariant: ["tabular-nums" as const] } : {}),
          },
          props.style,
        ]}
      />
      <FieldError label={label} error={error} />
    </View>
  );
}

/**
 * A number typed as text: applied as soon as it is valid, kept as typed
 * while editing, and an error shown (not applied) when out of range.
 */
export function ForgeNumberField({
  label,
  value,
  onSave,
  min = 0,
  max = Infinity,
  hideLabel = false,
}: {
  label: string;
  value: number;
  onSave: (n: number) => void;
  min?: number;
  max?: number;
  hideLabel?: boolean;
}) {
  const [draft, setDraft] = useState(formatNumber(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  function save(text: string) {
    const result = parseNumber(text, { min, max });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSave(result.value ?? min);
    setError("");
  }
  return (
    <ForgeField
      label={label}
      hideLabel={hideLabel}
      keyboardType="decimal-pad"
      textAlign="center"
      value={focused ? draft : formatNumber(value)}
      onFocus={() => {
        setDraft(formatNumber(value));
        setFocused(true);
      }}
      onChangeText={(text) => {
        setDraft(text);
        save(text);
      }}
      onEndEditing={() => {
        save(draft);
        setFocused(false);
      }}
      error={error}
      style={{ fontSize: 18, fontWeight: "700" }}
    />
  );
}

/**
 * − value + : a number that can be typed or stepped. Steps stay within
 * `min`–`max` and stop going down at `floor`; 44 pt buttons.
 */
export function ForgeStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = Infinity,
  floor = min,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  floor?: number;
  /** Shown under the number ("servings", "g"). */
  unit?: string;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: forge.spacing.tight,
      }}
    >
      <SquareIconButton
        icon="remove"
        label={`Decrease ${label} by ${step}`}
        size={forge.heights.button}
        onPress={() => {
          if (value > floor) onChange(Math.max(floor, round(value - step)));
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <ForgeNumberField
          label={label}
          hideLabel
          min={min}
          max={max}
          value={value}
          onSave={onChange}
        />
        {unit && (
          <FText variant="label" tone="secondary" align="center">
            {unit}
          </FText>
        )}
      </View>
      <SquareIconButton
        icon="add"
        label={`Increase ${label} by ${step}`}
        size={forge.heights.button}
        onPress={() => onChange(Math.min(max, round(value + step)))}
      />
    </View>
  );
}

/** A row of selectable pills (scrolls sideways when it doesn't fit). */
export function ForgeChips({
  values,
  value,
  onChange,
  bleed = 0,
}: {
  values: string[];
  value: string;
  onChange: (value: string) => void;
  bleed?: number;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={bleed ? { marginHorizontal: -bleed } : undefined}
      contentContainerStyle={{
        paddingHorizontal: bleed,
        gap: forge.spacing.tight,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {values.map((v) => {
        const selected = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(v)}
            style={({ pressed }) => ({
              minHeight: forge.heights.compact,
              justifyContent: "center",
              paddingHorizontal: 14,
              borderRadius: forge.radii.pill,
              borderWidth: forge.border.active,
              borderColor: selected ? c.emberMuted : c.cardBorder,
              backgroundColor: selected
                ? c.emberTint
                : pressed
                  ? c.cardRaised
                  : c.cardBg,
            })}
          >
            <FText
              variant="label"
              weight="600"
              tone={selected ? "accent" : "primary"}
              numberOfLines={1}
            >
              {v}
            </FText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
