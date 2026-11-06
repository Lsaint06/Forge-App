import React from "react";
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useColors } from "../../components/ui";
import { Gradient } from "../../components/reforge";
import type { DiscoverPage } from "../../domain/onboarding/discover";

// Onboarding's product visuals (Phase 9.2): real Forge cards cropped from
// the app's own screens (a demo athlete on FORGE DEV; how they were made
// and how to remake them: docs/ONBOARDING.md). Discover layers them with
// depth, drifting at their own pace as a page is swiped; Stage A sets the
// same cards as a tilted wall in the dark above the brand. Decorative:
// hidden from screen readers; the words beside them carry the meaning.

type Layer = {
  source: ImageSourcePropType;
  /** The image's pixel size (its aspect). */
  px: readonly [number, number];
  /** The card's width in the app, in points: its corners scale with it. */
  card: number;
  /** Place and width in the 360 × 400 pt stage. */
  x: number;
  y: number;
  w: number;
  /** Cropped inside the card: its outline is drawn here instead. */
  outline?: "card" | "ember";
  /** How far it drifts while the page is swiped (0 = with the page). */
  drift: number;
};

const STAGE = { w: 360, h: 400 } as const;

const LAYERS: Record<DiscoverPage["key"], readonly Layer[]> = {
  paths: [
    {
      source: require("../../../assets/onboarding/paths-recommended.png"),
      px: [840, 793],
      card: 361,
      x: 4,
      y: 0,
      w: 300,
      drift: 0.16,
    },
    {
      source: require("../../../assets/onboarding/paths-week.png"),
      px: [840, 347],
      card: 361,
      x: 76,
      y: 268,
      w: 284,
      drift: -0.08,
    },
  ],
  train: [
    {
      source: require("../../../assets/onboarding/train-timer.png"),
      px: [840, 319],
      card: 361,
      x: 124,
      y: 0,
      w: 236,
      drift: 0.22,
    },
    {
      source: require("../../../assets/onboarding/train-exercise.png"),
      px: [840, 673],
      card: 359,
      x: 0,
      y: 46,
      w: 312,
      outline: "ember",
      drift: 0.1,
    },
    {
      source: require("../../../assets/onboarding/train-rest.png"),
      px: [840, 131],
      card: 361,
      x: 56,
      y: 272,
      w: 304,
      drift: -0.1,
    },
  ],
  progress: [
    {
      source: require("../../../assets/onboarding/progress-strength.png"),
      px: [840, 781],
      card: 359,
      x: 0,
      y: 0,
      w: 282,
      outline: "card",
      drift: 0.14,
    },
    {
      source: require("../../../assets/onboarding/progress-record.png"),
      px: [442, 699],
      card: 175,
      x: 212,
      y: 146,
      w: 148,
      drift: -0.1,
    },
  ],
  nutrition: [
    {
      source: require("../../../assets/onboarding/nutrition-today.png"),
      px: [840, 593],
      card: 361,
      x: 0,
      y: 0,
      w: 320,
      drift: 0.14,
    },
    {
      source: require("../../../assets/onboarding/nutrition-water.png"),
      px: [840, 233],
      card: 361,
      x: 56,
      y: 206,
      w: 304,
      drift: -0.1,
    },
  ],
};

const heightOf = (l: Layer) => (l.w * l.px[1]) / l.px[0];

/**
 * One real Forge card at `w` × `h` points: its corners scaled with it, a
 * soft shadow (deeper for cards higher in a stack) and the outline its crop
 * left out.
 */
function CardImage({
  layer: l,
  w,
  h,
  depth,
}: {
  layer: Layer;
  w: number;
  h: number;
  depth: number;
}) {
  const c = useColors();
  const k = w / l.card;
  const radius = 8 * k;
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius,
        backgroundColor: c.cardBg,
        ...(Platform.OS === "android"
          ? { elevation: 14 + depth * 6 }
          : {
              shadowColor: "#000",
              shadowOpacity: 0.6,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 14 },
            }),
      }}
    >
      <View style={{ flex: 1, borderRadius: radius, overflow: "hidden" }}>
        <Image
          source={l.source}
          fadeDuration={0}
          resizeMode="cover"
          style={{ width: w, height: h }}
        />
        {l.outline && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: radius,
                borderWidth: l.outline === "ember" ? k : 0.5 * k,
                borderColor:
                  l.outline === "ember" ? c.emberMuted : c.cardBorder,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

/** The page's cards, scaled to fit its stage and centred in it. */
export function Showcase({
  page,
  index,
  scroll,
  width,
  height,
  still,
}: {
  page: DiscoverPage["key"];
  index: number;
  /** The pager's horizontal offset, driving the drift. */
  scroll: Animated.Value;
  width: number;
  height: number;
  /** Reduce Motion: nothing drifts. */
  still: boolean;
}) {
  const c = useColors();
  const layers = LAYERS[page];
  const top = Math.min(...layers.map((l) => l.y));
  const bottom = Math.max(...layers.map((l) => l.y + heightOf(l)));
  // Never larger than designed, and always clear of the screen's edges.
  const s = Math.min((width - 40) / STAGE.w, (height - 24) / (bottom - top), 1);
  const left = (width - STAGE.w * s) / 2;
  const offset = (height - (bottom - top) * s) / 2 - top * s;
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width, height }}
    >
      <Gradient
        kind="radial"
        center={{ x: 0.5, y: 0.52 }}
        radius={{ x: 0.5, y: 0.46 }}
        stops={[
          { offset: 0, color: c.emberHot, opacity: 0.2 },
          { offset: 0.55, color: c.emberHot, opacity: 0.06 },
          { offset: 1, color: c.emberHot, opacity: 0 },
        ]}
      />
      {layers.map((l, i) => {
        const w = l.w * s;
        const h = heightOf(l) * s;
        const drift = still
          ? 0
          : scroll.interpolate({
              inputRange: range,
              outputRange: [-l.drift * width, 0, l.drift * width],
              extrapolate: "clamp",
            });
        const fade = still
          ? 1
          : scroll.interpolate({
              inputRange: range,
              outputRange: [0.35, 1, 0.35],
              extrapolate: "clamp",
            });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: left + l.x * s,
              top: offset + l.y * s,
              width: w,
              height: h,
              opacity: fade,
              transform: [{ translateX: drift }],
            }}
          >
            <CardImage layer={l} w={w} h={h} depth={i} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Emergence (Stage A): Forge's own screens as a tilted wall in the dark
 * above the brand. It rises out of the darkness once as the launch intro
 * clears, then holds still; it dissolves into the dark at its edges and
 * behind the brand.
 */
const WALL_COLUMN = 172;
const WALL_GAP = 12;
// No card with a large orange action: the wall is atmosphere, and the only
// call to action on the screen is Get started.
const WALL_COLUMNS: readonly { drop: number; cards: readonly Layer[] }[] = [
  {
    drop: 96,
    cards: [LAYERS.nutrition[0]!, LAYERS.train[2]!, LAYERS.paths[1]!],
  },
  {
    drop: 0,
    cards: [LAYERS.progress[0]!, LAYERS.train[0]!, LAYERS.nutrition[1]!],
  },
  { drop: 44, cards: [LAYERS.train[1]!, LAYERS.progress[1]!] },
];
const WALL = (() => {
  const tiles: { layer: Layer; x: number; y: number; h: number }[] = [];
  WALL_COLUMNS.forEach((column, i) => {
    let y = column.drop;
    for (const layer of column.cards) {
      const h = (WALL_COLUMN * layer.px[1]) / layer.px[0];
      tiles.push({ layer, x: i * (WALL_COLUMN + WALL_GAP), y, h });
      y += h + WALL_GAP;
    }
  });
  return {
    tiles,
    w: WALL_COLUMNS.length * WALL_COLUMN + (WALL_COLUMNS.length - 1) * WALL_GAP,
    h: Math.max(...tiles.map((t) => t.y + t.h)),
  };
})();
/** How brightly the wall shows once it has emerged: atmosphere, not content. */
const WALL_OPACITY = 0.42;

export function ProductWall({
  width,
  band,
  progress,
  still,
}: {
  width: number;
  /** From the top of the screen down to the top of the brand. */
  band: number;
  /** Stage A's settle, 0 to 1. */
  progress: Animated.Value;
  still: boolean;
}) {
  const c = useColors();
  // Wide enough that its tilted edges never show.
  const s = Math.max(1, (width * 1.3) / WALL.w);
  // Reduce Motion: the wall simply appears once the intro has gone.
  const shown = progress.interpolate({
    inputRange: [0, 0.9],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const fade = (
    key: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    style: object,
  ) => (
    <View key={key} style={[{ position: "absolute" }, style]}>
      <Gradient
        from={from}
        to={to}
        stops={[
          { offset: 0, color: c.bg, opacity: 1 },
          { offset: 1, color: c.bg, opacity: 0 },
        ]}
      />
    </View>
  );
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height: band,
        overflow: "hidden",
      }}
    >
      <Animated.View
        testID="landing-wall"
        style={{
          position: "absolute",
          width: WALL.w,
          height: WALL.h,
          left: (width - WALL.w) / 2,
          top: band * 0.5 - WALL.h / 2,
          opacity: shown.interpolate({
            inputRange: [0, 1],
            outputRange: [0, WALL_OPACITY],
          }),
          transform: [
            {
              translateY: still
                ? 0
                : shown.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
            },
            { rotate: "-9deg" },
            {
              scale: still
                ? s
                : shown.interpolate({
                    inputRange: [0, 1],
                    outputRange: [s * 1.06, s],
                  }),
            },
          ],
        }}
      >
        {WALL.tiles.map((t, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: WALL_COLUMN,
              height: t.h,
            }}
          >
            <CardImage layer={t.layer} w={WALL_COLUMN} h={t.h} depth={0} />
          </View>
        ))}
      </Animated.View>
      {fade(
        "top",
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        {
          top: 0,
          left: 0,
          right: 0,
          height: Math.min(140, band * 0.3),
        },
      )}
      {fade(
        "bottom",
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        {
          bottom: 0,
          left: 0,
          right: 0,
          height: band * 0.5,
        },
      )}
      {(["left", "right"] as const).map((side) =>
        fade(
          side,
          { x: side === "left" ? 0 : 1, y: 0 },
          { x: side === "left" ? 1 : 0, y: 0 },
          { top: 0, bottom: 0, width: width * 0.16, [side]: 0 },
        ),
      )}
    </View>
  );
}
