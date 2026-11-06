// Hydration (Phase 7.3C). Water is its own journal kind, `hydration`, and is
// never food: no calories, no macros, no meal. Amounts are stored in
// canonical millilitres; the amount and unit the lifter typed are kept too,
// so an entry always shows back exactly as entered. Rounding happens only
// for display. See docs/audits/PHASE_7_3C_HYDRATION_ARCHITECTURE.md.

export type FluidUnit = "ml" | "oz";

/** One US fluid ounce, exactly (1/128 US gallon). */
export const ML_PER_OZ = 29.5735295625;

/** One entry: 1 mL to 5 L. */
export const MIN_ENTRY_ML = 1;
export const MAX_ENTRY_ML = 5000;
/** A daily goal: 0.5 L to 10 L. */
export const MIN_GOAL_ML = 500;
export const MAX_GOAL_ML = 10000;

/** Quick-add presets, in each unit (founder decision H2). */
export const PRESETS: Record<FluidUnit, number[]> = {
  ml: [250, 500, 750],
  oz: [8, 16, 24],
};

export type HydrationData = {
  /** Canonical amount, millilitres. */
  ml: number;
  /** As typed: the amount and its unit. */
  amount?: number;
  unit?: FluidUnit;
};

/** Removes binary float noise only (to a millionth); nothing meaningful. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

export const toMl = (amount: number, unit: FluidUnit) =>
  clean(unit === "oz" ? amount * ML_PER_OZ : amount);
export const fromMl = (ml: number, unit: FluidUnit) =>
  unit === "oz" ? ml / ML_PER_OZ : ml;

/** The lifter's unit: their choice, else following their weight unit. */
export function fluidUnitOf(p: { fluidUnit?: FluidUnit; units: "kg" | "lb" }) {
  return p.fluidUnit ?? (p.units === "lb" ? "oz" : "ml");
}

export const unitLabel = (unit: FluidUnit) => (unit === "oz" ? "fl oz" : "mL");
const unitSpoken = (unit: FluidUnit, n: number) =>
  unit === "oz"
    ? n === 1
      ? "fluid ounce"
      : "fluid ounces"
    : n === 1
      ? "millilitre"
      : "millilitres";

/** "1.5", "12", "0.25": an amount without trailing zeros. */
const trim = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A volume for display: whole mL below a litre, litres to one decimal from
 * a litre, whole fluid ounces.
 */
export function volumeText(ml: number, unit: FluidUnit) {
  if (unit === "oz")
    return `${Math.round(fromMl(ml, "oz")).toLocaleString()} fl oz`;
  const whole = Math.round(ml);
  if (whole < 1000) return `${whole} mL`;
  return `${(Math.round(ml / 100) / 10).toFixed(1)} L`;
}

/** The same volume for screen readers. */
export function volumeSpoken(ml: number, unit: FluidUnit) {
  if (unit === "oz") {
    const n = Math.round(fromMl(ml, "oz"));
    return `${n.toLocaleString()} ${unitSpoken("oz", n)}`;
  }
  const whole = Math.round(ml);
  if (whole < 1000) return `${whole} ${unitSpoken("ml", whole)}`;
  const l = Math.round(ml / 100) / 10;
  return `${l.toFixed(1)} litres`;
}

/** An entry as the lifter typed it ("12 fl oz", "330 mL"). */
export function entryText(d: HydrationData) {
  if (d.amount !== undefined && d.unit)
    return `${trim(d.amount)} ${unitLabel(d.unit)}`;
  return volumeText(d.ml, "ml");
}
export function entrySpoken(d: HydrationData) {
  if (d.amount !== undefined && d.unit)
    return `${trim(d.amount)} ${unitSpoken(d.unit, d.amount)}`;
  return volumeSpoken(d.ml, "ml");
}

/** Reads a stored entry defensively; undefined when it isn't one. */
export function hydrationOf(
  data: Record<string, unknown>,
): HydrationData | undefined {
  const ml = Number(data.ml);
  if (!Number.isFinite(ml) || ml <= 0) return undefined;
  const unit = data.unit === "ml" || data.unit === "oz" ? data.unit : undefined;
  const amount = Number(data.amount);
  return unit && Number.isFinite(amount) && amount > 0
    ? { ml, amount, unit }
    : { ml };
}

/** The record for an amount typed in a unit. */
export function hydrationData(amount: number, unit: FluidUnit): HydrationData {
  return { ml: toMl(amount, unit), amount, unit };
}

/** A typed amount: accepts "1,5" as 1.5; NaN when it isn't a number. */
export function parseAmount(text: string) {
  const t = text.trim().replace(",", ".");
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
}

/** Limits in a unit, for messages and checks. */
export function entryRange(unit: FluidUnit) {
  return unit === "oz"
    ? { min: 0.1, max: Math.floor(fromMl(MAX_ENTRY_ML, "oz")) }
    : { min: MIN_ENTRY_ML, max: MAX_ENTRY_ML };
}
export function goalRange(unit: FluidUnit) {
  return unit === "oz"
    ? {
        min: Math.ceil(fromMl(MIN_GOAL_ML, "oz")),
        max: Math.floor(fromMl(MAX_GOAL_ML, "oz")),
      }
    : { min: MIN_GOAL_ML, max: MAX_GOAL_ML };
}

/** Why a typed amount can't be logged, or undefined when it can. */
export function amountError(amount: number, unit: FluidUnit) {
  const { min, max } = entryRange(unit);
  if (!Number.isFinite(amount) || amount < min || amount > max)
    return `Enter ${min} to ${max.toLocaleString()} ${unitLabel(unit)}`;
  const ml = toMl(amount, unit);
  if (ml < MIN_ENTRY_ML || ml > MAX_ENTRY_ML)
    return `Enter ${min} to ${max.toLocaleString()} ${unitLabel(unit)}`;
  return undefined;
}
export function goalError(amount: number, unit: FluidUnit) {
  const { min, max } = goalRange(unit);
  if (!Number.isFinite(amount) || amount < min || amount > max)
    return `Enter ${min.toLocaleString()} to ${max.toLocaleString()} ${unitLabel(unit)}`;
  return undefined;
}

/** Total millilitres for a day's entries. */
export function totalMl(entries: { data: Record<string, unknown> }[]) {
  return clean(
    entries.reduce((sum, e) => sum + (hydrationOf(e.data)?.ml ?? 0), 0),
  );
}

/**
 * The day's water against the lifter's own goal. Without a goal there is no
 * percentage or remainder (founder decision H9).
 */
export function hydrationDay(
  total: number,
  goal: number | undefined,
  unit: FluidUnit,
) {
  const hasGoal = goal !== undefined && goal > 0;
  const left = hasGoal ? goal - total : 0;
  return {
    total: volumeText(total, unit),
    goal: hasGoal ? volumeText(goal, unit) : undefined,
    ratio: hasGoal ? total / goal : undefined,
    percent: hasGoal ? Math.round((total / goal) * 100) : undefined,
    left: hasGoal
      ? left > 0
        ? `${volumeText(left, unit)} to go`
        : "Goal reached"
      : undefined,
    spoken: hasGoal
      ? `${volumeSpoken(total, unit)} of ${volumeSpoken(goal, unit)}, ${Math.round((total / goal) * 100)} percent`
      : `${volumeSpoken(total, unit)} logged`,
  };
}
