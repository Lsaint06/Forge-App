import React from "react";
import {
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText, type ForgeTone } from "./Text";
import { Gradient } from "./Gradient";

export type CardVariant = "default" | "active" | "raised";

/**
 * REFORGE card: a near-black panel defined by a hairline border with a faint
 * top-light. `active` marks the one thing in progress (ember outline and a
 * soft ember glow on iOS); `raised` is for panels inside other panels.
 * Pressable when `onPress` is given (whole card is one button).
 */
export function ForgeCard({
  children,
  variant = "default",
  padding = forge.spacing.cardPadding,
  gap = forge.spacing.group,
  sheen = true,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: number;
  gap?: number;
  sheen?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  const active = variant === "active";
  const frame: ViewStyle = {
    backgroundColor: variant === "raised" ? c.cardRaised : c.cardBg,
    borderRadius: forge.radii.card,
    borderWidth: active ? forge.border.active : forge.border.card,
    borderColor: active ? c.emberMuted : c.cardBorder,
    overflow: "hidden",
    padding,
    gap,
  };
  const top = sheen && (
    <Gradient
      stops={[
        { offset: 0, color: c.sheen },
        { offset: 1, color: c.sheen, opacity: 0 },
      ]}
      style={{ bottom: "45%" }}
    />
  );
  // iOS draws the glow outside the clipped panel; Android elevation cannot
  // be tinted, so there the ember outline alone marks the active card.
  const glow: ViewStyle | undefined =
    active && Platform.OS === "ios"
      ? {
          borderRadius: forge.radii.card,
          shadowColor: c.emberHot,
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
        }
      : undefined;
  const body = onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        frame,
        pressed ? { backgroundColor: c.cardRaised } : undefined,
        glow ? undefined : style,
      ]}
    >
      {top}
      {children}
    </Pressable>
  ) : (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[frame, glow ? undefined : style]}
    >
      {top}
      {children}
    </View>
  );
  return glow ? <View style={[glow, style]}>{body}</View> : body;
}

/**
 * A card's letter-spaced heading, with an optional trailing value and a
 * chevron when it navigates. A hairline separates it from the card body.
 */
export function CardHeader({
  title,
  tone = "secondary",
  trailing,
  onPress,
  accessibilityLabel,
  divider = true,
}: {
  title: string;
  tone?: ForgeTone;
  trailing?: string | React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  divider?: boolean;
}) {
  const c = useColors();
  const row = (
    <>
      <FText
        variant="overline"
        tone={tone}
        header={!onPress}
        numberOfLines={2}
        style={{ flex: 1 }}
      >
        {title}
      </FText>
      {typeof trailing === "string" ? (
        <FText variant="label" tone="secondary" numberOfLines={1}>
          {trailing}
        </FText>
      ) : (
        trailing
      )}
      {onPress && <Ionicons name="chevron-forward" size={16} color={c.text2} />}
    </>
  );
  const style: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: forge.spacing.tight,
    minHeight: onPress ? forge.heights.compact : 24,
    paddingBottom: divider ? 10 : 0,
    borderBottomWidth: divider ? forge.border.card : 0,
    borderBottomColor: c.cardDivider,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ??
        (typeof trailing === "string" ? `${title}, ${trailing}` : title)
      }
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {row}
    </Pressable>
  ) : (
    <View style={style}>{row}</View>
  );
}
