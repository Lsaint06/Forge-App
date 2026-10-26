import type { Journal } from "../../domain/types";
import { amount, kcalText } from "../../domain/nutrition";
import { personalInfo, type PersonalKind } from "../../domain/personal-foods";

// Saved foods screen (REFORGE, Phase 7.3G G1) presentation rules. Read-only:
// they never change what a saved food is, only which ones are shown and how.

/** The screen's filters: every saved food, label foods, or corrections. */
export type SavedFilter = "all" | "labels" | "corrections";
export const SAVED_FILTERS: { value: SavedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "labels", label: "Your labels" },
  { value: "corrections", label: "Corrections" },
];

const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const kindOf = (f: Journal): PersonalKind | undefined =>
  personalInfo(f.data)?.kind;

/** Whether a saved food belongs under a filter. */
export function inFilter(f: Journal, filter: SavedFilter) {
  if (filter === "all") return true;
  const kind = kindOf(f);
  return filter === "labels" ? kind === "food" : kind === "correction";
}

/** How many saved foods each filter holds. */
export function filterCounts(foods: Journal[]): Record<SavedFilter, number> {
  return {
    all: foods.length,
    labels: foods.filter((f) => inFilter(f, "labels")).length,
    corrections: foods.filter((f) => inFilter(f, "corrections")).length,
  };
}

/**
 * The saved foods to show: in the filter, containing every word typed in
 * their name, brand or serving (any order, accents and case ignored), in
 * name order.
 */
export function shownFoods(
  foods: Journal[],
  query: string,
  filter: SavedFilter,
) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return foods
    .filter((f) => inFilter(f, filter))
    .filter((f) => {
      if (!words.length) return true;
      const text = fold(
        `${String(f.data.name ?? "")} ${String(f.data.sourceBrand ?? "")} ${String(f.data.serving ?? "")}`,
      );
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) =>
      String(a.data.name ?? "").localeCompare(
        String(b.data.name ?? ""),
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );
}

/** What one saved food's row says. Values are per serving, as saved. */
export function savedFoodRow(f: Journal) {
  const own = personalInfo(f.data);
  const name = String(f.data.name ?? "").trim();
  const brand =
    typeof f.data.sourceBrand === "string" ? f.data.sourceBrand.trim() : "";
  const serving = String(f.data.serving ?? "").trim() || "1 serving";
  const g = (k: string) => `${amount(Number(f.data[k]))}\u00a0g`;
  const macros = `P\u00a0${g("protein")} · C\u00a0${g("carbs")} · F\u00a0${g("fat")}`;
  const kcal = kcalText(Number(f.data.calories));
  const source =
    own?.kind === "correction"
      ? "Your correction"
      : own?.kind === "food"
        ? "Your label"
        : undefined;
  return {
    name,
    brand,
    serving,
    macros,
    kcal,
    source,
    kind: own?.kind,
    spoken: [name, brand, serving, kcal, macros.replace(/\u00a0/g, " "), source]
      .filter(Boolean)
      .join(", "),
  };
}

/** What a filter with nothing in it says (before any search). */
export const EMPTY_FILTER: Record<
  Exclude<SavedFilter, "all">,
  { title: string; detail: string }
> = {
  labels: {
    title: "No label foods yet",
    detail:
      "Scan a barcode FORGE doesn't know and choose Create food from this barcode. Your label values are saved here and recognised on every scan.",
  },
  corrections: {
    title: "No corrections yet",
    detail:
      "When a USDA product doesn't match your package, open it in Add food and choose Correct nutrition. Your values replace USDA's for you only.",
  },
};
