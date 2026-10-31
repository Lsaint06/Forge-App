import React, { useEffect } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { dark, useColors } from "../../components/ui";
import {
  PROVIDER_FONT,
  loadProviderFont,
  useProviderFontReady,
} from "../../fonts";
import { forge } from "../../theme";

// The provider buttons (Phase 7.7B.1), in each provider's own branding:
// Apple's native button, and Google's button as its guidelines specify
// (colors, the standard "G", Google Sans Medium). Both match Forge's button
// height and corner radius, and contrast with the theme the same way, so
// neither is more prominent than the other.

const useDarkUI = () => useColors().background === dark.background;

/** Apple's own "Continue with Apple" button: white on dark, black on light. */
export function AppleButton({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const darkUI = useDarkUI();
  return (
    <View
      testID="continue-apple"
      pointerEvents={disabled ? "none" : "auto"}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          darkUI
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={forge.radii.cta}
        style={{ width: "100%", height: forge.heights.button }}
        onPress={onPress}
      />
    </View>
  );
}

// Google's published button colors.
const GOOGLE = {
  light: {
    fill: "#FFFFFF",
    stroke: "#747775",
    text: "#1F1F1F",
    logo: require("../../../assets/providers/google-g-light.png"),
  },
  dark: {
    fill: "#131314",
    stroke: "#8E918F",
    text: "#E3E3E3",
    logo: require("../../../assets/providers/google-g-dark.png"),
  },
};

/** "Continue with Google" in Google's light theme on dark, dark on light. */
export function GoogleButton({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useDarkUI() ? GOOGLE.light : GOOGLE.dark;
  const fontReady = useProviderFontReady();
  useEffect(loadProviderFont, []);
  return (
    <Pressable
      testID="continue-google"
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: forge.heights.button,
        borderRadius: forge.radii.cta,
        borderWidth: 1,
        borderColor: theme.stroke,
        backgroundColor: theme.fill,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingHorizontal: 12,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {({ pressed }) => (
        <>
          {/* Material's pressed state layer, in the label color. */}
          {pressed && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: theme.text,
                opacity: 0.12,
              }}
            />
          )}
          <Image
            source={theme.logo}
            style={{ width: 20, height: 20 }}
            accessible={false}
            accessibilityIgnoresInvertColors
          />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{
              color: theme.text,
              fontSize: 16,
              lineHeight: 22,
              ...(fontReady
                ? { fontFamily: PROVIDER_FONT }
                : { fontWeight: "500" as const }),
            }}
          >
            Continue with Google
          </Text>
        </>
      )}
    </Pressable>
  );
}
