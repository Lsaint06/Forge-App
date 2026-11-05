import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sheet, useColors } from "../../components/ui";
import { useAfterSheet } from "../../components/system";
import { FText, OutlineButton } from "../../components/reforge";
import { forge } from "../../theme";

/** Who is being set up, with a way out for the wrong account (Phase 7.7C, P4). */
export type SetupAccount = {
  /** The account's email ("this account" when it has none). */
  who: string;
  /** Signing out or restoring: the way out waits. */
  busy?: boolean;
  /** Sign out (Setup asks first if anything was entered). */
  onNotYou: () => void;
};

/**
 * The account being set up, always on screen in one compact line beside
 * Back instead of a paragraph above every step. Tapping it explains and
 * offers the way out; signing out is never one stray tap away.
 */
export function AccountChip({ account }: { account: SetupAccount }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const { after, onDismiss } = useAfterSheet();
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        testID="setup-account"
        accessibilityRole="button"
        accessibilityLabel={`Setting up Forge for ${account.who}`}
        accessibilityHint="Shows the account, with a way to sign out"
        accessibilityState={{ disabled: !!account.busy }}
        disabled={account.busy}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => ({
          maxWidth: Math.max(160, width * 0.62),
          minHeight: forge.heights.compact,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: 10,
          paddingRight: 12,
          borderRadius: forge.radii.pill,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cardRaised,
            borderWidth: forge.border.card,
            borderColor: c.cardBorder,
          }}
        >
          <Ionicons name="person" size={12} color={c.text2} />
        </View>
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          maxFontSizeMultiplier={1.4}
          style={{
            flexShrink: 1,
            color: c.text2,
            fontSize: 13,
            lineHeight: 17,
          }}
        >
          {account.who}
        </Text>
        <Ionicons name="chevron-down" size={14} color={c.text3} />
      </Pressable>
      <Sheet
        visible={open}
        onClose={close}
        onDismiss={onDismiss}
        title="Your account"
        dismissOnBackdrop
        scroll={false}
      >
        <View style={{ gap: forge.spacing.group }}>
          <View style={{ gap: 2 }}>
            <FText variant="label" tone="secondary">
              Setting up Forge for
            </FText>
            {/* One line, never broken at a hyphen: it shrinks a little
                first, and only a very long address loses its middle. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.6}
              style={{
                color: c.text,
                fontSize: 16,
                lineHeight: 21,
                fontWeight: "700",
              }}
            >
              {account.who}
            </Text>
          </View>
          <FText variant="label" tone="secondary">
            Not you? Sign out and set Forge up with your own account.
          </FText>
          <OutlineButton
            title="Sign out"
            icon="log-out-outline"
            disabled={account.busy}
            onPress={() => after(close, account.onNotYou)}
          />
        </View>
      </Sheet>
    </>
  );
}
