import React, { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

// Onboarding's motion (Phase 9.2): content settles in with a short fade and
// rise. Cinematic, never slow: everything is in place within about half a
// second, nothing waits for it, and every control works while it plays.
// With Reduce Motion it is simply there.

export const ENTRANCE_MS = 320;

export function useEntrance(delay = 0, distance = 12) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      shown.value = 1;
      return;
    }
    shown.value = withDelay(delay, withTiming(1, { duration: ENTRANCE_MS }));
  }, [reduced, delay, shown]);
  return useAnimatedStyle(() => ({
    // Inline maths only: this runs on the UI thread.
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * distance }],
  }));
}

/** Children that settle in after `delay` ms. */
export function Entrance({
  delay = 0,
  distance,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const entrance = useEntrance(delay, distance);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}
