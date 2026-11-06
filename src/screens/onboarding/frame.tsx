import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../components/ui";
import { FText, ForgeTopGlow } from "../../components/reforge";
import { forge } from "../../theme";
import { EntryMessage } from "../entry/EntryFrame";
import { AccountChip, type SetupAccount } from "./account";
import { EdgeFade, StepBar } from "./parts";

/**
 * A setup step's frame (Phase 9.2): a fixed top bar (Back, and the account
 * being set up), the step's overline, title and progress, content that
 * scrolls clear of the keyboard and fades under both fixed edges, and the
 * step's action pinned at the bottom.
 */
export function StepFrame({
  eyebrow,
  title,
  step,
  onBack,
  account,
  banner,
  error,
  footer,
  scrollRef,
  children,
}: {
  eyebrow: string;
  /** The step's heading; without one, the overline is the heading. */
  title?: string;
  step: number;
  onBack?: () => void;
  account?: SetupAccount;
  /** The development preview's banner. */
  banner?: React.ReactNode;
  /** Something setup itself must say (a failed sign-out). */
  error?: string;
  footer?: React.ReactNode;
  scrollRef?: React.Ref<React.ComponentRef<typeof ScrollView>>;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <ForgeTopGlow />
      {(onBack || account) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: forge.heights.compact,
            paddingHorizontal: 6,
          }}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={4}
              onPress={onBack}
              style={({ pressed }) => ({
                minWidth: forge.heights.compact,
                minHeight: forge.heights.compact,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </Pressable>
          ) : (
            <View style={{ width: forge.heights.compact }} />
          )}
          {account && <AccountChip account={account} />}
        </View>
      )}
      {banner && (
        <View
          style={{
            paddingHorizontal: forge.spacing.margin,
            paddingTop: onBack || account ? 0 : forge.spacing.tight,
            paddingBottom: forge.spacing.tight,
          }}
        >
          {banner}
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: forge.spacing.margin,
              paddingTop: forge.spacing.tight,
              paddingBottom: forge.spacing.margin * 2,
              gap: forge.spacing.margin,
            }}
          >
            <View style={{ gap: 10 }}>
              <FText
                variant="overline"
                tone="accent"
                header={!title}
                style={{ letterSpacing: 2.6 }}
              >
                {eyebrow}
              </FText>
              {title && (
                <FText variant="heroTitle" header>
                  {title}
                </FText>
              )}
              <View style={{ paddingTop: 4 }}>
                <StepBar step={step} />
              </View>
            </View>
            <EntryMessage text={error} tone="error" />
            {children}
          </ScrollView>
          <EdgeFade edge="top" height={14} />
          {footer && <EdgeFade edge="bottom" height={24} />}
        </View>
        {footer && (
          <View
            style={{
              paddingHorizontal: forge.spacing.margin,
              paddingTop: forge.spacing.tight,
              paddingBottom: forge.spacing.group,
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

/** A labelled group of a step: a numbered overline over its question. */
export function Question({
  number,
  topic,
  question,
  children,
  hint,
}: {
  number: number;
  topic: string;
  question: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={question}
      style={{ gap: forge.spacing.group }}
    >
      <View style={{ gap: 4 }}>
        <FText variant="overline" tone="secondary">
          {`${String(number).padStart(2, "0")} · ${topic}`}
        </FText>
        <FText variant="cardTitle" weight="700">
          {question}
        </FText>
      </View>
      {children}
      {hint && (
        <FText variant="label" tone="secondary">
          {hint}
        </FText>
      )}
    </View>
  );
}
