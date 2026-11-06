// Stage A's composition (Emergence) as plain arithmetic, so every screen and
// text size can be checked without a device (tests/onboarding-journey.test.ts).
// Everything sits in the normal flow of a scroll view, top to bottom:
//
//   [rest] brand [gap] statement [flex] actions
//
// with the wall of Forge's own screens drawn behind, from the top of the
// screen down to the brand. Under the launch intro the brand is drawn `drop`
// points below its rest: exactly where the intro leaves the wordmark
// (handoff.ts). On a phone at ordinary text sizes it never moves (`drop` is
// 0); it rises only as far as the statement needs to stay clear of the
// actions. Nothing covers anything: the wall is the first to go when room is
// short, and with very large text the screen scrolls.

export const LANDING_SPACE = {
  /** Below the status bar, and below the preview's banner. */
  ceiling: 20,
  /** The least room between the brand and its statement. */
  statement: 28,
  /** Above the actions. */
  around: 24,
} as const;

/** The wall shows only with at least this much dark above the brand. */
export const LANDING_MIN_WALL = 120;

export type LandingMeasures = {
  /** The screen as laid out (Android's window height differs). */
  height: number;
  insets: { top: number; bottom: number };
  /** Where the launch intro leaves the wordmark (introMark().top). */
  markTop: number;
  /** The preview's banner (0 without one). */
  banner: number;
  brand: number;
  statement: number;
  actions: number;
};

export type LandingPlan = {
  /** Where the brand rests: the space above it in the flow. */
  rest: number;
  /** How far below its rest the brand starts: the launch intro's place. */
  drop: number;
  /** Between the brand and its statement. */
  gap: number;
  /** The wall's band, from the top of the screen to here; 0 for none. */
  wall: number;
};

export function landingPlan(m: LandingMeasures): LandingPlan {
  const S = LANDING_SPACE;
  const ceiling = m.insets.top + (m.banner > 0 ? m.banner + 12 : 0) + S.ceiling;
  const floor = m.height - m.actions;
  // Exactly where the launch intro left the wordmark. Higher only when the
  // actions would otherwise reach it (large text on a small phone).
  const start = Math.max(
    m.insets.top + 12,
    Math.min(m.markTop, floor - m.brand - S.around),
  );
  // The brand holds the intro's place while its statement fits beneath it,
  // clear of the actions, and only ever rises.
  const lowest = floor - S.around - m.statement - S.statement - m.brand;
  const rest = Math.min(start, Math.max(ceiling, Math.min(start, lowest)));
  // The wall fills the dark above the brand and has dissolved by its top.
  const wall = rest - ceiling >= LANDING_MIN_WALL ? rest + 8 : 0;
  // The statement sits a little above the middle of the room left between
  // the brand and the actions.
  const slack = floor - rest - m.brand - m.statement;
  const gap = Math.max(S.statement, Math.min(56, slack * 0.42));
  return { rest, drop: start - rest, gap, wall };
}
