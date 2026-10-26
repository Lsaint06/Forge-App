import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText, type ForgeTone } from "./Text";
import { Gradient } from "./Gradient";

/**
 * The secondary-screen heading on its own (44 pt Back, overline, condensed
 * title), for screens that scroll a virtualised list instead of a
 * `ForgeSubScreen`.
 */
export function ForgeSubHeader({
  title,
  eyebrow,
  eyebrowTone = "secondary",
  onBack,
}: {
  title: string;
  eyebrow?: string;
  eyebrowTone?: ForgeTone;
  onBack: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6, paddingBottom: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={4}
        onPress={onBack}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          minWidth: forge.heights.compact,
          minHeight: forge.heights.compact,
          marginLeft: -10,
          justifyContent: "center",
          alignItems: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="chevron-back" size={26} color={c.text} />
      </Pressable>
      {eyebrow && (
        <FText variant="overline" tone={eyebrowTone}>
          {eyebrow}
        </FText>
      )}
      <FText variant="heroTitle" header numberOfLines={3}>
        {title}
      </FText>
    </View>
  );
}

/** The faint top glow shared by REFORGE screens. */
export function ForgeTopGlow() {
  const c = useColors();
  return (
    <Gradient
      kind="radial"
      center={{ x: 0.5, y: 0 }}
      radius={{ x: 0.9, y: 0.35 }}
      stops={[
        { offset: 0, color: c.sheen },
        { offset: 1, color: c.sheen, opacity: 0 },
      ]}
    />
  );
}

/**
 * Frame for a pushed REFORGE screen (Phase 7.2C): a 44 pt back control, a
 * letter-spaced overline and a condensed title, then cards at the 16 pt
 * margin. No brand header: the wordmark belongs to the tabs and the logger.
 * `footer` pins the screen's main action above the home indicator.
 */
export function ForgeSubScreen({
  title,
  eyebrow,
  eyebrowTone = "secondary",
  onBack,
  footer,
  children,
}: {
  title: string;
  eyebrow?: string;
  eyebrowTone?: ForgeTone;
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ForgeTopGlow />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: forge.spacing.margin,
            paddingBottom: forge.spacing.margin * 2,
            gap: forge.spacing.cardGap,
          }}
        >
          <ForgeSubHeader
            title={title}
            eyebrow={eyebrow}
            eyebrowTone={eyebrowTone}
            onBack={onBack}
          />
          {children}
        </ScrollView>
        {footer && (
          <SafeAreaView
            edges={["bottom"]}
            style={{
              paddingHorizontal: forge.spacing.margin,
              paddingVertical: forge.spacing.group,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
              backgroundColor: c.bg,
            }}
          >
            <View style={{ gap: forge.spacing.tight }}>{footer}</View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** An honest empty state in a REFORGE card: what's missing and what to do. */
export function ForgeEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.cardBg,
        borderRadius: forge.radii.card,
        borderWidth: forge.border.card,
        borderColor: c.cardBorder,
        padding: forge.spacing.cardPadding,
        gap: forge.spacing.tight,
      }}
    >
      <FText variant="cardTitle" weight="700" header>
        {title}
      </FText>
      <FText variant="body" tone="secondary">
        {detail}
      </FText>
      {action && <View style={{ marginTop: 4 }}>{action}</View>}
    </View>
  );
}
