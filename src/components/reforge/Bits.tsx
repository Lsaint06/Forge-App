import React, { useEffect } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useColors, type IconName } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** A bordered panel inside a card (quick-add food, milestone, choice). */
export function Tile({
  children,
  onPress,
  accessibilityLabel,
  selected = false,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const frame: ViewStyle = {
    borderRadius: forge.radii.tile,
    borderWidth: selected ? forge.border.active : forge.border.card,
    borderColor: selected ? c.emberHot : c.cardBorder,
    backgroundColor: selected ? c.emberTint : c.cardRaised,
    padding: forge.spacing.group,
    gap: 4,
  };
  if (!onPress)
    return (
      <View
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        style={[frame, style]}
      >
        {children}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        frame,
        { minHeight: forge.heights.compact },
        pressed ? { opacity: 0.7 } : undefined,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A small bordered fact ("6 exercises"); not interactive. */
export function InfoChip({ icon, label }: { icon?: IconName; label: string }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        minHeight: forge.heights.chip,
        paddingHorizontal: 10,
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon && <Ionicons name={icon} size={14} color={c.text2} />}
      <FText variant="label" numberOfLines={1}>
        {label}
      </FText>
    </View>
  );
}

/**
 * An ember-outlined pill with an icon and a short value (the references'
 * header badge). Interactive only when `onPress` is set, then 44 pt tall.
 */
export function BadgePill({
  icon,
  value,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  value: string;
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const content = (
    <View
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: forge.radii.pill,
        borderWidth: forge.border.active,
        borderColor: c.emberMuted,
        backgroundColor: c.emberTint,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Ionicons name={icon} size={16} color={c.emberHot} />
      <FText variant="cardTitle" tone="accent" numberOfLines={1}>
        {value}
      </FText>
    </View>
  );
  if (!onPress)
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: forge.heights.compact,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {content}
    </Pressable>
  );
}

/**
 * Thin progress bar: ember for the measured goal, neutral for context,
 * hydration blue for water (Phase 7.3C).
 */
export function ForgeProgress({
  value,
  label,
  tone = "accent",
  height = 6,
}: {
  value: number;
  label: string;
  tone?: "accent" | "neutral" | "hydration";
  height?: number;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? clamp(value) : 0);
  useEffect(() => {
    progress.value = reduced
      ? clamp(value)
      : withTiming(clamp(value), { duration: forge.motion.progress });
  }, [value, reduced, progress]);
  const fill = useAnimatedStyle(() => {
    // Runs on the UI thread: only inline maths here. Calling a module
    // function (e.g. `clamp`) from a worklet throws on the UI runtime and
    // crashes the app (Phase 7.1A device report).
    const ratio = Math.max(0, Math.min(1, progress.value));
    return { width: `${ratio * 100}%` as `${number}%` };
  });
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamp(value) * 100),
      }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: c.cardBorder,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height,
            borderRadius: height / 2,
            backgroundColor:
              tone === "accent"
                ? c.emberHot
                : tone === "hydration"
                  ? c.hydration
                  : c.text2,
          },
          fill,
        ]}
      />
    </View>
  );
}

/** Ember progress ring with centred content (e.g. kcal of target). */
export function ForgeRing({
  value,
  label,
  size = 120,
  stroke = 10,
  children,
}: {
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const ratio = clamp(value);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.emberTint}
          strokeWidth={stroke}
          fill="none"
        />
        {ratio > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={c.emberHot}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            rotation={-90}
            origin={`${size / 2},${size / 2}`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

/** Uppercase letter-spaced section label outside a card ("MY STATS"). */
export function SectionLabel({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 24,
        paddingHorizontal: 2,
      }}
    >
      <FText variant="overline" tone="secondary" header style={{ flex: 1 }}>
        {title}
      </FText>
      {trailing}
    </View>
  );
}
