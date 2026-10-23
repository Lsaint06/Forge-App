// Responsive set-grid layout. Columns keep meaningful minimum widths; when
// they do not fit, the grid adapts instead of clipping or scrolling sideways:
//
// - wide:    SET | PREV | KG | REPS | RIR | ✓
// - compact: SET | KG | REPS | RIR | ✓, previous set on a line below
// - stacked: SET · previous · ✓ above, labelled inputs on their own line
//            (very narrow screens or large accessibility text sizes)

export const SET_COLUMN = 32;
export const CHECK_COLUMN = 44;
export const GRID_GAP = 4;
// Numbers in set inputs grow with Dynamic Type up to this multiplier.
export const INPUT_MAX_SCALE = 1.4;

// Minimum widths at the default text size: "102.5" in a 17 pt tabular face,
// three-digit reps and a two-digit RIR, each with comfortable padding. The
// previous result ("130×5") shrinks slightly before it would truncate. With
// these widths every iPhone, including the SE, shows all six columns at the
// default text size.
export const MIN_WIDTH = {
  prev: 56,
  primary: 64,
  secondary: 48,
  rir: 44,
} as const;

export type GridMode = "wide" | "compact" | "stacked";
export type GridFields = { secondary: boolean; rir: boolean };
export type GridLayout = {
  mode: GridMode;
  min: Record<keyof typeof MIN_WIDTH, number>;
};

export function setGridLayout(
  width: number,
  fontScale: number,
  fields: GridFields,
): GridLayout {
  const scale = Math.min(Math.max(fontScale, 1), INPUT_MAX_SCALE);
  const min = {
    prev: Math.round(MIN_WIDTH.prev * scale),
    primary: Math.round(MIN_WIDTH.primary * scale),
    secondary: Math.round(MIN_WIDTH.secondary * scale),
    rir: Math.round(MIN_WIDTH.rir * scale),
  };
  const inputs = [
    min.primary,
    ...(fields.secondary ? [min.secondary] : []),
    ...(fields.rir ? [min.rir] : []),
  ];
  const needed = (columns: number[]) =>
    SET_COLUMN +
    CHECK_COLUMN +
    columns.reduce((a, b) => a + b, 0) +
    GRID_GAP * (columns.length + 1);
  const mode: GridMode =
    width >= needed([min.prev, ...inputs])
      ? "wide"
      : width >= needed(inputs)
        ? "compact"
        : "stacked";
  return { mode, min };
}
