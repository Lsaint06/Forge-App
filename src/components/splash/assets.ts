import type { ImageSourcePropType } from "react-native";

// Runtime image effects for the FORGE intro. Sources, licenses and how these
// were prepared are documented in docs/SPLASH.md. Every layer that uses one of
// these images keeps a procedural fallback if it fails to load.
export type SplashAssets = {
  // White + alpha, tinted at runtime.
  ember: ImageSourcePropType;
  smoke: ImageSourcePropType;
  // Full-color sprites.
  sparks: ImageSourcePropType[];
  bokeh: ImageSourcePropType[];
  // Textured wordmark, one image per letter in wordmarkLetters order
  // (F, O, R, G, E), plus the separate heat glow.
  molten: ImageSourcePropType[];
  steel: ImageSourcePropType[];
  wordmarkGlow: ImageSourcePropType;
};

export const splashAssets: SplashAssets = {
  ember: require("../../../assets/splash/effects/ember.png"),
  smoke: require("../../../assets/splash/effects/smoke.png"),
  sparks: [
    require("../../../assets/splash/effects/spark-1.png"),
    require("../../../assets/splash/effects/spark-2.png"),
    require("../../../assets/splash/effects/spark-3.png"),
    require("../../../assets/splash/effects/spark-4.png"),
    require("../../../assets/splash/effects/spark-5.png"),
  ],
  bokeh: [
    require("../../../assets/splash/effects/bokeh-1.png"),
    require("../../../assets/splash/effects/bokeh-2.png"),
    require("../../../assets/splash/effects/bokeh-3.png"),
  ],
  molten: [
    require("../../../assets/splash/wordmark/molten-F.png"),
    require("../../../assets/splash/wordmark/molten-O.png"),
    require("../../../assets/splash/wordmark/molten-R.png"),
    require("../../../assets/splash/wordmark/molten-G.png"),
    require("../../../assets/splash/wordmark/molten-E.png"),
  ],
  steel: [
    require("../../../assets/splash/wordmark/steel-F.png"),
    require("../../../assets/splash/wordmark/steel-O.png"),
    require("../../../assets/splash/wordmark/steel-R.png"),
    require("../../../assets/splash/wordmark/steel-G.png"),
    require("../../../assets/splash/wordmark/steel-E.png"),
  ],
  wordmarkGlow: require("../../../assets/splash/wordmark/glow.png"),
};

// Stable keys for load tracking: "ember", "spark-0", "steel-2", ...
// Reduced motion only needs the final steel letters.
export function assetEntries(assets: SplashAssets, reduced = false) {
  const steel = assets.steel.map((s, i) => [`steel-${i}`, s] as const);
  if (reduced) return steel as [string, ImageSourcePropType][];
  return [
    ["ember", assets.ember],
    ["smoke", assets.smoke],
    ...assets.sparks.map((s, i) => [`spark-${i}`, s] as const),
    ...assets.bokeh.map((s, i) => [`bokeh-${i}`, s] as const),
    ...assets.molten.map((s, i) => [`molten-${i}`, s] as const),
    ...steel,
    ["wordmark-glow", assets.wordmarkGlow],
  ] as [string, ImageSourcePropType][];
}
