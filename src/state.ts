import { create } from "zustand";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { repository } from "./data/native";
import type { Profile } from "./domain/types";
export const useApp = create<{
  revision: number;
  profile: Profile | undefined;
  touch: () => void;
}>((set) => ({
  revision: 0,
  profile: undefined,
  touch: () =>
    set((s) => {
      const p = repository().profile();
      return {
        revision: s.revision + 1,
        profile:
          JSON.stringify(p) === JSON.stringify(s.profile) ? s.profile : p,
      };
    }),
}));
export function useRepo() {
  useApp((s) => s.revision);
  return repository();
}
export function mutate<T>(fn: () => T): T | undefined {
  try {
    const result = fn();
    useApp.getState().touch();
    void Haptics.selectionAsync().catch(() => {});
    return result;
  } catch (e) {
    Alert.alert(
      "Could not save",
      e instanceof Error
        ? e.message
        : "Please try again. Your existing data is preserved.",
    );
    return undefined;
  }
}
export function confirm(title: string, message: string, fn: () => void) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Confirm", style: "destructive", onPress: () => mutate(fn) },
  ]);
}
