import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../components/ui";
import { FText, ForgeSubHeader, ForgeTopGlow } from "../../components/reforge";
import { forge } from "../../theme";

/**
 * The frame for Forge's entry screens (Phase 7.7B): the REFORGE top glow,
 * an optional Back with overline and title (as `ForgeSubScreen`), content
 * that scrolls clear of the keyboard, and actions pinned at the bottom.
 * There is no tab bar: nothing behind these screens is reachable yet.
 */
export function EntryFrame({
  title,
  eyebrow,
  onBack,
  footer,
  children,
}: {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
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
            paddingTop: forge.spacing.group,
            paddingBottom: forge.spacing.margin,
            gap: forge.spacing.cardGap,
          }}
        >
          {title &&
            (onBack ? (
              <ForgeSubHeader title={title} eyebrow={eyebrow} onBack={onBack} />
            ) : (
              <View style={{ gap: 6, paddingTop: forge.spacing.group }}>
                {eyebrow && (
                  <FText variant="overline" tone="accent">
                    {eyebrow}
                  </FText>
                )}
                <FText variant="heroTitle" header>
                  {title}
                </FText>
              </View>
            ))}
          {children}
        </ScrollView>
        {footer && (
          <View
            style={{
              paddingHorizontal: forge.spacing.margin,
              paddingTop: forge.spacing.group,
              paddingBottom: forge.spacing.group,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
              gap: forge.spacing.tight,
              backgroundColor: c.bg,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A message under a form: an error, or what happened. Read out when shown. */
export function EntryMessage({
  text,
  tone = "secondary",
}: {
  text?: string;
  tone?: "secondary" | "error" | "positive";
}) {
  if (!text) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert">
      <FText variant="body" weight="600" tone={tone}>
        {text}
      </FText>
    </View>
  );
}

/** Work in progress, said in words beside a quiet ember spinner. */
export function EntryBusy({ text }: { text: string }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      <ActivityIndicator color={c.emberHot} />
      <FText variant="body" tone="secondary" style={{ flexShrink: 1 }}>
        {text}
      </FText>
    </View>
  );
}
