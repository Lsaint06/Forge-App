import React from "react";
import {
  Image,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useColors } from "../ui";
import { forge } from "../../theme";
import { FText } from "./Text";
import { Gradient } from "./Gradient";
import type { Artwork } from "./artwork";

/**
 * A hero card with artwork on the right, faded into the panel so text on the
 * left stays legible (references: Today's session, workout, nutrition,
 * primary goal). Without approved artwork it draws a graphical ember glow
 * instead, never a placeholder photograph. Artwork is decorative and hidden
 * from screen readers; all meaning stays in the live text.
 */
export function HeroCard({
  children,
  artwork,
  artworkWidth = "60%",
  tagline,
  minHeight = 208,
  padding = 20,
  style,
}: {
  children: React.ReactNode;
  artwork?: Artwork;
  artworkWidth?: DimensionValue;
  /** Short decorative words stacked bottom-right ("STRONGER", …). */
  tagline?: string[];
  minHeight?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          minHeight,
          borderRadius: forge.radii.card,
          borderWidth: forge.border.card,
          borderColor: c.cardBorder,
          backgroundColor: c.cardBg,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {artwork ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: artworkWidth,
          }}
        >
          <Image
            testID="hero-artwork"
            source={artwork.source}
            resizeMode="cover"
            fadeDuration={0}
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      ) : (
        <Gradient
          kind="radial"
          center={{ x: 0.92, y: 0.35 }}
          radius={{ x: 0.55, y: 0.75 }}
          stops={[
            { offset: 0, color: c.emberHot, opacity: 0.16 },
            { offset: 1, color: c.emberHot, opacity: 0 },
          ]}
        />
      )}
      {/* Scrims: the panel colour fades over the artwork from the left and
          the bottom, so text and controls always sit on a solid surface. */}
      <Gradient
        from={{ x: 0, y: 0 }}
        to={{ x: 1, y: 0 }}
        stops={[
          { offset: 0, color: c.cardBg, opacity: 1 },
          { offset: 0.42, color: c.cardBg, opacity: 0.92 },
          { offset: 0.75, color: c.cardBg, opacity: 0.2 },
          { offset: 1, color: c.cardBg, opacity: 0 },
        ]}
      />
      <Gradient
        stops={[
          { offset: 0.6, color: c.cardBg, opacity: 0 },
          { offset: 1, color: c.cardBg, opacity: 0.7 },
        ]}
      />
      <Gradient
        stops={[
          { offset: 0, color: c.sheen },
          { offset: 0.5, color: c.sheen, opacity: 0 },
        ]}
      />
      <View style={{ padding, gap: forge.spacing.group, flexGrow: 1 }}>
        {children}
      </View>
      {tagline && tagline.length > 0 && (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 20,
            bottom: 18,
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          {tagline.map((word) => (
            <FText key={word} variant="tagline" tone="secondary">
              {word}
            </FText>
          ))}
          <View
            style={{
              marginTop: 6,
              width: 20,
              height: 2,
              borderRadius: 1,
              backgroundColor: c.emberHot,
            }}
          />
        </View>
      )}
    </View>
  );
}
