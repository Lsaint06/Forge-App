import React from "react";
import {
  Text,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { spokenText, useColors } from "../ui";
import {
  DISPLAY_FONT,
  forgeMaxFontScale,
  forgeRoleFor,
  type Colors,
  type ForgeVariant,
} from "../../theme";
import { useBrandFontsReady } from "../../fonts";

export type ForgeTone =
  "primary" | "secondary" | "accent" | "onAccent" | "positive" | "error";

export function forgeToneColor(c: Colors, tone: ForgeTone) {
  return {
    primary: c.text,
    secondary: c.text2,
    accent: c.emberHot,
    onAccent: c.onEmber,
    positive: c.positive,
    error: c.error,
  }[tone];
}

/**
 * REFORGE text. Display roles use the condensed brand face once it has
 * loaded (system face at the same size until then). Uppercase is visual only:
 * screen readers hear natural case, as with `Txt`.
 */
export function FText({
  children,
  variant = "body",
  tone = "primary",
  weight,
  align,
  numberOfLines,
  header = false,
  fit = false,
  style,
}: {
  children: React.ReactNode;
  variant?: ForgeVariant;
  tone?: ForgeTone;
  weight?: TextStyle["fontWeight"];
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  header?: boolean;
  /** Shrink slightly (to 80%) rather than truncate when space is tight. */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const fonts = useBrandFontsReady();
  const r = forgeRoleFor(variant, width);
  const family = r.display && fonts ? DISPLAY_FONT[r.display] : undefined;
  return (
    <Text
      accessibilityRole={header ? "header" : undefined}
      accessibilityLabel={r.uppercase ? spokenText(children) : undefined}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={forgeMaxFontScale[variant]}
      adjustsFontSizeToFit={fit || undefined}
      minimumFontScale={fit ? 0.8 : undefined}
      style={[
        {
          color: forgeToneColor(c, tone),
          fontSize: r.size,
          lineHeight: r.lineHeight,
          letterSpacing: r.tracking,
          // A bundled cut carries its own weight; a synthetic weight on top
          // would pick the wrong face on Android.
          ...(family
            ? { fontFamily: family }
            : { fontWeight: weight ?? r.weight }),
          ...(r.uppercase ? { textTransform: "uppercase" as const } : {}),
          ...(r.tabular ? { fontVariant: ["tabular-nums" as const] } : {}),
          ...(align ? { textAlign: align } : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
