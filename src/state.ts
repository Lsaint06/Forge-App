import { create } from "zustand";
import { Alert } from "./platform/alert";
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
/** A validation error from the data layer (zod), not a plain-language one. */
function isSchemaError(e: unknown) {
  return (
    !!e &&
    typeof e === "object" &&
    ((e as { name?: unknown }).name === "ZodError" ||
      Array.isArray((e as { issues?: unknown }).issues))
  );
}
/** What the lifter reads when a save fails; schema details never reach it. */
export function saveErrorMessage(e: unknown) {
  if (isSchemaError(e))
    return "Some values couldn't be saved. Check the form and try again. Your existing data is unchanged.";
  return e instanceof Error && e.message
    ? e.message
    : "Please try again. Your existing data is preserved.";
}
export function mutate<T>(fn: () => T): T | undefined {
  try {
    const result = fn();
    useApp.getState().touch();
    void Haptics.selectionAsync().catch(() => {});
    return result;
  } catch (e) {
    // Full details stay available to developers (Metro log, device logs).
    if (isSchemaError(e))
      console.warn("[FORGE] Save rejected by validation", e);
    Alert.alert("Could not save", saveErrorMessage(e));
    return undefined;
  }
}
/**
 * Asks before an action. `action` names the button ("Delete workout"), so
 * the lifter sees exactly what will happen; destructive actions are styled
 * as such. Without options the button reads "Confirm", as before.
 */
export function confirm(
  title: string,
  message: string,
  fn: () => void,
  options: { action?: string; destructive?: boolean } = {},
) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: options.action ?? "Confirm",
      style: options.destructive === false ? "default" : "destructive",
      onPress: () => mutate(fn),
    },
  ]);
}
