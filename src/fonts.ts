import { useSyncExternalStore } from "react";
import { DISPLAY_FONT } from "./theme";

// The REFORGE display face loads in the background, never in the startup
// path: the database, intro and first screen do not wait for it, and a
// failure leaves the system face in place. Text that asks for the display
// face before it is ready renders in the system face at the same size and
// weight, then switches once it has loaded.

let status: "idle" | "loading" | "ready" | "failed" = "idle";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function loadBrandFonts() {
  if (status !== "idle") return;
  status = "loading";
  try {
    // Required here rather than imported, so rendering text never loads the
    // font module (the app already bundles it for its icons).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require("expo-font") as typeof import("expo-font");
    Font.loadAsync({
      [DISPLAY_FONT.bold]: require("../assets/fonts/BarlowCondensed-Bold.ttf"),
      [DISPLAY_FONT.heavy]: require("../assets/fonts/BarlowCondensed-ExtraBold.ttf"),
    })
      .then(
        () => {
          status = "ready";
        },
        (e: unknown) => {
          status = "failed";
          console.warn("[FORGE] Display font unavailable", e);
        },
      )
      .finally(notify);
  } catch (e) {
    status = "failed";
    console.warn("[FORGE] Display font unavailable", e);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const ready = () => status === "ready";

/** True once the display face can be used. */
export function useBrandFontsReady() {
  return useSyncExternalStore(subscribe, ready, ready);
}
