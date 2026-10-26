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
  /** Where a food from the built-in library came from (copied along). */
  meta?: SourceMeta;
};

/**
 * Provenance of a food logged from the built-in library or the branded
 * catalogue: its catalog ID and version, the amount of one serving (grams,
 * or millilitres for a product measured per 100 ml), the brand and barcode
 * of a branded product, and whether the values were edited since. Only
 * well-formed keys are read; anything else is ignored.
 */
export type SourceMeta = {
  sourceId?: string;
  sourceCatalog?: string;
  sourceGrams?: number;
  sourceMl?: number;
  sourceBarcode?: string;
  sourceBrand?: string;
  sourceEdited?: boolean;
};
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
export function sourceMeta(data: NutritionData): SourceMeta | undefined {
  if (typeof data.sourceId !== "string" || !data.sourceId) return undefined;
  const meta: SourceMeta = { sourceId: data.sourceId };
  if (typeof data.sourceCatalog === "string")
    meta.sourceCatalog = data.sourceCatalog;
  if (positive(data.sourceGrams)) meta.sourceGrams = data.sourceGrams;
  if (positive(data.sourceMl)) meta.sourceMl = data.sourceMl;
  if (
    typeof data.sourceBarcode === "string" &&
    /^\d{14}$/.test(data.sourceBarcode)
  )
    meta.sourceBarcode = data.sourceBarcode;
  if (typeof data.sourceBrand === "string" && data.sourceBrand.trim())
    meta.sourceBrand = data.sourceBrand;
  if (data.sourceEdited === true) meta.sourceEdited = true;
  return meta;
}

/**
 * Provenance after an edit: changed values mark the food as edited (it is no
 * longer the library's values), and a changed serving drops the amount that
 * described the old one. Records without provenance are returned unchanged.
 */
export function withSourceEdits(
  merged: NutritionData,
  changes: NutritionData,
): NutritionData {
  if (!sourceMeta(merged)) return merged;
  const next = { ...merged };
  if (["name", "calories", "protein", "carbs", "fat"].some((k) => k in changes))
    next.sourceEdited = true;
  if ("serving" in changes) {
    delete next.sourceGrams;
    delete next.sourceMl;
  }
  return next;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
/**
 * Identity of a food: its name, serving and per-serving values, and its
 * brand when it has one (two brands' products can share a name and values).
 */
export function foodKey(data: NutritionData) {
  const key = [
    norm(data.name),
    norm(data.serving),
    num(data.calories),
    num(data.protein),
    num(data.carbs),
    num(data.fat),
  ].join("|");
  const brand =
    typeof data.sourceBrand === "string" ? norm(data.sourceBrand) : "";
  return brand ? `${key}|${brand}` : key;
}
/** Whether a food with the same name, serving and values is already saved. */
export const isDuplicateFood = (foods: Journal[], data: NutritionData) =>
  foods.some((f) => foodKey(f.data) === foodKey(data));

function choice(data: NutritionData, source: FoodChoice["source"]): FoodChoice {
  const q = num(data.quantity);
  const meta = sourceMeta(data);
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
    ...(meta ? { meta } : {}),
  };
}

/**
 * Foods to offer for logging: recently eaten foods first (most recent first,
 * each once, at the servings last eaten), then saved foods not already shown,
 * alphabetically. A search keeps the foods whose name or serving contains
 * every word typed, in any order.
 */
export function foodChoices(
  entries: Journal[],
  foods: Journal[],
  query = "",
  recentLimit = 8,
) {
  const q = norm(query);
  // Every word typed must start a word of the name, serving or brand, in
  // any order: "oats dry" finds "Oats, … dry", and "cooked" never finds
  // "uncooked".
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  const matches = (c: FoodChoice) => {
    const text =
      `${norm(c.name)} ${norm(c.serving)} ${norm(c.meta?.sourceBrand)}`
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    return words.every((w) => text.some((t) => t.startsWith(w)));
  };
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
    "name" | "calories" | "protein" | "carbs" | "fat" | "serving" | "meta"
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
    ...food.meta,
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
  return { ...food, ...sourceMeta(data) };
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
