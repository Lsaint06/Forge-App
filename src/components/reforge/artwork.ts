import type { ImageSourcePropType } from "react-native";

// REFORGE artwork registry. Screens ask for a slot; an empty slot renders the
// component's graphical fallback, never a placeholder photograph.
//
// Rules (Phase 7.0 §8): bundled files only (offline), no AI-generated or
// unlicensed images, no text baked into images. Every entry must also be
// recorded in docs/redesign/reforge/ASSETS.md with its source and licence.

export type ArtworkSlot =
  | "homeSession"
  | "homeTarget"
  | "workoutHero"
  | "nutritionHero"
  | "progressRecord"
  | "youGoal";

export type Artwork = {
  source: ImageSourcePropType;
  /** Who made it and where it came from, as in the asset register. */
  credit: string;
  license: string;
};

// Intentionally empty in Phase 7.1A: approved artwork arrives from 7.1B.
export const artwork: Readonly<Partial<Record<ArtworkSlot, Artwork>>> = {};
