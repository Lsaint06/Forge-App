import { readFormNumber } from "./numbers";
import { profileSchema } from "./validation";
import type { Profile } from "./types";

// Daily nutrition targets (Phase 7.3G G2): the rules shared by the Nutrition
// targets sheet and the You tab's targets editor. Targets live in the
// profile; validation is the profile schema's, unchanged (0 to 20,000 kcal;
// protein and fat 0 to 2,000 g; carbs 0 to 3,000 g; decimals allowed).

export const TARGET_KEYS = ["calories", "protein", "carbs", "fat"] as const;
export type TargetKey = (typeof TARGET_KEYS)[number];
export type Targets = Pick<Profile, TargetKey>;
export type TargetTexts = Record<TargetKey, string>;

/** Plain messages for out-of-range or unreadable targets (both editors). */
export const TARGET_HELP: Record<TargetKey, string> = {
  calories: "Enter a number from 0 to 20,000.",
  protein: "Enter a number from 0 to 2,000.",
  carbs: "Enter a number from 0 to 3,000.",
  fat: "Enter a number from 0 to 2,000.",
};

/** The targets as the form shows them: exactly as stored. */
export const targetTexts = (p: Targets): TargetTexts => ({
  calories: String(p.calories),
  protein: String(p.protein),
  carbs: String(p.carbs),
  fat: String(p.fat),
});

/**
 * The targets to save, or what to fix. Numbers are read as the profile form
 * reads them ("," or "." decimals; an empty field is 0) and checked against
 * the whole stored profile with the profile schema, exactly as the You tab's
 * editor does. Only the four targets are returned: nothing else changes.
 */
export function readTargets(
  profile: Profile,
  texts: TargetTexts,
):
  | { values: Targets }
  | { errors: Partial<Record<TargetKey | "form", string>> } {
  const values = Object.fromEntries(
    TARGET_KEYS.map((k) => [k, readFormNumber(texts[k])]),
  ) as Targets;
  const checked = profileSchema.safeParse({ ...profile, ...values });
  if (checked.success) return { values };
  const errors: Partial<Record<TargetKey | "form", string>> = {};
  for (const issue of checked.error.issues) {
    const key = issue.path[0] as TargetKey;
    if ((TARGET_KEYS as readonly string[]).includes(key))
      errors[key] = TARGET_HELP[key];
    else
      errors.form =
        "Your profile has a value that needs fixing in You before targets can be saved.";
  }
  return { errors };
}

/** Energy implied by macro targets (4 / 4 / 9 kcal per gram). Display only. */
export const macroEnergy = (t: Pick<Targets, "protein" | "carbs" | "fat">) =>
  4 * t.protein + 4 * t.carbs + 9 * t.fat;
