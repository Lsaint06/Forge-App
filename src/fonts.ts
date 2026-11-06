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

// The "Continue with Google" label's face (Google's sign-in branding asks for
// Google Sans Medium). Loaded only when that button is shown, on its own: a
// failure leaves the system face and never affects the display face above.
export const PROVIDER_FONT = "ProviderSans-Medium";
let providerStatus: "idle" | "loading" | "ready" | "failed" = "idle";

export function loadProviderFont() {
  if (providerStatus !== "idle") return;
  providerStatus = "loading";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require("expo-font") as typeof import("expo-font");
    Font.loadAsync({
      [PROVIDER_FONT]: require("../assets/fonts/ProviderSans-Medium.ttf"),
    })
      .then(
        () => {
          providerStatus = "ready";
        },
        () => {
          providerStatus = "failed";
        },
      )
      .finally(notify);
  } catch {
    providerStatus = "failed";
  }
}
const providerReady = () => providerStatus === "ready";

/** True once the provider label face can be used. */
export function useProviderFontReady() {
  return useSyncExternalStore(subscribe, providerReady, providerReady);
}
