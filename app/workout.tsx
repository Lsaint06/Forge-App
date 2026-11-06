import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Workout from "../src/screens/Workout";

// The logger opens as a native full-screen modal (AppStack), outside the root
// SafeAreaProvider's native view. On iOS its safe-area views need a provider
// inside the modal to learn the status-bar and home-indicator insets once the
// modal is on screen; without one they can keep the zero insets read before
// it appeared, and the header draws under the clock (Phase 8.3C).
export default function WorkoutModal() {
  return (
    <SafeAreaProvider>
      <Workout />
    </SafeAreaProvider>
  );
}
