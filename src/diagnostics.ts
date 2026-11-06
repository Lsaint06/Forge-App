import { Platform } from "react-native";
import * as Application from "expo-application";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { buildLine } from "./domain/diagnostics";

// The running build, for beta reports (Phase 8.5, M6): only what the system
// says about the app and its OS, never a device name or identifier.

let started = false;
/** FORGE opened its data and is running: later failures are a screen's. */
export function markStarted() {
  started = true;
}
export const startedRunning = () => started;

/** "FORGE Preview 1.0.0 (14) · iOS 27.0" */
export function currentBuildLine() {
  const android = Platform.OS === "android";
  return buildLine({
    appId: Application.applicationId,
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    projectVersion: Constants.expoConfig?.version,
    os: Platform.OS,
    osVersion: android
      ? (Platform.constants as { Release?: string }).Release
      : Platform.Version,
    apiLevel: android ? Number(Platform.Version) : undefined,
  });
}
