// Discover Forge (Phase 9.2): the pages before the account. Each page shows
// real Forge screens (src/screens/onboarding/showcase.tsx) under a headline
// and one or two plain sentences: the product does the persuading. Only
// what Forge does today; tests hold the numbers to the bundled program and
// food libraries and keep out claims Forge can't back
// (tests/onboarding-journey.test.ts).

export type DiscoverPage = {
  key: "paths" | "train" | "progress" | "nutrition";
  overline: string;
  title: string;
  body: string;
};

export const DISCOVER_PAGES: readonly DiscoverPage[] = [
  {
    key: "paths",
    overline: "Forge Paths",
    title: "A plan written for you",
    body: "Answer a few questions and Forge matches you to one of 18 programs, each written by hand, for 3, 4 or 5 days a week.",
  },
  {
    key: "train",
    overline: "Train",
    title: "Every set on the record",
    body: "Weight, reps and effort in a few taps, with a rest timer between sets. Each set is saved the moment you log it, even offline.",
  },
  {
    key: "progress",
    overline: "Progress",
    title: "Proof of the work",
    body: "Personal records, strength trends and weekly consistency, measured from every set you log.",
  },
  {
    key: "nutrition",
    overline: "Nutrition",
    title: "Fuel that keeps up",
    body: "Calories and macros against your targets, with 3,730 USDA foods built in and searchable offline.",
  },
];

/**
 * Stage A, Emergence (founder-approved): what Forge stands for, before
 * Discover shows what it holds. The statement is a display headline without
 * closing punctuation, set on two lines; one plain sentence follows.
 */
export const LANDING = {
  /** The statement, one line each, in the display face. */
  lines: ["The work", "shows"],
  /** One plain sentence beneath it. */
  support:
    "Train with intention. Forge keeps the record and makes your progress visible.",
} as const;

/** The statement as a screen reader says it: one phrase. */
export const LANDING_SPOKEN = LANDING.lines.join(" ");
