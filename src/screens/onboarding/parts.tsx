import React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, type IconName } from "../../components/ui";
import { CtaButton, FText, Gradient } from "../../components/reforge";
import { forge } from "../../theme";

// Small pieces shared by the onboarding screens (Phase 9.2), drawn with the
// REFORGE tokens only: ember for where the athlete is, hairlines elsewhere.

/**
 * Setup's three steps, the current one and those before it in ember.
 * Decorative: the screen's eyebrow ("Step 2 of 3") already says it.
 */
export function StepBar({ step, of = 3 }: { step: number; of?: number }) {
  const c = useColors();
  return (
    <View
      testID={`onboarding-step-${step}`}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: 6 }}
    >
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i < step ? c.emberHot : c.cardBorder,
          }}
        />
      ))}
    </View>
  );
}

/** Discover's pages as segments: seen in muted ember, this one in ember. */
export function PageProgress({ page, count }: { page: number; count: number }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`Page ${page + 1} of ${count}`}
      style={{
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 16,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === page ? 28 : 16,
            height: 3,
            borderRadius: 2,
            backgroundColor:
              i === page ? c.emberHot : i < page ? c.emberMuted : c.cardBorder,
          }}
        />
      ))}
    </View>
  );
}

/** The development preview's banner: nothing here is saved. */
export function PreviewBanner({ onExit }: { onExit: () => void }) {
  const c = useColors();
  return (
    <View
      testID="onboarding-preview-banner"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.tight,
        paddingLeft: 12,
        borderRadius: forge.radii.tile,
        borderWidth: forge.border.card,
        borderColor: c.emberMuted,
        backgroundColor: c.emberTint,
      }}
    >
      <Ionicons name="eye-outline" size={16} color={c.emberHot} />
      <FText variant="label" weight="600" style={{ flex: 1 }}>
        Preview · nothing you enter is saved
      </FText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Exit preview"
        onPress={onExit}
        hitSlop={4}
        style={({ pressed }) => ({
          minHeight: forge.heights.compact,
          paddingHorizontal: 12,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <FText variant="label" weight="700" tone="accent">
          Exit
        </FText>
      </Pressable>
    </View>
  );
}

/**
 * A step's main action. Until the step is complete it is drawn as a quiet,
 * fully legible outline (never a dimmed ember), so the athlete can read
 * what it will do; the line under it says what is still missing.
 */
export function StepCta({
  title,
  icon,
  disabled = false,
  accessibilityHint,
  onPress,
}: {
  title: string;
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const c = useColors();
  if (!disabled)
    return (
      <CtaButton
        title={title}
        icon={icon}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
      />
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: true }}
      disabled
      onPress={onPress}
      style={{
        minHeight: forge.heights.cta,
        borderRadius: forge.radii.cta,
        borderWidth: forge.border.active,
        borderColor: c.cardBorder,
        backgroundColor: c.cardRaised,
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {icon && <Ionicons name={icon} size={20} color={c.text2} />}
      <FText
        variant="button"
        tone="secondary"
        numberOfLines={2}
        align="center"
        style={{ flexShrink: 1 }}
      >
        {title}
      </FText>
    </Pressable>
  );
}

/**
 * Why the step can't continue, pinned above its action so it is seen on
 * any phone, and read out when it appears.
 */
export function StepIssue({ text }: { text?: string }) {
  const c = useColors();
  if (!text) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
    >
      <Ionicons
        name="alert-circle"
        size={18}
        color={c.error}
        style={{ marginTop: 1 }}
      />
      <FText variant="label" weight="600" tone="error" style={{ flex: 1 }}>
        {text}
      </FText>
    </View>
  );
}

/**
 * The screen's colour fading over content as it scrolls under a fixed edge
 * (the top bar above, the actions below), instead of a hard cut.
 */
export function EdgeFade({
  edge,
  height = 18,
  style,
}: {
  edge: "top" | "bottom";
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", left: 0, right: 0, height },
        edge === "top" ? { top: 0 } : { bottom: 0 },
        style,
      ]}
    >
      <Gradient
        stops={
          edge === "top"
            ? [
                { offset: 0, color: c.bg, opacity: 1 },
                { offset: 1, color: c.bg, opacity: 0 },
              ]
            : [
                { offset: 0, color: c.bg, opacity: 0 },
                { offset: 1, color: c.bg, opacity: 1 },
              ]
        }
      />
    </View>
  );
}
