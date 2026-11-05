import {
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
} from "../../components/splash/wordmark";

// Where the launch intro (src/components/splash/ForgeSplash.tsx) leaves the
// FORGE wordmark and BUILT THROUGH DISCIPLINE, so the brand welcome (Stage
// A) continues from its last frame without a seam: the same size, place and
// line. The same formulas as the intro's own layout; a test holds them
// together (tests/onboarding-journey.test.ts).
export function introMark(
  window: { width: number; height: number },
  insets: { top: number; bottom: number },
) {
  const width = Math.min(window.width - 64, 440, window.height * 0.9);
  const height = (WORDMARK_HEIGHT * width) / WORDMARK_WIDTH;
  const tagline = Math.max(10, Math.min(14, width * 0.032));
  const centerY = insets.top + (window.height - insets.top - insets.bottom) / 2;
  return { width, height, tagline, top: centerY - height / 2 - tagline };
}
