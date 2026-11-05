import { createContext, useContext } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { dark, useColors } from "./ui";
import {
  nativeStackStatusBarStyle,
  statusBarStyleFor,
  type StatusBarStyle,
} from "../domain/presentation/status-bar";

// Forge's status bar style, for `StatusBar` and the native screen stack
// (src/domain/presentation/status-bar.ts explains where each one applies).

/** The intro covers the app (the root layout provides it). */
export const IntroOnScreen = createContext(false);

export function useStatusBarStyle(): StatusBarStyle {
  const c = useColors();
  const intro = useContext(IntroOnScreen);
  return statusBarStyleFor({
    darkBackground: c.background === dark.background,
    intro,
  });
}

/** The native stack's `statusBarStyle` option for this app. */
export function useNativeStackStatusBarStyle(): StatusBarStyle | undefined {
  return nativeStackStatusBarStyle(useStatusBarStyle(), {
    platform: Platform.OS,
    expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  });
}
