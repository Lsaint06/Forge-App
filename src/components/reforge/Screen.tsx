import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { Gradient } from "./Gradient";
import { BrandHeader } from "./Brand";

/**
 * Frame for a transformed primary tab: near-black background with a faint
 * top glow, the brand header, then cards at the references' 16 pt margin and
 * 12 pt rhythm. `brand` holds the header's right-hand controls; pass
 * `brand={false}` to omit the header. `footer` pins an action above the tab
 * bar, as `Screen` does.
 */
export function ForgeScreen({
  children,
  brand,
  footer,
}: {
  children: React.ReactNode;
  brand?: React.ReactNode | false;
  footer?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <Gradient
        kind="radial"
        center={{ x: 0.5, y: 0 }}
        radius={{ x: 0.9, y: 0.35 }}
        stops={[
          { offset: 0, color: c.sheen },
          { offset: 1, color: c.sheen, opacity: 0 },
        ]}
      />
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
            paddingTop: forge.spacing.tight,
            paddingBottom: forge.spacing.margin * 2,
            gap: forge.spacing.cardGap,
          }}
        >
          {brand !== false && <BrandHeader>{brand || undefined}</BrandHeader>}
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
