import { defaults, type Journal, type Profile } from "./types";
import { nutritionTotals } from "./metrics";

// Nutrition logging rules. Entries and saved foods are journal records whose
// shapes predate this module: every helper reads them defensively, never
// rewrites a field the lifter didn't change, and keeps totals on the raw
// values (rounding happens only for display).

export type NutritionData = Journal["data"];
export type Totals = ReturnType<typeof nutritionTotals>;

/** The meals new entries are filed under. */
export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type Meal = (typeof MEALS)[number];

/** Older entries typed their meal freely; these spellings mean a default meal. */
export function canonicalMeal(meal: unknown): Meal | undefined {
  const text = String(meal ?? "")
    .trim()
    .toLowerCase();
  if (text === "breakfast") return "Breakfast";
  if (text === "lunch") return "Lunch";
  if (text === "dinner") return "Dinner";
  if (text === "snack" || text === "snacks") return "Snacks";
  return undefined;
}

/** The meal to suggest for a new entry, from the local time of day. */
export function defaultMeal(time = Date.now()): Meal {
  const d = new Date(time);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 10 * 60 + 30) return "Breakfast";
  if (minutes < 15 * 60) return "Lunch";
  if (minutes < 21 * 60) return "Dinner";
  return "Snacks";
}

const num = (v: unknown) => Number(v);
export const macrosOf = (data: NutritionData) => ({
  calories: num(data.calories),
  protein: num(data.protein),
  carbs: num(data.carbs),
  fat: num(data.fat),
  quantity: num(data.quantity),
});
/** Totals for entries, on raw values: the same calculation as before. */
export const totalsOf = (entries: Journal[]): Totals =>
  nutritionTotals(entries.map((e) => macrosOf(e.data)));
/** Energy for one entry: per-serving calories × servings eaten. */
export const entryCalories = (data: NutritionData) =>
  num(data.calories) * num(data.quantity);

export const entriesOn = (entries: Journal[], date: string) =>
  entries
    .filter((e) => e.date === date)
    .sort((a, b) => a.createdAt - b.createdAt);

export type MealGroup = {
  key: string;
  label: string;
  /** Set for the four default meals, which accept new entries. */
  meal?: Meal;
  entries: Journal[];
  totals: Totals;
};

/**
 * Entries grouped for display: the four default meals (always present, in
 * order), then any other meal an older entry was given (under its own name),
 * then entries with no meal. Every entry appears exactly once, and grouping
 * never changes what is stored.
 */
export function groupByMeal(entries: Journal[]): MealGroup[] {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const groups = new Map<string, MealGroup>();
  for (const meal of MEALS)
    groups.set(meal, {
      key: meal,
      label: meal,
      meal,
      entries: [],
      totals: totalsOf([]),
    });
  const other: Journal[] = [];
  for (const e of sorted) {
    const canonical = canonicalMeal(e.data.meal);
    const text = String(e.data.meal ?? "").trim();
    if (canonical) groups.get(canonical)!.entries.push(e);
    else if (!text) other.push(e);
    else {
      const key = `custom:${text.toLowerCase()}`;
      if (!groups.has(key))
        groups.set(key, {
          key,
          label: text,
          entries: [],
          totals: totalsOf([]),
        });
      groups.get(key)!.entries.push(e);
    }
  }
  if (other.length)
    groups.set("none", {
      key: "none",
      label: "Other",
      entries: other,
      totals: totalsOf([]),
    });
  return [...groups.values()].map((g) => ({
    ...g,
    totals: totalsOf(g.entries),
  }));
}

/** "1", "1.5", "0.25": servings without trailing zeros. */
export function amount(n: number) {
  return String(Math.round(n * 100) / 100);
}
export const servingsText = (q: number) =>
  `${amount(q)} ${q === 1 ? "serving" : "servings"}`;

/** What was eaten: "40 g", "1.5 × 100 g" or "2 servings". */
export function portionText(data: NutritionData) {
  const q = num(data.quantity);
  const serving = String(data.serving ?? "").trim();
  if (!serving) return servingsText(q);
  return q === 1 ? serving : `${amount(q)} × ${serving}`;
}

export const kcalText = (n: number) => `${Math.round(n).toLocaleString()} kcal`;
export const gramsText = (n: number) => `${Math.round(n)} g`;

/** A food to log: a saved food, or a recent entry eaten again. */
export type FoodChoice = {
  key: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Servings logged by default. */
  quantity: number;
  serving: string;
  source: "recent" | "saved";
};

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
/** Identity of a food: its name, serving and per-serving values. */
export function foodKey(data: NutritionData) {
  return [
    norm(data.name),
    norm(data.serving),
    num(data.calories),
    num(data.protein),
    num(data.carbs),
    num(data.fat),
  ].join("|");
}
/** Whether a food with the same name, serving and values is already saved. */
export const isDuplicateFood = (foods: Journal[], data: NutritionData) =>
  foods.some((f) => foodKey(f.data) === foodKey(data));

function choice(data: NutritionData, source: FoodChoice["source"]): FoodChoice {
  const q = num(data.quantity);
  return {
    key: foodKey(data),
    name: String(data.name ?? "").trim(),
    calories: num(data.calories),
    protein: num(data.protein),
    carbs: num(data.carbs),
    fat: num(data.fat),
    quantity: Number.isFinite(q) && q > 0 ? q : 1,
    serving: String(data.serving ?? "").trim(),
    source,
  };
}

/**
 * Foods to offer for logging: recently eaten foods first (most recent first,
 * each once, at the servings last eaten), then saved foods not already shown,
 * alphabetically. A search keeps the foods whose name or serving matches.
 */
export function foodChoices(
  entries: Journal[],
  foods: Journal[],
  query = "",
  recentLimit = 8,
) {
  const q = norm(query);
  const matches = (c: FoodChoice) =>
    !q || norm(c.name).includes(q) || norm(c.serving).includes(q);
  const seen = new Set<string>();
  const recent: FoodChoice[] = [];
  const latest = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  for (const e of latest) {
    // Searching looks through everything eaten before, not just the latest.
    if (!q && recent.length >= recentLimit) break;
    const c = choice(e.data, "recent");
    if (!c.name || seen.has(c.key)) continue;
    seen.add(c.key);
    if (matches(c)) recent.push(c);
  }
  const saved = foods
    .map((f) => choice(f.data, "saved"))
    .filter((c) => c.name && !seen.has(c.key) && matches(c))
    .filter((c, i, all) => all.findIndex((x) => x.key === c.key) === i)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  return { recent, saved };
}

/** A new entry from a food: its values only, in the chosen meal. */
export function entryFromFood(
  food: Pick<
    FoodChoice,
    "name" | "calories" | "protein" | "carbs" | "fat" | "serving"
  >,
  meal: string,
  quantity: number,
): NutritionData {
  return {
    name: food.name,
    meal,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    quantity,
    ...(food.serving ? { serving: food.serving } : {}),
  };
}

/** A saved food from an entry: its values and servings, without meal or notes. */
export function foodFromEntry(data: NutritionData): NutritionData {
  const food: NutritionData = {
    name: String(data.name ?? "").trim(),
    calories: num(data.calories),
    protein: num(data.protein),
    carbs: num(data.carbs),
    fat: num(data.fat),
    quantity: num(data.quantity),
  };
  const serving = String(data.serving ?? "").trim();
  if (serving) food.serving = serving;
  return food;
}

/**
 * An edited record: the original with only the changed fields replaced.
 * Fields this screen doesn't edit keep their exact values and types. Clearing
 * an optional text field that never existed doesn't add it.
 */
export function mergeEntry(
  original: NutritionData,
  changes: NutritionData,
): NutritionData {
  const merged: NutritionData = { ...original };
  for (const [key, value] of Object.entries(changes)) {
    if (value === "" && !(key in original)) continue;
    merged[key] = value;
  }
  return merged;
}

/** Device setting recorded once the lifter saves nutrition targets in You. */
export const TARGETS_SAVED = "nutritionTargetsSaved";

/**
 * Targets are the lifter's own when any differs from the onboarding defaults
 * or they have saved them explicitly. Until then they are only suggestions and
 * must not be presented as personal targets.
 */
export function targetsPersonalized(
  p: Pick<Profile, "calories" | "protein" | "carbs" | "fat">,
  savedExplicitly: boolean,
) {
  return (
    savedExplicitly ||
    p.calories !== defaults.calories ||
    p.protein !== defaults.protein ||
    p.carbs !== defaults.carbs ||
    p.fat !== defaults.fat
  );
}
