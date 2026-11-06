// FORGE wordmark geometry, traced from the approved cooled-steel brand
// artwork (assets/splash/brand/forge-wordmark.svg). Cap height is 100 units;
// each path is local to its letter's x. The textured wordmark images in
// assets/splash/wordmark/ were rendered through these same shapes, so image
// and vector letters align exactly. Letter boxes may overlap (the F's top bar
// overhangs the O, the G's overhangs the E); each letter is drawn separately.
export type WordmarkLetter = {
  key: string;
  x: number;
  width: number;
  path: string;
};

export const wordmarkLetters: WordmarkLetter[] = [
  {
    key: "F",
    x: 0,
    width: 129,
    path: "M129 0.6L129 2.2L125.2 7L122.9 8.6L103.2 30.9L43.9 31.2L42.4 33.4L42.7 36.3L102.2 36.3L103.5 37.3L102.5 41.4L80.6 65.9L39.2 65.9L38.5 66.6L38.5 95.9L38.2 99L37.3 100L3.5 100L0.6 97.5L0 95.9L0 29.9L1 27.7L5.1 23.6L28 2.5L32.8 0.3L45.5 0Z",
  },
  {
    key: "O",
    x: 118.8,
    width: 127.4,
    path: "M1.6 19.4L20.1 2.5L24.8 0.3L101.6 0L108 0.3L110.5 1.6L125.5 15.6L127.4 20.4L127.4 79.9L126.4 82.5L108.6 99.7L22.3 100L21 99.4L1.9 81.2L0.3 78L0 26.4L0.3 22.3ZM37.6 32.5L36.9 48.7L37.6 68.8L91.4 68.8L93.3 67.5L93.9 66.2L94.3 34.1L92.3 31.5L39.2 31.2Z",
  },
  {
    key: "R",
    x: 254.5,
    width: 128.6,
    path: "M0.3 1L3.1 0L88.5 0L100.9 0.3L105.4 2.2L118.7 15L120.7 15.9L121.9 17.8L121.9 47.5L120.3 50.6L105.1 65.6L91.7 65.9L91.7 66.6L100.3 73.2L124.2 94.6L125.8 95.2L128.6 98.4L128.6 99.4L127.7 100L82.1 100L42.3 65.6L32.8 58.3L32.1 99.4L31.2 100L0.9 99.7L0 96.8L0 37.9L0.6 36.6L88.5 36.3L88.8 32.5L86.9 30.9L1.6 30.6L0 25.8Z",
  },
  {
    key: "G",
    x: 385.4,
    width: 133.4,
    path: "M1.2 19.7L18.7 2.9L24.2 0.3L132.8 0.3L133.4 1.9L131.2 5.1L106.6 30.9L34.7 31.2L31.8 33.8L31.8 66.6L34.7 68.8L86.3 68.5L86.3 65.3L84.3 64.3L43.9 64.3L43.3 63.7L44.5 59.6L62.7 39.8L66.2 36.9L68.4 36.3L121 36.6L121.9 38.5L121.9 79L119.1 84.1L104.4 99.7L19.7 100L18.7 99.4L1.5 83.8L0 79.9L0 24.5Z",
  },
  {
    key: "E",
    x: 513.4,
    width: 126.4,
    path: "M2.2 19.4L20 2.2L24.8 0.3L126.1 0.3L126.4 2.5L123.9 6.4L103.2 30.9L35.3 31.2L34.1 31.8L34.1 36.3L111.4 36.6L111.8 38.2L109.5 41.4L88.5 64.3L33.7 65L33.7 66.9L35 68.8L122 69.1L122.6 70.1L122.3 71.7L119.1 77.4L102.5 97.5L99.7 100L18.4 100L17.5 99.4L2.8 85.7L0 81.8L0 24.5Z",
  },
];

export const WORDMARK_HEIGHT = 100;
export const WORDMARK_WIDTH = Math.max(
  ...wordmarkLetters.map((l) => l.x + l.width),
);

// Glow strokes extend past the glyph edges; each letter's canvas is padded so
// nothing clips. The per-letter wordmark images use this same padded box.
export const LETTER_PAD = 8;

// The heat-glow image covers this region, in wordmark units: the shared
// 1440 x 432 brand canvas with the wordmark at 88% of its width.
export const GLOW_REGION = {
  x: -43.62,
  y: -59.06,
  width: 727.05,
  height: 218.11,
};
