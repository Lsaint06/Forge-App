// Inclusion rules for the branded-food catalogue (Phase 7.3E). Pure: one
// USDA Branded Foods record in, either the reason it is excluded or the
// normalised product out. Each excluded record gets exactly one reason (the
// first rule it fails), so the build report adds up. Nothing is invented: a
// missing nutrient is never zero, and units are never converted.
import { gtin14, gtinProblem } from "../../src/domain/barcode";
import { catalogKey } from "../../src/domain/branded";

/** Exclusion reasons, in the order the rules are applied. */
export const REASONS = {
  market: "market outside the US",
  euromonitor:
    "Euromonitor pilot: per-serving values in per-100 fields (validated by barcode cross-check)",
  discontinued: "discontinued by the data provider",
  noName: "no product name",
  noBrand: "no brand or brand owner",
  unit: "serving not by weight or volume (mg, IU, mcg)",
  noServing: "no usable serving size",
  bigServing: "implausible serving size (> 2 kg / 2 l)",
  noEnergy: "no energy value",
  noMacro: "missing protein, carbs or fat",
  negative: "negative value",
  impossible: "impossible per-100 value",
  energy: "energy contradicts protein, carbs and fat",
  prepared: "serving describes the food as prepared",
} as const;
export type Reason = keyof typeof REASONS;

/** Flags on accepted products: kept, but noted in the report. */
export type Flag =
  | "energy-loose"
  | "alcohol-energy"
  | "household-gs1-code"
  | "household-empty"
  | "household-none"
  | "household-malformed"
  | "barcode-missing"
  | "barcode-non-digit"
  | "barcode-bad-length"
  | "barcode-bad-check-digit"
  | "name-repeated-segment"
  | "serving-float-noise";

export type Accepted = {
  fdcId: number;
  gtin: string | null;
  name: string;
  brand: string;
  category: string;
  basis: "g" | "ml";
  serving: number;
  household: string;
  /** The household text as published (for serving recovery). */
  householdRaw: string;
  /** The package size as published ("1.15 OZ/32 G"). */
  packageText: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** yyyymmdd; 0 when absent. */
  published: number;
  modified: number;
  flags: Flag[];
};

const UNITS: Record<string, "g" | "ml"> = {
  g: "g",
  grm: "g",
  gm: "g",
  ml: "ml",
  mlt: "ml",
};
const ALCOHOL = /alcohol|beer|wine|spirit|liquor|cocktail/i;
const PREPARED =
  /\b(prepared|as served|reconstituted|made with|with [^)]*milk)\b/i;
// GS1 / UN-ECE unit codes in household text, as the words on a label.
const CODES: Record<string, string> = {
  ONZ: "oz",
  OZA: "fl oz",
  GRM: "g",
  MLT: "ml",
  H87: "piece",
  EA: "each",
  LTR: "l",
};
const ENERGY = 1008;
const PROTEIN = 1003;
const FAT = 1004;
const CARBS = 1005;

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "4/26/2020" or "2020-04-26" → 20200426; 0 when absent or unreadable. */
export function ymd(value: unknown) {
  const s = str(value);
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m)
    return Number(`${m[3]}${m[1]!.padStart(2, "0")}${m[2]!.padStart(2, "0")}`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : 0;
}

/** A name with repeated comma segments removed ("A, B, A" → "A, B"). */
export function cleanName(name: string) {
  const seen = new Set<string>();
  return name
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const k = s.toLowerCase();
      if (!s || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}

/** Household serving text as printed, GS1 codes in words; "" when unusable. */
export function household(raw: unknown): { text: string; flag?: Flag } {
  const h = str(raw).replace(/\s+/g, " ");
  if (!h) return { text: "", flag: "household-empty" };
  if (/^none$/i.test(h)) return { text: "", flag: "household-none" };
  const open = (h.match(/\(/g) ?? []).length;
  const close = (h.match(/\)/g) ?? []).length;
  if (open !== close || h.includes("|"))
    return { text: "", flag: "household-malformed" };
  let coded = false;
  const text = h.replace(
    /\b(\d*\.?\d+)\s*(ONZ|OZA|GRM|MLT|H87|EA|LTR)\b/g,
    (_, n: string, code: string) => {
      coded = true;
      return `${n} ${CODES[code]}`;
    },
  );
  return coded ? { text, flag: "household-gs1-code" } : { text };
}

function nutrients(f: Rec) {
  const found = new Map<number, number>();
  const list = Array.isArray(f.foodNutrients) ? f.foodNutrients : [];
  for (const n of list as Rec[]) {
    const id = (n?.nutrient as Rec | undefined)?.id;
    if (typeof id === "number" && typeof n.amount === "number")
      found.set(id, n.amount);
  }
  return {
    kcal: found.get(ENERGY),
    protein: found.get(PROTEIN),
    carbs: found.get(CARBS),
    fat: found.get(FAT),
  };
}

/** One record: the reason it is excluded, or the product to include. */
export function judge(f: Rec): { reason: Reason } | { product: Accepted } {
  const country = str(f.marketCountry);
  if (country !== "United States" && country !== "US")
    return { reason: "market" };
  if (f.dataSource === "Euromonitor") return { reason: "euromonitor" };
  if (str(f.discontinuedDate)) return { reason: "discontinued" };
  const raw = str(f.description);
  if (!raw) return { reason: "noName" };
  const brand = str(f.brandName) || str(f.brandOwner);
  if (!brand) return { reason: "noBrand" };
  const basis = UNITS[str(f.servingSizeUnit).toLowerCase()];
  if (!basis) return { reason: "unit" };
  const size = Number(f.servingSize);
  if (!Number.isFinite(size) || size <= 0) return { reason: "noServing" };
  if (size > 2000) return { reason: "bigServing" };
  const { kcal, protein, carbs, fat } = nutrients(f);
  if (kcal === undefined) return { reason: "noEnergy" };
  if (protein === undefined || carbs === undefined || fat === undefined)
    return { reason: "noMacro" };
  if ([kcal, protein, carbs, fat].some((v) => v < 0))
    return { reason: "negative" };
  if (kcal > 902 || protein + carbs + fat > 105)
    return { reason: "impossible" };
  const flags: Flag[] = [];
  const estimate = 4 * protein + 4 * carbs + 9 * fat;
  const alcohol = ALCOHOL.test(str(f.brandedFoodCategory));
  if (Math.abs(kcal - estimate) > 20) {
    const ratio = estimate > 0 ? kcal / estimate : Infinity;
    if (ratio < 0.5 || (ratio > 2 && !alcohol)) return { reason: "energy" };
    if (ratio < 0.8 || ratio > 1.2)
      flags.push(alcohol && ratio > 1.2 ? "alcohol-energy" : "energy-loose");
  }
  if (PREPARED.test(str(f.householdServingFullText)))
    return { reason: "prepared" };
  const house = household(f.householdServingFullText);
  if (house.flag) flags.push(house.flag);
  const gtin = gtin14(str(f.gtinUpc));
  if (!gtin) flags.push(`barcode-${gtinProblem(f.gtinUpc)}` as Flag);
  const name = cleanName(raw);
  if (name !== raw) flags.push("name-repeated-segment");
  if (Math.abs(size * 100 - Math.round(size * 100)) > 1e-6)
    flags.push("serving-float-noise");
  return {
    product: {
      fdcId: Number(f.fdcId),
      gtin,
      name,
      brand,
      category: str(f.brandedFoodCategory),
      basis,
      serving: Math.round(size * 100) / 100,
      household: house.text,
      householdRaw: str(f.householdServingFullText),
      packageText: str(f.packageWeight),
      kcal,
      protein,
      carbs,
      fat,
      published: ymd(f.publicationDate),
      modified: ymd(f.modifiedDate),
      flags,
    },
  };
}

/** True when a is a newer label of the same product than b. */
export function newer(a: Accepted, b: Accepted) {
  if (a.published !== b.published) return a.published > b.published;
  if (a.modified !== b.modified) return a.modified > b.modified;
  return a.fdcId > b.fdcId;
}

/** Whether two versions' values agree within label rounding. */
export function sameValues(a: Accepted, b: Accepted) {
  const near = (x: number, y: number, floor: number) =>
    Math.abs(x - y) <= Math.max(floor, 0.05 * Math.max(x, y));
  return (
    near(a.kcal, b.kcal, 1) &&
    near(a.protein, b.protein, 0.5) &&
    near(a.carbs, b.carbs, 0.5) &&
    near(a.fat, b.fat, 0.5)
  );
}

export type Superseded = {
  gtin: string | null;
  kept: number;
  superseded: number;
  conflict: boolean;
};

/**
 * One product per barcode (the newest label wins) and one per exact
 * duplicate among products without a valid barcode. Products are never
 * merged by similar names. Returns every superseded record with its winner.
 */
export function deduplicate(products: Accepted[]) {
  const byGtin = new Map<string, Accepted>();
  const loose = new Map<string, Accepted>();
  const superseded: Superseded[] = [];
  const keep = (
    map: Map<string, Accepted>,
    k: string,
    p: Accepted,
    gtin: string | null,
  ) => {
    const current = map.get(k);
    if (!current) {
      map.set(k, p);
      return;
    }
    const [win, lose] = newer(p, current) ? [p, current] : [current, p];
    superseded.push({
      gtin,
      kept: win.fdcId,
      superseded: lose.fdcId,
      conflict: !sameValues(win, lose),
    });
    map.set(k, win);
  };
  for (const p of products) {
    if (p.gtin) keep(byGtin, p.gtin, p, p.gtin);
    else
      keep(
        loose,
        [
          p.brand.toLowerCase(),
          p.name.toLowerCase(),
          p.serving,
          p.basis,
          p.kcal,
          p.protein,
          p.carbs,
          p.fat,
        ].join("|"),
        p,
        null,
      );
  }
  superseded.sort((a, b) => a.superseded - b.superseded || a.kept - b.kept);
  return { products: [...byGtin.values(), ...loose.values()], superseded };
}

const wordCount = (s: string) =>
  catalogKey(s).split(" ").filter(Boolean).length;

/**
 * The static order (row ids): broad searches read products in this order,
 * so the most generally useful listings come first without scoring every
 * match. A usable household serving first, then fewer words in the name,
 * then the newest label, then the FDC ID (a total order: deterministic).
 */
export function staticOrder(a: Accepted, b: Accepted) {
  return (
    (b.household ? 1 : 0) - (a.household ? 1 : 0) ||
    wordCount(a.name) - wordCount(b.name) ||
    b.published - a.published ||
    a.fdcId - b.fdcId
  );
}
