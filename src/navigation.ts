import { router, type Href } from "expo-router";

/**
 * Back from a pushed screen. A screen opened directly by a link has nothing
 * to go back to, so it lands on the fallback tab instead of doing nothing.
 */
export function goBack(fallback: Href = "/(tabs)") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Nutrition, showing today (Phase 7.3G G4). Links from other screens (Home's
 * "Nutrition today" card, Progress, You) open today even if a past day was
 * left selected; the tab bar itself keeps the lifter's place.
 */
export const NUTRITION_TODAY = {
  pathname: "/(tabs)/nutrition",
  params: { day: "today" },
} as const;
