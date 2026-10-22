// Pure timeline data for the FORGE intro, shared by the animation and tests.

export const SPLASH_COLORS = {
  charcoal: "#101216",
  orange: "#F46B35",
  offWhite: "#F5F3EF",
} as const;

// Stage boundaries in milliseconds. One native-driven clock drives every
// layer, so the sequence plays without per-frame JavaScript work.
export const INTRO = {
  ignite: 0, // 01 Ember ignition
  forge: 500, // 02 Forging the letters
  reveal: 1200, // 03 Molten FORGE reveal
  cool: 1600, // 04 Cooling into steel
  settle: 2200, // 05 Built through discipline
  total: 2600,
  exit: 380,
} as const;

export const PARTICLE_COUNT = 44;
// Image effects wait this long at most before falling back to the procedural
// versions, so a slow image load never delays or stalls the intro.
export const ASSET_WAIT_MS = 450;
export const SPARK_COUNT = 12;
export const BOKEH_COUNT = 3;
// Deterministic pseudo-random values so the layout is stable across renders.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Particle = {
  size: number;
  hot: boolean;
  brightness: number;
  appear: number;
  start: [number, number];
  gather: [number, number];
  burst: [number, number];
  drift: [number, number];
};
// Offsets are relative to the wordmark's center.
export function makeParticles(
  width: number,
  height: number,
  markWidth: number,
  markHeight: number,
): Particle[] {
  const random = mulberry32(0xf0e9e);
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const gather: [number, number] = [
      (random() - 0.5) * markWidth * 1.05,
      (random() - 0.5) * markHeight * 1.3,
    ];
    const angle = random() * Math.PI * 2;
    // Bursts carry slightly upward, like sparks off hot metal.
    const distance = markHeight * (0.9 + random() * 1.8);
    const burst: [number, number] = [
      gather[0] + Math.cos(angle) * distance * 1.4,
      gather[1] + Math.sin(angle) * distance - markHeight * 0.4,
    ];
    return {
      size: 2 + random() * 3.4,
      hot: random() > 0.35,
      brightness: 0.7 + random() * 0.3,
      appear: random() * 360,
      // Embers rise out of the darkness, mostly from below the wordmark.
      start: [
        (random() - 0.5) * width * 0.95,
        height * (0.05 + random() * 0.42) * (random() > 0.2 ? 1 : -1),
      ],
      gather,
      burst,
      drift: [burst[0] + (random() - 0.5) * 20, burst[1] - 24 - random() * 40],
    };
  });
}

// Real spark streaks thrown off the metal at the molten reveal. Each flies
// outward along its angle; the sprite is rotated to match its direction.
export type Spark = {
  sprite: number;
  from: [number, number];
  to: [number, number];
  rotate: string;
  width: number;
  length: number;
  delay: number;
  duration: number;
};
export function makeSparks(
  markWidth: number,
  markHeight: number,
  sprites: number,
): Spark[] {
  const random = mulberry32(0x5a7c3);
  return Array.from({ length: SPARK_COUNT }, (_, i) => {
    // Mostly upward and sideways, like a hammer strike.
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.5;
    const from: [number, number] = [
      (random() - 0.5) * markWidth * 0.9,
      (random() - 0.5) * markHeight * 0.5,
    ];
    const distance = markHeight * (1.6 + random() * 2.6);
    return {
      sprite: i % Math.max(1, sprites),
      from,
      to: [
        from[0] + Math.cos(angle) * distance,
        from[1] + Math.sin(angle) * distance,
      ],
      rotate: `${((angle * 180) / Math.PI + 90).toFixed(1)}deg`,
      width: 3 + random() * 2.2,
      length: markHeight * (0.45 + random() * 0.45),
      delay: random() * 120,
      duration: 320 + random() * 220,
    };
  });
}

// Out-of-focus embers drifting in front of and behind the wordmark for depth.
export type Bokeh = {
  sprite: number;
  at: [number, number];
  size: number;
  opacity: number;
  rise: number;
};
export function makeBokeh(
  width: number,
  height: number,
  sprites: number,
): Bokeh[] {
  const random = mulberry32(0xb0c3e);
  // Kept away from the wordmark's center band so the letters stay clear.
  const spots: [number, number][] = [
    [-0.32, 0.2],
    [0.36, -0.22],
    [0.18, 0.33],
  ];
  return spots.slice(0, BOKEH_COUNT).map(([x, y], i) => ({
    sprite: i % Math.max(1, sprites),
    at: [x * width, y * height],
    size: 30 + random() * 26,
    opacity: 0.22 + random() * 0.14,
    rise: 18 + random() * 22,
  }));
}
