// The status bar's icons (Phase 8.4C-1). Forge's backgrounds follow Forge's
// own theme, which can differ from the phone's light or dark appearance, so
// the icons follow Forge too: light on the dark theme, dark on the light
// one, and light whenever the intro is on screen (it is charcoal in both).

export type StatusBarStyle = "light" | "dark";

export function statusBarStyleFor(o: {
  /** Forge's current background is its dark theme's. */
  darkBackground: boolean;
  /** The intro covers the app. */
  intro: boolean;
}): StatusBarStyle {
  return o.intro || o.darkBackground ? "light" : "dark";
}

/**
 * The style the native screen stack states itself, or undefined to leave it
 * to `StatusBar`.
 *
 * Forge's own iOS builds set `UIViewControllerBasedStatusBarAppearance`
 * (app.json): the iOS 27 SDK ignores the app-wide status bar calls
 * `StatusBar` used to make, so iOS asks the view controllers instead, and
 * react-native-screens passes that question to the top screen of the stack.
 * Without a stated style that screen follows the phone's appearance, not
 * Forge's theme, so every screen states it. Elsewhere it stays unset:
 * - Expo Go's own Info.plist keeps that setting off, where react-native-screens
 *   reports a stated style as an error; `StatusBar` applies the style.
 * - On Android `StatusBar` (expo-status-bar) applies it, as before.
 */
export function nativeStackStatusBarStyle(
  style: StatusBarStyle,
  app: { platform: string; expoGo: boolean },
): StatusBarStyle | undefined {
  return app.platform === "ios" && !app.expoGo ? style : undefined;
}
