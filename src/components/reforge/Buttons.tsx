import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "react-native-reanimated";
import { useColors, type IconName } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";
import { Gradient } from "./Gradient";

type Common = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** Spoken label when the visible title relies on context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

function usePress(reduced: boolean) {
  return (pressed: boolean): ViewStyle =>
    pressed && !reduced ? { transform: [{ scale: 0.98 }] } : {};
}

/**
 * The screen's primary call to action: an ember gradient with a dark label,
 * as in the references. Height never drops below 54 pt (48 when compact).
 */
export function CtaButton({
  title,
  onPress,
  icon,
  disabled = false,
  compact = false,
  accessibilityLabel,
  accessibilityHint,
}: Common & { compact?: boolean }) {
  const c = useColors();
  const press = usePress(!!useReducedMotion());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? forge.heights.button : forge.heights.cta,
        borderRadius: forge.radii.cta,
        overflow: "hidden",
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: disabled ? 0.4 : 1,
        ...press(pressed),
      })}
    >
      {({ pressed }) => (
        <>
          <Gradient
            stops={[
              { offset: 0, color: pressed ? c.emberBottom : c.emberTop },
              { offset: 1, color: c.emberBottom },
            ]}
          />
          {icon && <Ionicons name={icon} size={20} color={c.onEmber} />}
          <FText
            variant="button"
            tone="onAccent"
            numberOfLines={2}
            align="center"
            style={{ flexShrink: 1 }}
          >
            {title}
          </FText>
        </>
      )}
    </Pressable>
  );
}

/**
 * Secondary action drawn as an outline: `ember` for an action tied to the
 * live state (Pause), `neutral` for navigation (View goals).
 */
export function OutlineButton({
  title,
  onPress,
  icon,
  tone = "neutral",
  disabled = false,
  compact = false,
  accessibilityLabel,
  accessibilityHint,
}: Common & { tone?: "neutral" | "ember"; compact?: boolean }) {
  const c = useColors();
  const press = usePress(!!useReducedMotion());
  const fg = tone === "ember" ? c.emberHot : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? forge.heights.compact : forge.heights.button,
        borderRadius: forge.radii.cta,
        borderWidth: forge.border.active,
        borderColor: tone === "ember" ? c.emberHot : c.text3,
        backgroundColor: pressed
          ? tone === "ember"
            ? c.emberTint
            : c.cardRaised
          : "transparent",
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.4 : 1,
        ...press(pressed),
      })}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <FText
        variant="cardTitle"
        tone={tone === "ember" ? "accent" : "primary"}
        numberOfLines={2}
        align="center"
        style={{ flexShrink: 1 }}
      >
        {title}
      </FText>
    </Pressable>
  );
}

/** A bordered square icon control (the references' "…" and "⋮"), 44 pt minimum. */
export function SquareIconButton({
  icon,
  label,
  onPress,
  size = forge.heights.compact,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const c = useColors();
  const side = Math.max(forge.heights.compact, size);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: side,
        height: side,
        borderRadius: forge.radii.cta,
        borderWidth: forge.border.active,
        borderColor: c.cardBorder,
        backgroundColor: pressed ? c.cardRaised : c.cardBg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <View>
        <Ionicons name={icon} size={20} color={c.text} />
      </View>
    </Pressable>
  );
}
