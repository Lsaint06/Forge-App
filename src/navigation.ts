import { router, type Href } from "expo-router";

/**
 * Back from a pushed screen. A screen opened directly by a link has nothing
 * to go back to, so it lands on the fallback tab instead of doing nothing.
 */
export function goBack(fallback: Href = "/(tabs)") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
