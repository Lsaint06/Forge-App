import React, { useEffect, useState } from "react";
import { usePathname } from "expo-router";
import { Freeze } from "react-freeze";

// Phase 7.6: background tabs stop re-rendering.
//
// Every screen subscribes to the store revision (`useRepo`), and expo-router
// keeps visited tabs mounted, so each saved change re-rendered every visited
// tab. Logging one set with five tabs visited and 400 workouts cost about
// 800 ms of JavaScript (desktop, jest), against about 1 ms for the logger
// alone. A frozen tab keeps its state and renders again, with the latest
// data, the moment it is shown. (Expo Router 58 ignores `freezeOnBlur`.)

/** The tabs' paths, as `usePathname` reports them. */
export const TAB_PATHS: Record<string, string> = {
  index: "/",
  train: "/train",
  nutrition: "/nutrition",
  progress: "/progress",
  profile: "/profile",
};
/** The workout logger: a full-screen modal over the tabs. */
export const LOGGER_PATH = "/workout";
/** Long enough for the logger to finish sliding in over the tab. */
export const COVERED_AFTER_MS = 600;

/**
 * Whether a tab should be frozen, given where the app is:
 * - another tab is shown: frozen (it is hidden);
 * - this tab is shown: live;
 * - the full-screen logger is up: frozen ("covered", after it slides in);
 * - any other screen is pushed over the tabs: as before it was pushed, so
 *   the tab under it stays live for the iOS swipe back.
 */
export function tabFreeze(
  pathname: string,
  own: string,
  wasShown: boolean,
): "live" | "frozen" | "covered" {
  if (Object.values(TAB_PATHS).includes(pathname))
    return pathname === own ? "live" : "frozen";
  if (pathname === LOGGER_PATH) return "covered";
  return wasShown ? "live" : "frozen";
}

/** Wraps one tab's scene (the tabs layout's `screenLayout`). */
export function TabFreeze({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onTab = Object.values(TAB_PATHS).includes(pathname);
  // Whether this was the tab on screen when something was pushed over it.
  const [shown, setShown] = useState(true);
  if (onTab && shown !== (pathname === path)) setShown(pathname === path);
  const state = tabFreeze(pathname, path, onTab ? pathname === path : shown);
  // Covered by the logger: freeze only once it has slid in.
  const [covered, setCovered] = useState(false);
  if (state !== "covered" && covered) setCovered(false);
  useEffect(() => {
    if (state !== "covered") return;
    const t = setTimeout(() => setCovered(true), COVERED_AFTER_MS);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <Freeze freeze={state === "frozen" || (state === "covered" && covered)}>
      {children}
    </Freeze>
  );
}
