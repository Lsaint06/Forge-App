/**
 * FORGE Design System 2.0 tokens. Offline system typography; all design values
 * are independent of persisted data. Dark-first; light mode keeps parity.
 *
 * Rules: one ember (accent) fill per screen; surfaces are tonal (no borders);
 * hairlines only separate rows; numbers use tabular figures.
 */
const dark = {
  // Foundation
  bg: "#0A0B0D",
  surface: "#141619",
  surfaceRaised: "#1E2125",
  // Selected segment of a segmented control.
  selected: "#33373E",
  hairline: "#2A2E34",
  // Text hierarchy
  text: "#F4F2EE",
  text2: "#A4A9B0",
  text3: "#6E747C",
  // Accent: flat ember, used for the single primary action, selection and
  // live progress only.
  ember: "#F46B35",
  emberPressed: "#D95727",
  onEmber: "#0A0B0D",
  // Status
  success: "#43B88C",
  // Completed set rows: success at ~14% over surface, precomputed so its
  // contrast can be verified.
  successSubtle: "#1B2D29",
  warning: "#E5AE58",
  error: "#EE7A75",
  scrim: "rgba(0,0,0,0.6)",
} as const;

const light = {
  bg: "#F2F3F5",
  surface: "#FFFFFF",
  surfaceRaised: "#E9ECF0",
  selected: "#FFFFFF",
  hairline: "#D5DAE1",
  text: "#111418",
  text2: "#4E5864",
  text3: "#6B7480",
  // Same hue as dark-mode ember (17°), darkened for AA contrast on light
  // surfaces and under white labels.
  ember: "#C2410C",
  emberPressed: "#A3360A",
  onEmber: "#FFFFFF",
  success: "#19724F",
  successSubtle: "#E3EEEA",
  warning: "#8A5A00",
  error: "#A52C32",
  scrim: "rgba(0,0,0,0.4)",
} as const;

export type Palette = {
  [K in keyof typeof dark]: string;
};

// Earlier component code reads these names; they map onto the 2.0 tokens.
export function withLegacyAliases(p: Palette) {
  return {
    ...p,
    background: p.bg,
    elevated: p.surfaceRaised,
    muted: p.text2,
    subtle: p.text3,
    accent: p.ember,
    pressed: p.emberPressed,
    border: p.hairline,
  };
}
export type Colors = ReturnType<typeof withLegacyAliases>;

type TextRole = {
  size: number;
  lineHeight: number;
  weight: "400" | "500" | "600" | "700" | "800";
  tracking: number;
  uppercase?: boolean;
  tabular?: boolean;
};

// Six text roles and two numeric roles replace ad-hoc sizes.
export const textRoles = {
  display: { size: 32, lineHeight: 36, weight: "800", tracking: -0.5 },
  title: { size: 22, lineHeight: 27, weight: "700", tracking: -0.2 },
  headline: { size: 17, lineHeight: 22, weight: "600", tracking: 0 },
  body: { size: 15, lineHeight: 21, weight: "400", tracking: 0 },
  caption: { size: 13, lineHeight: 17, weight: "500", tracking: 0 },
  overline: {
    size: 11,
    lineHeight: 14,
    weight: "700",
    tracking: 1.6,
    uppercase: true,
  },
  metricXL: {
    size: 44,
    lineHeight: 48,
    weight: "700",
    tracking: -1,
    tabular: true,
  },
  metric: {
    size: 22,
    lineHeight: 26,
    weight: "600",
    tracking: -0.3,
    tabular: true,
  },
} as const satisfies Record<string, TextRole>;
export type TextVariant = keyof typeof textRoles;

// iPhone logical widths: SE and mini are 375 pt or narrower; standard models
// are 390–402 pt; Plus and Pro Max models are 428 pt or wider.
export type SizeClass = "compact" | "standard" | "large";
export function sizeClass(width: number): SizeClass {
  if (width < 390) return "compact";
  if (width >= 428) return "large";
  return "standard";
}

// Only the largest roles respond to the device so titles never clip or
// wrap excessively on compact phones. Standard sizes match `textRoles`.
const responsiveSizes: Partial<
  Record<TextVariant, Record<SizeClass, { size: number; lineHeight: number }>>
> = {
  display: {
    compact: { size: 28, lineHeight: 32 },
    standard: { size: 32, lineHeight: 36 },
    large: { size: 34, lineHeight: 40 },
  },
  metricXL: {
    compact: { size: 40, lineHeight: 44 },
    standard: { size: 44, lineHeight: 48 },
    large: { size: 44, lineHeight: 48 },
  },
};
export function textRoleFor(variant: TextVariant, width: number) {
  const base: TextRole = textRoles[variant];
  const responsive = responsiveSizes[variant]?.[sizeClass(width)];
  return responsive ? { ...base, ...responsive } : base;
}

// Dynamic Type scales all text. Headings and hero numbers stop growing at
// these multipliers so they stay on screen; body and caption text scale fully.
export const maxFontScale: Partial<Record<TextVariant, number>> = {
  display: 1.3,
  metricXL: 1.2,
  title: 1.5,
  metric: 1.5,
};

export const theme = {
  palettes: { dark, light },
  // Legacy-compatible dark colors (`theme.colors.*`).
  colors: withLegacyAliases(dark),
  // 4-pt grid.
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    screen: 20,
    section: 32,
    group: 12,
    row: 16,
  },
  radii: { control: 12, card: 16, sheet: 24, pill: 999 },
  // Minimum interactive heights. 44 pt is Apple's minimum tap target.
  heights: { primary: 54, control: 48, compact: 44, row: 56, rowTall: 64 },
  textRoles,
  // Legacy aliases for numeric sizes.
  typography: {
    display: textRoles.display.size,
    title: textRoles.title.size,
    section: 20,
    body: textRoles.body.size,
    supporting: textRoles.caption.size,
    numeric: 32,
  },
  // Elevation is tonal; only sheets and menus float above a scrim.
  elevation: {
    flat: {},
    floating: {
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
  },
  motion: { press: 100, transition: 180, progress: 300 },
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  border: { width: 1 },
} as const;

// Earlier code passes arbitrary font sizes to Label; they snap to the scale.
export function legacySizeRole(size: number): TextVariant {
  if (size <= 11) return "overline";
  if (size <= 13) return "caption";
  if (size <= 16) return "body";
  if (size <= 19) return "headline";
  if (size <= 24) return "title";
  return "display";
}
