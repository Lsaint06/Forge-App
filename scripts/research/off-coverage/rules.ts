// Phase 7.3F.2 M3.1 research prototype (NOT shipped): quality rules for
// Open Food Facts candidate records. Pure: one OFF product (JSONL record) in,
// a verdict out: accept, review or reject, with every reason that applied.
// Mirrors scripts/branded-catalog/rules.ts where the two sources overlap and
// adds checks USDA records don't need (evidence, OFF's own quality tags,
// category plausibility). Nothing is invented: a missing nutrient is never
// zero, grams and millilitres are never converted, and values are taken from
// ONE nutrition input set (never blended across sets or sources).
import { gtin14 } from "../../../src/domain/barcode";
import { readHousehold } from "../../../src/domain/servings";

export const RULES_VERSION = "off-research-2";

export type Basis = "g" | "ml";
export type Verdict = "accept" | "review" | "reject";
type Rec = Record<string, unknown>;

/** Where the core values came from. */
export type ValueSource =
  | "manufacturer" // OFF producer platform / manufacturer input set
  | "packaging" // read from the label (new schema)
  | "legacy"; // legacy `nutriments` *_100g fields

export type Candidate = {
  gtin: string;
  code: string;
  name: string;
  brand: string;
  basis: Basis;
  /** One serving in `basis` units, when the record states one. */
  serving?: number;
  servingLabel: string;
  servingText: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  categories: string[];
  valueSource: ValueSource;
  photo: boolean;
  producer: boolean;
  creator: string;
  modified: number;
  scans: number;
};

export type Judgement = {
  verdict: Verdict;
  /** Every reason that applied (rejects first). Empty for accept. */
  reasons: string[];
  candidate?: Candidate;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const KJ_PER_KCAL = 4.184;

/** UPC number systems 2 and 4 (in-store, variable weight); EAN 020-029. */
export function restrictedGtin(g: string) {
  return g.startsWith("002") || g.startsWith("004") || g.startsWith("02");
}
/** US/Canada GS1 prefixes (UPC-A and GS1 US 100-139), not zero-padded EAN-8. */
export const usCanadaGtin = (g: string) =>
  (g.startsWith("00") || g.startsWith("01")) && !g.startsWith("000000");

/**
 * OFF data-quality ERRORS on the core macros: values untrustworthy. Energy
 * consistency is judged by the 4/4/9 check below (OFF's kcal computation
 * flags correct US labels), except kcal/kJ swaps.
 */
const CORE_ERROR =
  /(value-total-over-|value-over-\d+-(energy|proteins|carbohydrates|fat|sugars|saturated-fat)$|energy-value-in-kcal-greater-than-in-kj$|energy-value-in-kcal-and-kj-are-reversed$|saturated-fat-greater-than-fat$|sugars-plus-starch-greater-than-carbohydrates$)/;
/** OFF's energy cross-checks that the 4/4/9 check replaces (ignored). */
const ENERGY_CHECK =
  /energy-value-in-k(cal|j)-(may-not|does-not)-match-value-(computed-from-other-nutrients|in-kj)$/;
/**
 * OFF data-quality WARNINGS that put the core values in doubt (curated from
 * the tags actually present on US records, measured 2026-10-26). OFF's
 * "very high/low for category" checks are its own category statistics; they
 * catch per-serving values typed into per-100 fields. v2 drops OFF's
 * "kcal does not match value computed from other nutrients / value in kJ":
 * it flags correct US labels (375 kcal oats at P 12.5 C 67.5 F 6.25 is 376
 * by 4/4/9; US labels print no kJ), and the 4/4/9 check below, the same as
 * the USDA build's, already guards energy on every record.
 */
const REVIEW_WARNINGS = [
  /very-(high|low)-for-category-(energy|proteins|carbohydrates|fat|sugars)$/,
  /energy-value-in-kcal-greater-than-in-kj$/,
  /energy-value-in-kcal-and-kj-are-reversed$/,
  /3-or-more-values-are-identical$/,
  /nutrition-value-over-105-(energy|proteins|carbohydrates|fat|sugars|saturated-fat)$/,
  /nutrition-value-over-3911-energy$/,
  /nutrition-value-total-over-105$/,
  /^en:serving-quantity-over-product-quantity$/,
  /^en:serving-quantity-under-1g$/,
  /^en:serving-quantity-over-500g$/,
  /serving-quantity-is-not-recognized$/,
];

/**
 * Category plausibility, per 100 (basis unit), from OFF category tags. Only
 * categories whose energy range is physically narrow; products that are
 * legitimately energy-dense (syrups, concentrates, powders, mixes) are
 * exempt. Out of band means REVIEW, never an automatic reject.
 */
type Band = {
  name: string;
  tags: RegExp;
  kcal: [number, number];
  liquid?: boolean;
};
export const BANDS: Band[] = [
  {
    name: "plain water",
    tags: /^en:(waters|spring-waters|mineral-waters|sparkling-waters|still-waters)$/,
    kcal: [0, 5],
    liquid: true,
  },
  {
    name: "diet soda",
    tags: /^en:(diet-sodas|diet-colas|zero-sugar-sodas|light-sodas)$/,
    kcal: [0, 10],
    liquid: true,
  },
  {
    name: "soda",
    tags: /^en:(sodas|colas|carbonated-soft-drinks|soft-drinks|lemonade)$/,
    kcal: [0, 65],
    liquid: true,
  },
  {
    name: "energy drink",
    tags: /^en:energy-drinks$/,
    kcal: [0, 75],
    liquid: true,
  },
  {
    name: "fruit juice",
    tags: /^en:(fruit-juices|orange-juices|apple-juices|juices)$/,
    kcal: [0, 85],
    liquid: true,
  },
  {
    name: "milk",
    tags: /^en:(milks|cow-milks|skimmed-milks|whole-milks|semi-skimmed-milks)$/,
    kcal: [0, 100],
    liquid: true,
  },
  {
    name: "vegetable oil",
    tags: /^en:(vegetable-oils|olive-oils|extra-virgin-olive-oils|sunflower-oils|canola-oils|coconut-oils)$/,
    kcal: [600, 902],
  },
  { name: "protein bar", tags: /^en:protein-bars$/, kcal: [150, 600] },
  {
    name: "potato chips",
    tags: /^en:(potato-crisps|potato-chips)$/,
    kcal: [350, 650],
  },
];
const DENSE =
  /^en:(syrups|beverage-preparations|drink-mixes|powdered-drinks|concentrates|concentrated-fruit-juices|powdered-milks|condensed-milks|evaporated-milks|instant-beverages|dried-products-to-be-rehydrated|protein-powders|energy-shots|cooking-sprays)$/;

/** The band a product's categories fall in, most specific first. */
export function bandFor(categories: string[]) {
  if (categories.some((c) => DENSE.test(c))) return undefined;
  return BANDS.find((b) => categories.some((c) => b.tags.test(c)));
}

/** A drink (by category), excluding preparations, powders and mixes. */
export const isDrink = (categories: string[]) =>
  categories.includes("en:beverages") && !categories.some((c) => DENSE.test(c));

type Core = {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  basis?: Basis;
  serving?: number;
  servingUnit?: string;
  source: ValueSource;
  basisConflict?: boolean;
  preparedOnly?: boolean;
};

/**
 * The core values per 100 from ONE input set: a manufacturer set, else a
 * packaging set (as sold), per 100 when the label gives it, else per serving
 * scaled by that set's own serving (same unit only). Falls back to the
 * legacy *_100g fields. Never mixes sets; estimates are never used.
 */
export function coreValues(p: Rec): Core {
  const sets = ((p.nutrition as Rec | undefined)?.input_sets ?? []) as Rec[];
  const labelled = (s: Rec) =>
    s.source === "manufacturer" || s.source === "packaging";
  const usable = sets.filter(
    (s) =>
      labelled(s) &&
      s.preparation === "as_sold" &&
      (s.per_unit === "g" || s.per_unit === "ml"),
  );
  const rank = (s: Rec) =>
    (s.source === "manufacturer" ? 0 : 2) + (s.per === "serving" ? 1 : 0);
  const set = [...usable].sort((a, b) => rank(a) - rank(b))[0];
  const servingQty = num(p.serving_quantity);
  const servingUnit = str(p.serving_quantity_unit).toLowerCase();
  if (set) {
    const unit = set.per_unit as Basis;
    const nutrients = (set.nutrients ?? {}) as Record<string, Rec>;
    const v = (k: string) => num(nutrients[k]?.value);
    const perQty = num(set.per_quantity);
    const per100 = set.per === "100g" || set.per === "100ml";
    const factor = per100 ? 1 : perQty && perQty > 0 ? 100 / perQty : undefined;
    const kj = v("energy-kj");
    const kcalRaw =
      v("energy-kcal") ?? (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
    const scale = (x?: number) =>
      x === undefined || factor === undefined ? undefined : x * factor;
    return {
      kcal: scale(kcalRaw),
      protein: scale(v("proteins")),
      carbs: scale(v("carbohydrates")),
      fat: scale(v("fat")),
      basis: unit,
      serving: set.per === "serving" ? perQty : servingQty,
      servingUnit: set.per === "serving" ? unit : servingUnit,
      source: set.source === "manufacturer" ? "manufacturer" : "packaging",
    };
  }
  const preparedOnly = sets.some(
    (s) => labelled(s) && s.preparation === "prepared",
  );
  const n = (p.nutriments ?? {}) as Rec;
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
  const productUnit = str(p.product_quantity_unit).toLowerCase();
  const units = [servingUnit, productUnit].filter(
    (u) => u === "g" || u === "ml",
  ) as Basis[];
  const kcal =
    num(n["energy-kcal_100g"]) ??
    (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
  return {
    kcal,
    protein: num(n.proteins_100g),
    carbs: num(n.carbohydrates_100g),
    fat: num(n.fat_100g),
    basis: units[0],
    basisConflict: units.length === 2 && units[0] !== units[1],
    serving: servingQty,
    servingUnit,
    source: "legacy",
    // Only prepared label values and no as-sold ones at all.
    preparedOnly: preparedOnly && kcal === undefined,
  };
}

const hasNutritionPhoto = (p: Rec) => {
  const images = (p.images ?? {}) as Rec;
  if (Object.keys(images).some((k) => k.startsWith("nutrition"))) return true;
  const selected = ((images.selected as Rec | undefined)?.nutrition ??
    {}) as Rec;
  return Object.keys(selected).length > 0;
};
const isProducer = (p: Rec) =>
  str(p.owner).startsWith("org-") || /producer/i.test(str(p.data_sources));

/** The first brand as published ("Dr Pepper, Keurig" → "Dr Pepper"). */
const firstBrand = (p: Rec) =>
  str(p.brands).split(",")[0]!.trim() || str(p.brand_owner);

/**
 * One OFF record against the policy. `usda` is the record's status in the
 * pinned USDA release ("catalog", "excluded:<reason>" or undefined).
 */
export function judgeOff(p: Rec, usda?: string): Judgement {
  const reject: string[] = [];
  const review: string[] = [];
  const code = str(p.code);
  const gtin = gtin14(code);
  if (!gtin)
    return { verdict: "reject", reasons: ["invalid GTIN (never repaired)"] };
  if (restrictedGtin(gtin))
    reject.push("restricted-circulation GTIN (in-store / variable weight)");
  if (p.product_type !== undefined && p.product_type !== "food")
    reject.push("not a food product");
  if (p.obsolete === true || p.obsolete === "on")
    reject.push("discontinued (marked obsolete)");
  const name = str(p.product_name_en) || str(p.product_name);
  if (!name) reject.push("no product name");
  else if (name.length > 200 || /^\d+$/.test(name))
    reject.push("unusable product name");
  const brand = firstBrand(p);
  if (!brand) reject.push("no brand");
  if (p.no_nutrition_data === "on")
    reject.push("marked as having no nutrition facts");
  const core = coreValues(p);
  if (core.preparedOnly) reject.push("values only as prepared");
  const { kcal, protein, carbs, fat } = core;
  if (kcal === undefined) reject.push("no energy value");
  if (protein === undefined || carbs === undefined || fat === undefined)
    reject.push("missing protein, carbs or fat");
  const errors = ((p.data_quality_errors_tags ?? []) as string[]).filter((t) =>
    CORE_ERROR.test(t),
  );
  if (errors.length) reject.push(`OFF nutrition error: ${errors[0]}`);
  if (
    kcal !== undefined &&
    protein !== undefined &&
    carbs !== undefined &&
    fat !== undefined
  ) {
    if ([kcal, protein, carbs, fat].some((v) => v < 0))
      reject.push("negative value");
    else {
      // Dense liquids (syrups) can hold more than 100 g per 100 ml.
      const macroCap = core.basis === "ml" ? 150 : 105;
      if (kcal > 902 || protein + carbs + fat > macroCap)
        reject.push("impossible per-100 value");
      const estimate = 4 * protein + 4 * carbs + 9 * fat;
      if (Math.abs(kcal - estimate) > 20) {
        const ratio = estimate > 0 ? kcal / estimate : Infinity;
        if (ratio < 0.5 || ratio > 2)
          reject.push("energy contradicts protein, carbs and fat");
        else if (ratio < 0.8 || ratio > 1.2)
          review.push("energy loosely matches macros");
      }
    }
  }
  // Basis and serving: stated, in the same unit, never converted.
  if (!core.basis) review.push("nutrition basis (g or ml) not stated");
  if (core.basisConflict)
    review.push("serving and package units disagree (g vs ml)");
  const categories = ((p.categories_tags ?? []) as string[]).filter(
    (c) => c !== "en:null",
  );
  if (core.basis === "g" && isDrink(categories))
    review.push("drink measured by weight");
  let serving: number | undefined;
  if (core.serving === undefined || !(core.serving > 0))
    review.push("no serving size");
  else if (core.servingUnit !== "g" && core.servingUnit !== "ml")
    // Older records derived serving_quantity from the text (ml read as g).
    review.push("serving unit not stated");
  else if (core.servingUnit !== core.basis)
    review.push("serving unit differs from nutrition basis");
  else if (core.serving > 2000)
    reject.push("implausible serving size (> 2 kg / 2 l)");
  else serving = Math.round(core.serving * 100) / 100;
  // OFF's own warnings and the category bands.
  const warnings = ((p.data_quality_warnings_tags ?? []) as string[]).filter(
    (t) => REVIEW_WARNINGS.some((r) => r.test(t)),
  );
  if (warnings.length) review.push(`OFF warning: ${warnings[0]}`);
  const otherErrors = ((p.data_quality_errors_tags ?? []) as string[]).filter(
    (t) => !CORE_ERROR.test(t) && !ENERGY_CHECK.test(t),
  );
  if (otherErrors.length)
    review.push(`OFF error (non-core): ${otherErrors[0]}`);
  const band = bandFor(categories);
  if (
    band &&
    kcal !== undefined &&
    (kcal < band.kcal[0] || kcal > band.kcal[1])
  )
    review.push(
      `energy outside the ${band.name} range (${band.kcal[0]}-${band.kcal[1]} kcal/100)`,
    );
  // Evidence and provenance.
  const photo = hasNutritionPhoto(p);
  const producer = isProducer(p) || core.source === "manufacturer";
  if (!photo && !producer)
    review.push("no nutrition-label photo or manufacturer source");
  const creator = str(p.creator);
  if (creator === "usda-ndb-import") review.push("2017 USDA import copy");
  // Cross-source: USDA's verdict on the same barcode stands.
  if (usda?.startsWith("excluded"))
    review.push(`USDA excluded this barcode (${usda.slice(9)})`);

  if (reject.length)
    return { verdict: "reject", reasons: [...reject, ...review] };
  const servingText = str(p.serving_size);
  let servingLabel = "1 serving";
  if (serving !== undefined && core.basis) {
    const h = readHousehold(servingText, servingText, serving, core.basis);
    if (
      (h.kind === "named" || h.kind === "measure" || h.kind === "about") &&
      h.name
    )
      servingLabel = h.name;
  }
  const candidate: Candidate = {
    gtin,
    code,
    name,
    brand,
    basis: core.basis ?? "g",
    ...(serving !== undefined ? { serving } : {}),
    servingLabel,
    servingText,
    kcal: kcal!,
    protein: protein!,
    carbs: carbs!,
    fat: fat!,
    categories,
    valueSource: core.source,
    photo,
    producer,
    creator,
    modified: num(p.last_modified_t) ?? 0,
    scans: num(p.unique_scans_n) ?? 0,
  };
  return {
    verdict: review.length ? "review" : "accept",
    reasons: review,
    candidate,
  };
}

/** Whether two records of one barcode agree within label rounding. */
export function sameValues(a: Candidate, b: Candidate) {
  const near = (x: number, y: number, floor: number) =>
    Math.abs(x - y) <= Math.max(floor, 0.05 * Math.max(x, y));
  return (
    a.basis === b.basis &&
    near(a.kcal, b.kcal, 1) &&
    near(a.protein, b.protein, 0.5) &&
    near(a.carbs, b.carbs, 0.5) &&
    near(a.fat, b.fat, 0.5)
  );
}
