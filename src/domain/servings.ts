// Smart servings (Phase 7.3F.1): which servings a branded product offers,
// decided once when the catalogue is built, from evidence in the USDA
// record. Pure and shared by the build and the tests. The rules:
// - One serving is always the manufacturer's metric serving (the amount the
//   per-100 values were derived from); only its name comes from text.
// - A name is used only when the source supports it: the label's household
//   text, an "about N units" text, the same product's other listing, or a
//   package that holds exactly one serving. Otherwise "1 serving".
// - Text that only restates the metric amount, says nothing, or states an
//   amount that contradicts the serving is never used as a name.
// - A whole package is offered only when its stated amount is a few
//   servings. Grams and millilitres are never converted into each other.

/** Where a product's serving name comes from. */
export type ServingSource =
  "label" | "measure" | "about" | "sibling" | "package" | "serving";
/** Stored in the catalogue as a small integer, in this order. */
export const SERVING_SOURCES: readonly ServingSource[] = [
  "label",
  "measure",
  "about",
  "sibling",
  "package",
  "serving",
];

/** How a product's household text reads. */
export type HouseholdKind =
  | "named" // names a unit: "1 stick", "2 slices", "15 chips"
  | "measure" // a household measure: "1/2 cup", "2 tbsp"
  | "about" // "15 CHIPS | ABOUT", recoverable
  | "metric" // only restates a weight or volume: "1.15 oz", "8 fl oz"
  | "conflict" // states an amount that contradicts the metric serving
  | "generic" // "1 serving", "amount per serving"
  | "empty" // nothing, "None", or text that can't be read
  | "long"; // a name too long to show as a serving

const OZ_G = 28.349523125;
const FLOZ_ML = 29.5735295625;
/** A household name longer than this falls back to "1 serving". */
export const MAX_LABEL = 40;
/** Package amounts within this ratio of the serving are one serving. */
const SINGLE = 0.08;
/** A whole package is offered for up to this many servings. */
export const MAX_PACKAGE_SERVINGS = 4.5;

const MEASURE = new Set([
  "cup",
  "cups",
  "c",
  "tbsp",
  "tbs",
  "tbl",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
]);
// Words that are amounts or filler, never a unit name.
const NOT_UNIT = new Set([
  "oz",
  "ounce",
  "ounces",
  "onz",
  "g",
  "gr",
  "grm",
  "gram",
  "grams",
  "mg",
  "mcg",
  "kg",
  "lb",
  "lbs",
  "ml",
  "mls",
  "mlt",
  "l",
  "liter",
  "liters",
  "litre",
  "litres",
  "fl",
  "fluid",
  "floz",
  "oza",
  "pt",
  "pint",
  "qt",
  "quart",
  "per",
  "serving",
  "servings",
  "svg",
  "serv",
  "amount",
  "approx",
  "about",
  "approximately",
  "n",
  "a",
  "na",
  "of",
  "x",
  "z",
  "t",
  "sec",
  "spray",
  "makes",
  "or",
  "to",
  "and",
]);

function fraction(s: string): number | undefined {
  const t = s.trim();
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined;
  const n = Number(t);
  return t && Number.isFinite(n) ? n : undefined;
}

/** Every weight or volume a text states, in g or ml. */
export function statedAmounts(text: string) {
  const found: { unit: "g" | "ml"; value: number }[] = [];
  const re =
    /(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*(fl\.?\s*oz\.?|floz|oza|ounces?|oz\.?|onz|grams?|grm|gr|g|mls?|mlt|liters?|litres?|l|kg|lbs?)(?![a-z])/gi;
  for (const m of text.matchAll(re)) {
    const v = fraction(m[1]!);
    if (v === undefined) continue;
    const u = m[2]!.toLowerCase().replace(/[\s.]/g, "");
    if (u === "floz" || u === "oza")
      found.push({ unit: "ml", value: v * FLOZ_ML });
    else if (u === "oz" || u === "onz" || u.startsWith("ounce"))
      found.push({ unit: "g", value: v * OZ_G });
    else if (u === "g" || u === "gr" || u === "grm" || u.startsWith("gram"))
      found.push({ unit: "g", value: v });
    else if (u === "kg") found.push({ unit: "g", value: v * 1000 });
    else if (u === "lb" || u === "lbs")
      found.push({ unit: "g", value: v * 453.59237 });
    else if (u === "ml" || u === "mls" || u === "mlt")
      found.push({ unit: "ml", value: v });
    else found.push({ unit: "ml", value: v * 1000 });
  }
  return found;
}

/** Whether a stated amount describes the metric serving (label rounding allowed). */
export const agrees = (stated: number, serving: number) =>
  Math.abs(stated - serving) <= Math.max(1.5, 0.12 * serving);

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter(Boolean);

/** Trailing filler some labels carry ("…, per container: about"). */
function trimFiller(text: string) {
  return text
    .replace(/""/g, '"')
    .replace(/[,(]?\s*\bmakes\b.*$/i, "")
    .replace(/[,;:]?\s*(servings?\s+)?per\s+(container|package|pkg)\b.*$/i, "")
    .replace(/[,;:(]?\s*\b(about|approx\.?|approximately)\s*[):]?\s*$/i, "")
    .trim();
}

/**
 * The name to show for a household text: filler, what follows "makes" and
 * any bracketed or trailing weight or volume removed (the serving's own
 * amount is shown beside it), and all-capital text in lower case.
 */
export function servingName(text: string) {
  let t = trimFiller(text);
  // Bracketed amounts: "(32g/1.15oz)", "(240 mL)".
  t = t.replace(/\(([^()]*)\)/g, (whole, inner: string) =>
    statedAmounts(inner).length &&
    !words(inner.replace(/\d+(\.\d+)?\s*[a-z.]*/gi, "")).length
      ? ""
      : whole,
  );
  // A trailing amount: "1 bar 25g", "1 stick, 32 g".
  t = t.replace(
    /[,\s]+(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*(fl\.?\s*oz\.?|oz\.?|g|grams?|ml)\.?\s*$/i,
    "",
  );
  t = t
    .replace(/\s+/g, " ")
    .replace(/[\s,;:.-]+$/, "")
    .trim();
  return /[a-z]/.test(t) ? t : t.toLowerCase();
}

/**
 * How a household text describes a serving of `serving` g or ml. `cleaned`
 * is the pipeline's text (GS1 codes in words; "" when unusable); `raw` is
 * the published text, read only to recover "N UNITS | ABOUT".
 */
export function readHousehold(
  raw: string,
  cleaned: string,
  serving: number,
  basis: "g" | "ml",
): { kind: HouseholdKind; name?: string } {
  if (!cleaned.trim()) {
    const about =
      /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s+([a-z][a-z .'-]*?)\s*\|\s*about\s*$/i.exec(
        raw,
      );
    if (about) {
      const unit = about[2]!.trim();
      const first = words(unit)[0];
      if (first && !NOT_UNIT.has(first))
        return {
          kind: "about",
          name: `about ${about[1]!.trim()} ${unit.toLowerCase()}`,
        };
    }
    return { kind: "empty" };
  }
  const text = trimFiller(cleaned);
  // An amount in the serving's own unit must describe the serving.
  const stated = statedAmounts(text).filter((a) => a.unit === basis);
  if (stated.length && !stated.some((a) => agrees(a.value, serving)))
    return { kind: "conflict" };
  const name = servingName(text);
  const w = words(name);
  if (!w.length) return { kind: "metric" };
  if (w.every((x) => NOT_UNIT.has(x)))
    return w.some((x) => ["serving", "servings", "svg", "serv"].includes(x)) ||
      w.includes("amount") ||
      w.includes("per")
      ? { kind: "generic" }
      : { kind: "metric" };
  // A count or fraction must come first, or the text is not a serving name.
  const lead =
    /^\s*(about\s+|approx\.?\s+)?(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+|one|half|a)\b/i.exec(
      name,
    );
  if (!lead) return { kind: "empty" };
  // The word right after the count is the unit: "1 oz (about 20 chips)"
  // and "about 2.5 servings per bag" don't name one.
  const first = words(name.slice(lead[0].length))[0];
  if (!first) return { kind: "metric" };
  if (NOT_UNIT.has(first))
    return ["serving", "servings", "svg", "serv"].includes(first)
      ? { kind: "generic" }
      : { kind: "metric" };
  const unitWords = w.filter((x) => !NOT_UNIT.has(x));
  if (!unitWords.length) return { kind: "metric" };
  if (name.length > MAX_LABEL) return { kind: "long" };
  return unitWords.some((x) => MEASURE.has(x))
    ? { kind: "measure", name }
    : { kind: "named", name };
}

/** The package's amount in the serving's unit, or undefined when unclear. */
export function packageAmount(text: string, basis: "g" | "ml") {
  const t = text.trim();
  if (!t) return undefined;
  // "12 x 12 fl oz", "6 ct", "24 pack": a multipack, never one package.
  if (/\d+\s*(x|ct|count|pk|pack|packs)\b|\bx\s*\d/i.test(t)) return undefined;
  const all = statedAmounts(t).filter((a) => a.unit === basis);
  if (!all.length) return undefined;
  // Every amount stated must agree ("1.15 OZ/32 G"); "5 lbs/2.26 g" doesn't.
  const first = all[0]!.value;
  if (!all.every((a) => Math.abs(a.value - first) <= 0.05 * first))
    return undefined;
  return all[all.length - 1]!.value;
}

export type ServingPlan = {
  /** The serving's name ("1 stick", "about 15 chips", "1 serving"). */
  label: string;
  source: ServingSource;
  /** The whole package's amount (g or ml), when it is a few servings. */
  whole?: number;
  /** How the household text read (for build reports). */
  kind: HouseholdKind;
};

/**
 * The servings a product offers. `sibling` is the label name published on
 * another listing of the same product (same brand, name, serving and
 * basis), when there is one.
 */
export function planServing(
  p: {
    householdRaw: string;
    household: string;
    serving: number;
    basis: "g" | "ml";
    packageText: string;
  },
  sibling?: string,
): ServingPlan {
  const h = readHousehold(p.householdRaw, p.household, p.serving, p.basis);
  const pkg = packageAmount(p.packageText, p.basis);
  const ratio = pkg === undefined ? undefined : pkg / p.serving;
  const whole =
    ratio !== undefined &&
    ratio > 1 + SINGLE &&
    ratio <= MAX_PACKAGE_SERVINGS &&
    pkg! <= 5000
      ? Math.round(pkg! * 100) / 100
      : undefined;
  const plan = (label: string, source: ServingSource): ServingPlan => ({
    label,
    source,
    kind: h.kind,
    ...(whole === undefined ? {} : { whole }),
  });
  if (h.kind === "named") return plan(h.name!, "label");
  if (h.kind === "measure") return plan(h.name!, "measure");
  if (h.kind === "about") return plan(h.name!, "about");
  // Conflicting text means the record's description is unreliable: only the
  // metric serving is trusted.
  if (h.kind === "conflict") return plan("1 serving", "serving");
  if (sibling) return plan(sibling, "sibling");
  if (ratio !== undefined && Math.abs(ratio - 1) <= SINGLE)
    return plan("1 package", "package");
  return plan("1 serving", "serving");
}

/** The key that identifies listings of the same product for `sibling`. */
export const siblingKey = (p: {
  brand: string;
  name: string;
  basis: string;
  serving: number;
}) =>
  [p.brand.toLowerCase(), p.name.toLowerCase(), p.basis, p.serving].join("|");
