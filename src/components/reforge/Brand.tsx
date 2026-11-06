import React from "react";
import { View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { useColors, dark } from "../ui";
import { forge } from "../../theme";
import {
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
  wordmarkLetters,
} from "../splash/wordmark";
import { FText } from "./Text";

/**
 * The line under the wordmark: FORGE's established brand line, as in the
 * intro. The references show "DISCIPLINE BUILDS FREEDOM"; the final line is
 * a founder decision (Phase 7.0, D3), so it lives in one place.
 */
export const BRAND_TAGLINE = "Built through discipline";

/**
 * The FORGE wordmark drawn from the master vector shared with the intro
 * (2 KB of paths instead of the 383 KB steel plate), with a brushed-steel
 * gradient in dark mode and graphite in light mode.
 */
export function Wordmark({ width = 116 }: { width?: number }) {
  const c = useColors();
  const isDark = c.bg === dark.bg;
  const height = (width * WORDMARK_HEIGHT) / WORDMARK_WIDTH;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="FORGE"
      style={{ width, height }}
    >
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      >
        <Defs>
          <LinearGradient id="forgeSteel" x1={0} y1={0} x2={0} y2={1}>
            <Stop offset={0} stopColor={isDark ? "#FFFFFF" : "#3A3F46"} />
            <Stop offset={0.55} stopColor={isDark ? "#D9DCDF" : "#22262B"} />
            <Stop offset={1} stopColor={isDark ? "#8E949B" : "#4E5864"} />
          </LinearGradient>
        </Defs>
        {wordmarkLetters.map((l) => (
          <G key={l.key} transform={`translate(${l.x} 0)`}>
            <Path d={l.path} fill="url(#forgeSteel)" fillRule="evenodd" />
          </G>
        ))}
      </Svg>
    </View>
  );
}

/**
 * The header on every primary tab: wordmark and brand line on the left, the
 * tab's own controls (`children`) on the right.
 */
export function BrandHeader({
  tagline = BRAND_TAGLINE,
  children,
}: {
  tagline?: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: forge.heights.compact,
        gap: forge.spacing.group,
      }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Wordmark />
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <FText variant="tagline" tone="secondary" numberOfLines={1}>
            {tagline}
          </FText>
        </View>
      </View>
      {children && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.tight,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
