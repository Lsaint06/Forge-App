import type { NutritionData } from "./nutrition";

// The built-in food library (Phase 7B WP4A.1): a read-only, versioned
// catalog of USDA FoodData Central foods bundled with the app. Values are
// per 100 g edible portion, exactly as published. Logging a library food
// stores an independent snapshot of the chosen portion in the journal, so
// history never depends on the catalog (see the WP4A.1 plan).
//
// Phase 7.3E adds branded products from the bundled USDA Branded Foods
// catalogue through the same types and functions. A branded product may be
// measured per 100 ml instead of per 100 g; its amounts are then always in
// millilitres. Grams and millilitres are never converted into each other.

/** What a food's values are measured per 100 of. */
export type NutrientBasis = "g" | "ml";

/**
 * A documented household portion and its amount in the food's own unit:
 * grams for the generic library and per-100 g products, millilitres for
 * per-100 ml products. Exactly one of grams and ml is set.
 */
export type LibraryPortion =
  | { label: string; grams: number; ml?: undefined }
  | { label: string; ml: number; grams?: undefined };
export type LibraryFood = {
  /** Namespaced source identity, e.g. "fndds:2707154". Never a journal ID. */
  id: string;
  name: string;
  /** The original USDA description. */
  description: string;
  family: string;
  /** Per 100 g (or per 100 ml when basis is "ml"): kcal and grams. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portions: LibraryPortion[];
  /** Curation hint: everyday preparations rank higher among equals. */
  rank: number;
  /** Absent for the generic library, which is always per 100 g. */
  basis?: NutrientBasis;
  /** Branded products only: the brand as published. */
  brand?: string;
  /** Branded products only, when the product has a valid barcode (GTIN-14). */
  barcode?: string;
  /**
   * Branded products only: where the serving's name comes from, the label's
   * household text, and how many servings the whole package holds. For
   * display; amounts and values never depend on it.
   */
  servingInfo?: {
    source: string;
    household: string;
    servingsPerPackage?: number;
  };
};
type Indexed = {
  food: LibraryFood;
  nameTokens: string[];
  descTokens: string[];
  head: string;
  nameText: string;
};
export type FoodLibrary = {
  version: string;
  releases: Record<string, string>;
  foods: LibraryFood[];
  featured: LibraryFood[];
  byId: Map<string, LibraryFood>;
  index: Indexed[];
};

export const FAMILY_LABELS: Record<string, string> = {
  meat: "Meat and poultry",
  seafood: "Fish and seafood",
  eggs: "Eggs",
  dairy: "Dairy and alternatives",
  grains: "Grains and cereals",
  breads: "Breads and bakery",
  fruits: "Fruit",
  vegetables: "Vegetables",
  legumes: "Beans, legumes and plant protein",
  nuts: "Nuts and seeds",
  fats: "Oils and fats",
  beverages: "Drinks",
  protein: "Protein powders and shakes",
  prepared: "Prepared foods",
  snacks: "Snacks and sweets",
  condiments: "Sauces and condiments",
};

const SOURCE_LABELS: Record<string, string> = {
  fndds: "USDA FNDDS",
  sr: "USDA SR Legacy",
  "usda-branded": "USDA Branded Foods",
};

/** "USDA FNDDS · FDC 2707154" for a library food. */
export function sourceLabel(id: string) {
  const [source, fdcId] = id.split(":");
  return `${SOURCE_LABELS[source ?? ""] ?? "USDA"} · FDC ${fdcId}`;
}

// ---- Decoding --------------------------------------------------------------

const fail = (why: string): never => {
  throw new Error(`The food library is damaged (${why}).`);
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * The bundled catalog, checked row by row. A malformed catalog is refused
 * as a whole rather than shown with missing or invented values.
 */
export function decodeLibrary(raw: unknown): FoodLibrary {
  if (typeof raw !== "object" || raw === null) fail("not an object");
  const r = raw as Record<string, unknown>;
  if (r.formatVersion !== 1) fail(`format ${String(r.formatVersion)}`);
  const families = r.families;
  if (!Array.isArray(families)) fail("families");
  if (!Array.isArray(r.foods)) fail("foods");
  const foods: LibraryFood[] = [];
  const byId = new Map<string, LibraryFood>();
  for (const row of r.foods as unknown[]) {
    if (!Array.isArray(row) || row.length !== 10) fail("row shape");
    const [id, name, description, family, kcal, protein, carbs, fat] =
      row as unknown[];
    const portions = (row as unknown[])[8];
    const rank = (row as unknown[])[9];
    if (typeof id !== "string" || !/^(fndds|sr):\d+$/.test(id)) fail("id");
    if (byId.has(id as string)) fail(`duplicate ${String(id)}`);
    if (typeof name !== "string" || !name.trim()) fail(`name ${String(id)}`);
    if (typeof description !== "string") fail(`description ${String(id)}`);
    const familyName = (families as unknown[])[family as number];
    if (typeof familyName !== "string") fail(`family ${String(id)}`);
    if (![kcal, protein, carbs, fat].every(finite))
      fail(`values ${String(id)}`);
    if (!Array.isArray(portions)) fail(`portions ${String(id)}`);
    const parsed: LibraryPortion[] = (portions as unknown[]).map((p) => {
      if (
        !Array.isArray(p) ||
        typeof p[0] !== "string" ||
        !p[0].trim() ||
        !finite(p[1]) ||
        p[1] <= 0 ||
        p[1] > MAX_GRAMS
      )
        fail(`portion ${String(id)}`);
      return {
        label: (p as [string, number])[0],
        grams: (p as [string, number])[1],
      };
    });
    if (typeof rank !== "number" || !Number.isInteger(rank))
      fail(`rank ${String(id)}`);
    const food: LibraryFood = {
      id: id as string,
      name: name as string,
      description: (description as string) || (name as string),
      family: familyName as string,
      kcal: kcal as number,
      protein: protein as number,
      carbs: carbs as number,
      fat: fat as number,
      portions: parsed,
      rank: rank as number,
    };
    foods.push(food);
    byId.set(food.id, food);
  }
  const featured = (Array.isArray(r.featured) ? r.featured : []).map(
    (id) => byId.get(String(id)) ?? fail(`featured ${String(id)}`),
  );
  return {
    version: typeof r.catalogVersion === "string" ? r.catalogVersion : "",
    releases: (r.releases ?? {}) as Record<string, string>,
    foods,
    featured,
    byId,
    index: foods.map(indexFood),
  };
}

// ---- Search ----------------------------------------------------------------

/** Lower case, no accents, words only ("90% lean / 10%" → "90 lean 10"). */
export function normalizeText(text: string) {
  // Accents are only folded when there are any (most text is plain ASCII).
  const plain = /^[\x20-\x7e]*$/.test(text)
    ? text
    : text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return plain
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A light plural fold, the same for foods and queries ("berries" → "berry"). */
export function stem(word: string) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}
const tokens = (text: string) =>
  normalizeText(text).split(" ").filter(Boolean).map(stem);

const STOP = new Set(["a", "an", "and", "the", "of", "or", "with", "in", "on"]);

/**
 * Common names the USDA descriptions don't use. Each query word also
 * matches its listed alternatives (one word each, already stemmed).
 */
export const SYNONYMS: Record<string, string[]> = {
  garbanzo: ["chickpea"],
  chickpea: ["garbanzo"],
  courgette: ["zucchini"],
  aubergine: ["eggplant"],
  mince: ["ground"],
  minced: ["ground"],
  yoghurt: ["yogurt"],
  nonfat: ["nonfat", "skim"],
  porridge: ["oatmeal"],
  prawn: ["shrimp"],
  rocket: ["arugula"],
  coriander: ["cilantro"],
  capsicum: ["pepper"],
  spud: ["potato"],
  donut: ["doughnut"],
  doughnut: ["donut", "doughnut"],
  catsup: ["ketchup"],
  burger: ["hamburger", "cheeseburger", "burger"],
  omelette: ["omelet"],
  soda: ["soft", "soda", "cola"],
  pop: ["soft", "pop"],
  whey: ["whey"],
  pb: ["peanut"],
  steak: ["steak", "sirloin", "ribeye"],
  uncooked: ["uncooked", "raw", "dry"],
  // FNDDS names the cooking method rather than saying "cooked".
  cooked: [
    "cooked",
    "baked",
    "broiled",
    "roasted",
    "grilled",
    "boiled",
    "stewed",
    "sauteed",
    "steamed",
    "poached",
    "rotisserie",
    "fried",
  ],
  oat: ["oat", "oatmeal"],
  chips: ["chip", "crisp"],
  crisp: ["chip", "crisp"],
};

function indexFood(food: LibraryFood): Indexed {
  const nameText = normalizeText(food.name);
  const nameTokens = [
    ...new Set(nameText.split(" ").filter(Boolean).map(stem)),
  ];
  const named = new Set(nameTokens);
  return {
    food,
    nameTokens,
    // Most FNDDS names are the USDA description itself.
    descTokens:
      food.description === food.name
        ? []
        : [...new Set(tokens(food.description))].filter((t) => !named.has(t)),
    head: normalizeText(food.name.split(",")[0] ?? ""),
    nameText,
  };
}

const matches = (list: string[], alternatives: string[], exact: boolean) =>
  list.some((t) =>
    alternatives.some((a) => (exact ? t === a : t.startsWith(a))),
  );

/**
 * Library foods matching every word of the query, best first: whole-word
 * matches in the name (the word typed, then a common synonym), then word
 * starts, then the USDA description; the food named exactly what was
 * typed; the curated common foods; everyday preparations; shorter (more
 * general) names. Word order and case don't matter. Preparation words are
 * strict: "cooked" never matches "uncooked", "sweetened" never matches
 * "unsweetened".
 */
export function searchLibrary(lib: FoodLibrary, query: string, limit = 200) {
  const words = tokens(query).filter((w) => !STOP.has(w));
  if (!words.length) return [];
  const alts = words.map((w) => [...new Set([w, ...(SYNONYMS[w] ?? [])])]);
  const phrase = normalizeText(query);
  const featured = new Set(lib.featured.map((f) => f.id));
  const scored: { food: LibraryFood; score: number }[] = [];
  for (const row of lib.index) {
    let score = 0;
    let ok = true;
    for (let i = 0; i < words.length; i++) {
      const a = alts[i]!;
      if (row.nameTokens.includes(words[i]!)) score += 3;
      else if (matches(row.nameTokens, a, true)) score += 2.5;
      else if (matches(row.nameTokens, a, false)) score += 2;
      else if (matches(row.descTokens, a, false)) score += 0.5;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (row.head === phrase) score += 3.5;
    else if (row.nameText.startsWith(phrase)) score += 1.5;
    // A curated common food leads when the query names what it is.
    if (
      featured.has(row.food.id) &&
      alts.some((a) => a.some((w) => row.nameTokens[0]?.startsWith(w)))
    )
      score += 3;
    score += row.food.rank * 0.8 - row.nameTokens.length * 0.15;
    scored.push({ food: row.food, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.food.name.length - b.food.name.length ||
      (a.food.id < b.food.id ? -1 : 1),
  );
  return scored.slice(0, limit).map((s) => s.food);
}

// ---- Portions --------------------------------------------------------------

/** Typed grams: 0.1 g to 5 kg. */
export const MIN_GRAMS = 0.1;
export const MAX_GRAMS = 5000;
/** Typed millilitres (foods measured per 100 ml): 0.1 ml to 5 l. */
export const MIN_ML = 0.1;
export const MAX_ML = 5000;
/** Household portions: 0.01 to 100 of the documented portion. */
export const MIN_COUNT = 0.01;
export const MAX_COUNT = 100;
/** The amount logged by + (and offered first): 100 g. */
export const DEFAULT_GRAMS = 100;
/** The millilitres offered first for a food measured per 100 ml. */
export const DEFAULT_ML = 100;

export type PortionChoice =
  | { kind: "grams"; grams: number }
  | { kind: "ml"; ml: number }
  | { kind: "portion"; index: number; count: number };

/** The unit a food is measured in: grams unless its source says millilitres. */
export const basisOf = (food: Pick<LibraryFood, "basis">): NutrientBasis =>
  food.basis ?? "g";

/** A portion's amount, in the unit its food is measured in. */
export const portionAmount = (p: LibraryPortion) => p.ml ?? p.grams;

export type Values = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/**
 * Values for an amount in the food's own unit: value per 100 × amount / 100
 * (grams for foods per 100 g, millilitres for foods per 100 ml; never
 * converted). Only binary floating-point noise is removed (to a millionth),
 * so 0.28 × 150 / 100 is stored as 0.42, not 0.42000000000000004; nothing
 * meaningful is rounded.
 */
export function valuesForAmount(food: LibraryFood, amount: number): Values {
  const at = (per100: number) => Math.round(per100 * amount * 1e4) / 1e6;
  return {
    calories: at(food.kcal),
    protein: at(food.protein),
    carbs: at(food.carbs),
    fat: at(food.fat),
  };
}

/** Values for an edible weight of a food measured per 100 g. */
export const valuesForGrams = (food: LibraryFood, grams: number): Values =>
  valuesForAmount(food, grams);

const gramsText = (g: number) => `${String(Math.round(g * 100) / 100)} g`;
const mlText = (ml: number) => `${String(Math.round(ml * 100) / 100)} ml`;

/** "150 g" or "240 ml": an amount in a food's unit. */
export const amountText = (n: number, unit: NutrientBasis) =>
  unit === "ml" ? mlText(n) : gramsText(n);

/** "1 cup (158 g)" or "1 bottle (340 ml)" for a household portion. */
export const portionLabel = (p: LibraryPortion) =>
  p.ml !== undefined
    ? `${p.label} (${mlText(p.ml)})`
    : `${p.label} (${gramsText(p.grams)})`;

/**
 * One serving of a choice: its description and amount (grams for foods per
 * 100 g, millilitres for foods per 100 ml), and how many were eaten.
 */
export type Serving =
  | { serving: string; grams: number; quantity: number }
  | { serving: string; ml: number; quantity: number };

/** The amount of one serving, in its food's unit. */
export const servingAmount = (s: Serving) => ("ml" in s ? s.ml : s.grams);

/**
 * What one serving of a choice is: its description and amount, and how many
 * of them were eaten. A typed amount is one serving of that amount; a
 * household portion keeps its documented amount and counts portions.
 */
export function servingOf(food: LibraryFood, choice: PortionChoice): Serving {
  if (choice.kind === "grams")
    return {
      serving: gramsText(choice.grams),
      grams: choice.grams,
      quantity: 1,
    };
  if (choice.kind === "ml")
    return { serving: mlText(choice.ml), ml: choice.ml, quantity: 1 };
  const p = food.portions[choice.index];
  if (!p) throw new Error("Unknown portion");
  return p.ml !== undefined
    ? { serving: portionLabel(p), ml: p.ml, quantity: choice.count }
    : { serving: portionLabel(p), grams: p.grams, quantity: choice.count };
}

/** Total amount of a choice, in the food's unit (g or ml). */
export function totalAmount(food: LibraryFood, choice: PortionChoice) {
  const s = servingOf(food, choice);
  return servingAmount(s) * s.quantity;
}

/** Total edible grams of a choice (foods measured per 100 g only). */
export function totalGrams(food: LibraryFood, choice: PortionChoice) {
  const s = servingOf(food, choice);
  return ("grams" in s ? s.grams : Number.NaN) * s.quantity;
}

/** Why a choice can't be logged, or undefined when it can. */
export function choiceError(food: LibraryFood, choice: PortionChoice) {
  const unit = basisOf(food);
  if (choice.kind === "grams") {
    if (unit !== "g") return "Measure this food in millilitres";
    if (
      !Number.isFinite(choice.grams) ||
      choice.grams < MIN_GRAMS ||
      choice.grams > MAX_GRAMS
    )
      return `Enter ${MIN_GRAMS} to ${MAX_GRAMS} g`;
  } else if (choice.kind === "ml") {
    if (unit !== "ml") return "Measure this food in grams";
    if (!Number.isFinite(choice.ml) || choice.ml < MIN_ML || choice.ml > MAX_ML)
      return `Enter ${MIN_ML} to ${MAX_ML} ml`;
  } else {
    const p = food.portions[choice.index];
    if (
      !p ||
      !Number.isFinite(choice.count) ||
      choice.count < MIN_COUNT ||
      choice.count > MAX_COUNT
    )
      return `Enter ${MIN_COUNT} to ${MAX_COUNT} portions`;
    if ((p.ml !== undefined) !== (unit === "ml"))
      return "This portion is not in the food's unit";
  }
  const v = valuesForAmount(food, servingAmount(servingOf(food, choice)));
  // The journal accepts at most 20,000 per value for one serving.
  if (Object.values(v).some((n) => n > 20000))
    return "That's more than one entry can hold. Log it in smaller parts.";
  return undefined;
}

/** Keys a library snapshot adds to a journal entry or saved food. */
export const SOURCE_KEYS = [
  "sourceId",
  "sourceCatalog",
  "sourceGrams",
  "sourceMl",
  "sourceBarcode",
  "sourceBrand",
  "sourceEdited",
] as const;

/**
 * A journal snapshot of a library food: the values of one serving of the
 * chosen portion, how many servings, and where they came from. The entry
 * keeps these values for good; it never looks the catalog up again. A
 * branded product also records its brand and barcode when it has them, and
 * one serving's amount in millilitres when it is measured per 100 ml.
 */
export function entryFromLibrary(
  food: LibraryFood,
  choice: PortionChoice,
  catalog: string,
  meal?: string,
): NutritionData {
  const s = servingOf(food, choice);
  const v = valuesForAmount(food, servingAmount(s));
  return {
    name: food.name,
    ...(meal === undefined ? {} : { meal }),
    calories: v.calories,
    protein: v.protein,
    carbs: v.carbs,
    fat: v.fat,
    quantity: s.quantity,
    serving: s.serving,
    sourceId: food.id,
    sourceCatalog: catalog,
    ...("ml" in s ? { sourceMl: s.ml } : { sourceGrams: s.grams }),
    ...(food.brand ? { sourceBrand: food.brand } : {}),
    ...(food.barcode ? { sourceBarcode: food.barcode } : {}),
  };
}
