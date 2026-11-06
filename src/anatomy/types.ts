import type { ImageSourcePropType } from "react-native";

// FORGE anatomy atlas (Phase 7.2C-3). Presentation only: nothing here is
// read by programs, progression or workout generation.

export type AtlasSide = "front" | "back";

/** A named muscle region drawn in the atlas, on one side of the body. */
export type RegionId =
  | "front.pectoralis-major"
  | "front.deltoid"
  | "front.biceps"
  | "front.trapezius"
  | "front.rectus-abdominis"
  | "front.obliques"
  | "front.quadriceps"
  | "front.adductors"
  | "front.tibialis-anterior"
  | "back.trapezius"
  | "back.deltoid"
  | "back.infraspinatus"
  | "back.teres-major"
  | "back.latissimus-dorsi"
  | "back.triceps"
  | "back.erector-spinae"
  | "back.obliques"
  | "back.gluteus-medius"
  | "back.gluteus-maximus"
  | "back.hamstrings"
  | "back.gastrocnemius"
  | "back.soleus";

/** A highlight image cropped to its region, placed in atlas pixels. */
export type AtlasImage = {
  x: number;
  y: number;
  width: number;
  height: number;
  source: ImageSourcePropType;
};

/** One figure: flat base, shading overlay and the region highlights. */
export type AtlasView = {
  width: number;
  height: number;
  base: ImageSourcePropType;
  shade: ImageSourcePropType;
  regions: Record<string, { primary: AtlasImage; secondary: AtlasImage }>;
};

/** What a muscle group means on the atlas and in the legend. */
export type MuscleEntry = {
  /** Group heading in the legend ("Chest", "Rear deltoids"). */
  label: string;
  /** Named muscles, for the legend and screen readers. */
  muscles: string[];
  /** Regions drawn; empty when the muscle is not visible in either view. */
  regions: RegionId[];
};

export type MuscleMap = {
  primary: MuscleEntry[];
  secondary: MuscleEntry[];
  /** Conditioning work that trains the whole body: nothing is highlighted. */
  fullBody: boolean;
  /** Set when an exercise-specific override shaped this map. */
  override?: string;
};
