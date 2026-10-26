// Personal barcode foods and corrections (Phase 7.3F.2 M2). A barcode the
// bundled catalogue doesn't know can be saved once, with the values from its
// package label, and is recognised on every later scan. A branded product's
// values can be corrected the same way. Both are ordinary saved foods
// (journal kind "food", per-serving values), so they are stored, synced,
// backed up and logged by the existing machinery; the bundled catalogue is
// never changed. Pure and dependency-free (logic-tested).
import { gtin14 } from "./barcode";
import { decimalText } from "./numbers";
import type { Journal } from "./types";
import type { NutritionData } from "./nutrition";
import type { LibraryFood } from "./food-library";

/** Namespace of a personal food's source identity ("personal:<GTIN-14>"). */
export const PERSONAL_PREFIX = "personal";
/** The catalogue value recorded on personal foods and their entries. */
export const PERSONAL_CATALOG = "personal";
/** A serving name as printed on a label ("1 can"), at most this long. */
export const MAX_SERVING_NAME = 40;
/** A typed serving amount: 0.1 to 5,000 g or ml. */
export const MIN_SERVING = 0.1;
export const MAX_SERVING = 5000;
/** The journal accepts at most this per value for one serving. */
const MAX_VALUE = 20000;

/**
 * A personal food made for an unknown barcode, or a personal correction of
 * a catalogue product. Corrections keep the product's own source identity.
 */
export type PersonalKind = "food" | "correction";
export type LabelBasis = "serving" | "100";
export type LabelUnit = "g" | "ml";
type Nutrients = {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};
export const NUTRIENTS = ["calories", "protein", "carbs", "fat"] as const;

/**
 * The label form as typed. Values per serving and per 100 are kept apart,
 * so switching the basis never reinterprets numbers already typed.
 */
export type LabelDraft = {
  name: string;
  brand: string;
  /** Canonical GTIN-14 (from a scan or the product); never typed here. */
  barcode: string;
  basis: LabelBasis;
  unit: LabelUnit;
  /** One serving's amount in `unit`, as typed ("" when not stated). */
  amount: string;
  /** The serving's name as printed ("1 can"), or "". */
  household: string;
  perServing: Nutrients;
  per100: Nutrients;
};
export type LabelErrors = Partial<
  Record<
    | "name"
    | "brand"
    | "barcode"
    | "amount"
    | "household"
    | (typeof NUTRIENTS)[number]
    | "form",
    string
  >
>;

/** What the saved record describes (read defensively from any record). */
export type PersonalInfo = {
  kind: PersonalKind;
  barcode?: string;
  brand?: string;
  /** "1 can", or "1 serving" when the label names none. */
  servingName: string;
  /** One serving's amount, when the label states it. */
  amount?: number;
  unit?: LabelUnit;
};

const EMPTY: Nutrients = { calories: "", protein: "", carbs: "", fat: "" };
const text = (v: unknown) =>
  v === undefined || v === null ? "" : String(v).trim();
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
/** Removes binary noise only (to a millionth), as valuesForAmount does. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;
const show = (n: number) => String(Math.round(n * 100) / 100);

/** A personal food's source identity for a barcode. */
export const personalId = (gtin: string) => `${PERSONAL_PREFIX}:${gtin}`;
export const isPersonalId = (id: string | undefined) =>
  !!id && id.startsWith(`${PERSONAL_PREFIX}:`);

/**
 * A canonical GTIN-14 as printed under the bars: EAN-8, UPC-A (12 digits)
 * or EAN-13, without the padding zeros. Display only.
 */
export function displayBarcode(gtin: string) {
  if (!/^\d{14}$/.test(gtin)) return gtin;
  if (gtin.startsWith("000000")) return gtin.slice(6);
  if (gtin.startsWith("00")) return gtin.slice(2);
  if (gtin.startsWith("0")) return gtin.slice(1);
  return gtin;
}

/** The personal food or correction a saved food is, or undefined. */
export function personalInfo(data: NutritionData): PersonalInfo | undefined {
  const kind = data.personalKind;
  if (kind !== "food" && kind !== "correction") return undefined;
  const barcode =
    typeof data.sourceBarcode === "string" &&
    gtin14(data.sourceBarcode) === data.sourceBarcode
      ? data.sourceBarcode
      : undefined;
  // A personal food is its barcode; without a valid one it is ordinary.
  if (kind === "food" && !barcode) return undefined;
  const ml = positive(data.sourceMl) ? data.sourceMl : undefined;
  const grams = positive(data.sourceGrams) ? data.sourceGrams : undefined;
  const brand = text(data.sourceBrand);
  return {
    kind,
    ...(barcode ? { barcode } : {}),
    ...(brand ? { brand } : {}),
    servingName: text(data.servingName) || "1 serving",
    ...(ml !== undefined
      ? { amount: ml, unit: "ml" as const }
      : grams !== undefined
        ? { amount: grams, unit: "g" as const }
        : {}),
  };
}

/** A blank form for a scanned barcode the catalogue doesn't know. */
export function labelDraftForBarcode(gtin: string): LabelDraft {
  return {
    name: "",
    brand: "",
    barcode: gtin,
    basis: "serving",
    unit: "g",
    amount: "",
    household: "",
    perServing: { ...EMPTY },
    per100: { ...EMPTY },
  };
}

/** The form for editing a saved personal food or correction. */
export function labelDraftFrom(data: NutritionData): LabelDraft {
  const info = personalInfo(data);
  const values = (k: (typeof NUTRIENTS)[number]) =>
    Number.isFinite(Number(data[k])) ? show(Number(data[k])) : "";
  return {
    name: text(data.name),
    brand: info?.brand ?? "",
    barcode: info?.barcode ?? "",
    basis: "serving",
    unit: info?.unit ?? "g",
    amount: info?.amount !== undefined ? show(info.amount) : "",
    household: info && info.servingName !== "1 serving" ? info.servingName : "",
    perServing: {
      calories: values("calories"),
      protein: values("protein"),
      carbs: values("carbs"),
      fat: values("fat"),
    },
    per100: { ...EMPTY },
  };
}

/**
 * A correction form for a catalogue product: its name, brand, barcode and
 * first (label) serving, with the catalogue's values for that serving, so
 * only what differs from the package needs changing.
 */
export function correctionDraft(food: LibraryFood): LabelDraft {
  const portion = food.portions[0];
  const unit: LabelUnit = food.basis === "ml" ? "ml" : "g";
  const amount = portion ? (portion.ml ?? portion.grams) : 100;
  const at = (per100: number) => show(clean((per100 * amount) / 100));
  const label = portion?.label ?? "";
  return {
    name: food.name,
    brand: food.brand ?? "",
    barcode: food.barcode ?? "",
    basis: "serving",
    unit,
    amount: show(amount),
    household: /^1 serving$/i.test(label) ? "" : label,
    perServing: {
      calories: at(food.kcal),
      protein: at(food.protein),
      carbs: at(food.carbs),
      fat: at(food.fat),
    },
    per100: { ...EMPTY },
  };
}

function readNumber(raw: string) {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(decimalText(t));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Per-100 limits: the most energy or macros 100 g or 100 ml can hold. */
const PER_100_MAX = { calories: 902, protein: 100, carbs: 100, fat: 100 };

/** One serving of a typed amount, or undefined when it isn't stated. */
export function servingLabel(
  household: string,
  amount?: number,
  unit?: string,
) {
  const name = household.trim().replace(/\s+/g, " ");
  const metric = amount !== undefined ? `${show(amount)} ${unit}` : "";
  if (name && metric) return `${name} (${metric})`;
  if (name) return name;
  if (metric) return `1 serving (${metric})`;
  return undefined;
}

/**
 * The values of one serving as the form stands, for the preview: converted
 * from per 100 when the label is read that way. Undefined until every value
 * (and, per 100, the serving amount) reads as a number.
 */
export function servingValues(draft: LabelDraft) {
  const source = draft.basis === "serving" ? draft.perServing : draft.per100;
  const values = NUTRIENTS.map((k) => readNumber(source[k]));
  if (values.some((v) => v === undefined || !(v >= 0))) return undefined;
  if (draft.basis === "serving") {
    const [calories, protein, carbs, fat] = values as number[];
    return { calories, protein, carbs, fat } as Record<
      (typeof NUTRIENTS)[number],
      number
    >;
  }
  const amount = readNumber(draft.amount);
  if (!(amount !== undefined && amount >= MIN_SERVING && amount <= MAX_SERVING))
    return undefined;
  const [calories, protein, carbs, fat] = (values as number[]).map((v) =>
    clean((v * amount) / 100),
  ) as [number, number, number, number];
  return { calories, protein, carbs, fat };
}

/** Energy far from 4 × protein + 4 × carbs + 9 × fat (worth a second look). */
export function energyWarning(v: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  const estimate = 4 * v.protein + 4 * v.carbs + 9 * v.fat;
  if (Math.abs(v.calories - estimate) <= 20) return undefined;
  const ratio = estimate > 0 ? v.calories / estimate : Infinity;
  if (ratio >= 0.5 && ratio <= 2) return undefined;
  return "Calories look far from protein, carbs and fat. Check the label before saving.";
}

/** What a correction is of: the catalogue product's identity. */
export type CorrectionOf = {
  sourceId: string;
  sourceCatalog?: string;
  /** The catalogue's values for the same serving, to refuse a no-op. */
  values?: { calories: number; protein: number; carbs: number; fat: number };
  amount?: number;
  /** The catalogue's serving name as the form showed it ("" when generic). */
  household?: string;
};

/** What a correction of a catalogue product (in a catalogue version) is of. */
export function correctionOf(
  food: LibraryFood,
  catalog?: string,
): CorrectionOf {
  const draft = correctionDraft(food);
  const portion = food.portions[0];
  const amount = portion ? (portion.ml ?? portion.grams) : 100;
  const at = (per100: number) => clean((per100 * amount) / 100);
  return {
    sourceId: food.id,
    ...(catalog ? { sourceCatalog: catalog } : {}),
    values: {
      calories: at(food.kcal),
      protein: at(food.protein),
      carbs: at(food.carbs),
      fat: at(food.fat),
    },
    amount,
    household: draft.household,
  };
}

/**
 * The record to save, or what to fix. Values are stored per serving (the
 * saved-food model); values read per 100 are converted once, here, with the
 * serving amount the label states. Zero stays zero; nothing missing is
 * filled in; grams and millilitres are never converted into each other.
 */
export function readLabelDraft(
  draft: LabelDraft,
  target: { kind: "food" } | { kind: "correction"; of: CorrectionOf },
): { data: NutritionData; warning?: string } | { errors: LabelErrors } {
  const errors: LabelErrors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Enter the food's name";
  else if (name.length > 120)
    errors.name = "Keep the name under 120 characters";
  const brand = draft.brand.trim().replace(/\s+/g, " ");
  if (brand.length > 80) errors.brand = "Keep the brand under 80 characters";
  const barcode = draft.barcode ? gtin14(draft.barcode) : null;
  if (draft.barcode && barcode !== draft.barcode)
    errors.barcode = "This barcode isn't valid. Scan it again.";
  if (target.kind === "food" && !draft.barcode)
    errors.barcode = "Scan the product's barcode first";
  const household = draft.household.trim().replace(/\s+/g, " ");
  if (household.length > MAX_SERVING_NAME)
    errors.household = `Keep the serving name under ${MAX_SERVING_NAME} characters`;
  const amount = readNumber(draft.amount);
  if (amount !== undefined && !(amount >= MIN_SERVING && amount <= MAX_SERVING))
    errors.amount = `Enter ${MIN_SERVING} to ${MAX_SERVING} ${draft.unit}`;
  else if (amount === undefined && draft.basis === "100")
    errors.amount = `Enter the serving size in ${draft.unit} from the label (needed for per-100 ${draft.unit} values)`;
  const source = draft.basis === "serving" ? draft.perServing : draft.per100;
  for (const key of NUTRIENTS) {
    const v = readNumber(source[key]);
    const max =
      draft.basis === "100"
        ? PER_100_MAX[key] * (draft.unit === "ml" && key !== "calories" ? 2 : 1)
        : MAX_VALUE;
    if (v === undefined) errors[key] = "Enter a number (0 if none)";
    else if (!(v >= 0 && v <= max))
      errors[key] = `Enter a number from 0 to ${max}`;
  }
  if (draft.basis === "100" && draft.unit === "g" && !errors.protein) {
    const sum = ["protein", "carbs", "fat"].reduce(
      (s, k) => s + (readNumber(source[k as "protein"]) ?? 0),
      0,
    );
    if (sum > 105)
      errors.form =
        "Protein, carbs and fat can't add up to more than 100 g per 100 g";
  }
  if (Object.keys(errors).length) return { errors };
  const values = servingValues(draft)!;
  if (NUTRIENTS.some((k) => values[k] > MAX_VALUE))
    return {
      errors: {
        form: "One serving is more than an entry can hold. Use a smaller serving.",
      },
    };
  if (target.kind === "correction" && target.of.values) {
    const same = (a: number, b: number) => Math.abs(a - b) <= 0.01;
    const was = target.of.values;
    if (
      NUTRIENTS.every((k) => same(values[k], was[k])) &&
      amount === target.of.amount &&
      household === (target.of.household ?? "")
    )
      return {
        errors: {
          form: "These are USDA's values. Change what differs from your package.",
        },
      };
  }
  const serving = servingLabel(household, amount, draft.unit);
  const data: NutritionData = {
    name,
    calories: values.calories,
    protein: values.protein,
    carbs: values.carbs,
    fat: values.fat,
    quantity: 1,
    ...(serving ? { serving } : {}),
    personalKind: target.kind,
    servingName: household || "1 serving",
    labelBasis: draft.basis,
    ...(target.kind === "food"
      ? { sourceId: personalId(barcode!), sourceCatalog: PERSONAL_CATALOG }
      : {
          sourceId: target.of.sourceId,
          ...(target.of.sourceCatalog
            ? { sourceCatalog: target.of.sourceCatalog }
            : {}),
          sourceEdited: true,
        }),
    ...(amount !== undefined
      ? draft.unit === "ml"
        ? { sourceMl: amount }
        : { sourceGrams: amount }
      : {}),
    ...(brand ? { sourceBrand: brand } : {}),
    ...(barcode ? { sourceBarcode: barcode } : {}),
  };
  const warning = energyWarning(values);
  return warning ? { data, warning } : { data };
}

/**
 * The personal food or correction for a product, when the lifter has one:
 * the same barcode, or (for a correction) the same catalogue product. When
 * more than one matches (two devices saved one each), the most recently
 * updated wins, then the earliest created, then the record ID: the same
 * answer on every device.
 */
export function findPersonal(
  foods: Journal[],
  target: { barcode?: string; sourceId?: string },
  exceptId?: string,
) {
  const matches = foods.filter((f) => {
    if (f.kind !== "food" || f.id === exceptId) return false;
    const info = personalInfo(f.data);
    if (!info) return false;
    if (target.barcode && info.barcode === target.barcode) return true;
    return (
      !!target.sourceId &&
      info.kind === "correction" &&
      f.data.sourceId === target.sourceId
    );
  });
  if (!matches.length) return undefined;
  matches.sort(
    (a, b) =>
      b.updatedAt - a.updatedAt ||
      a.createdAt - b.createdAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { food: matches[0]!, count: matches.length };
}

/** The saved record a new personal record would duplicate, if any. */
export function personalConflict(
  foods: Journal[],
  data: NutritionData,
  exceptId?: string,
) {
  const barcode =
    typeof data.sourceBarcode === "string" ? data.sourceBarcode : undefined;
  const sourceId =
    data.personalKind === "correction" && typeof data.sourceId === "string"
      ? data.sourceId
      : undefined;
  return findPersonal(foods, { barcode, sourceId }, exceptId)?.food;
}
