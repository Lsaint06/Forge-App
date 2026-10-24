// The pure part of the food library build: USDA records in, a curated,
// validated catalog out. No I/O here, so the rules can be tested with
// fixtures. Nutrient values are copied from the source unchanged; a record
// that cannot supply every required value is excluded, never filled in.
import {
  DISCOURAGE,
  EQUIVALENT_VARIANTS,
  FNDDS_CATEGORIES,
  FNDDS_EXCLUDE,
  FNDDS_RULE_EXEMPT,
  FNDDS_UNCATEGORIZED_ALLOW,
  MAX_PORTIONS,
  MAX_QUALIFIERS,
  PORTION_EXCLUDE,
  PREFER,
  SOURCE_QUALIFIER,
  SOURCE_QUALIFIER_FAMILIES,
  SR_DESCRIPTION_NOISE,
  SR_EXCLUDE,
  SR_RULES,
  FAMILIES,
  type Family,
} from "./rules";

export type SourceKey = "fndds" | "sr";
export type SourceSpec = {
  key: SourceKey;
  label: string;
  dataType: string;
  release: string;
  url: string;
  sha256: string;
  bytes: number;
  members: string[];
  root: string;
  energyNutrientIds: number[];
};

/** Nutrient IDs and units, verified against the downloaded releases. */
export const NUTRIENTS = {
  protein: { id: 1003, unit: "g" },
  fat: { id: 1004, unit: "g" },
  carbs: { id: 1005, unit: "g" },
} as const;
export const KILOJOULES_ID = 1062;

export type Per100 = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type Portion = { label: string; grams: number };
export type CatalogFood = {
  id: string;
  source: SourceKey;
  fdcId: number;
  description: string;
  name: string;
  family: Family;
  per100: Per100;
  energyId: number;
  portions: Portion[];
  rank: number;
};
export type Exclusion = {
  id: string;
  source: SourceKey;
  description: string;
  reason: string;
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * One nutrient's amount per 100 g. Missing, duplicated with a different
 * value, wrongly-united, negative or non-numeric values are reported, not
 * repaired. A recorded 0 is kept as the source's zero.
 */
export function readNutrient(
  food: Json,
  id: number,
  unit: string,
  label: string,
): Read<number> {
  const rows = (Array.isArray(food.foodNutrients) ? food.foodNutrients : [])
    .filter(isObject)
    .filter((n) => isObject(n.nutrient) && n.nutrient.id === id);
  if (!rows.length) return { ok: false, reason: `missing-${label}` };
  const values = new Set<number>();
  for (const row of rows) {
    const nutrient = row.nutrient as Json;
    if (String(nutrient.unitName ?? "").toLowerCase() !== unit)
      return { ok: false, reason: `wrong-unit-${label}` };
    const amount = row.amount;
    if (amount === null || amount === undefined)
      return { ok: false, reason: `missing-${label}` };
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
      return { ok: false, reason: `invalid-${label}` };
    values.add(amount);
  }
  if (values.size > 1) return { ok: false, reason: `conflicting-${label}` };
  return { ok: true, value: [...values][0]! };
}

/**
 * Energy in kcal from the source's permitted nutrient IDs, in policy order.
 * An ID that is present but unusable is an exclusion: it never falls
 * through to a later ID. kJ-only records are not converted (policy v1).
 */
export function readEnergy(
  food: Json,
  ids: number[],
): Read<{ kcal: number; id: number }> {
  for (const id of ids) {
    const present = (
      Array.isArray(food.foodNutrients) ? food.foodNutrients : []
    ).some((n) => isObject(n) && isObject(n.nutrient) && n.nutrient.id === id);
    if (!present) continue;
    const read = readNutrient(food, id, "kcal", "energy");
    return read.ok ? { ok: true, value: { kcal: read.value, id } } : read;
  }
  const kj = (Array.isArray(food.foodNutrients) ? food.foodNutrients : []).some(
    (n) =>
      isObject(n) && isObject(n.nutrient) && n.nutrient.id === KILOJOULES_ID,
  );
  return { ok: false, reason: kj ? "energy-kj-only" : "missing-energy" };
}

/** All four required values, or the first reason they can't be used. */
export function readPer100(
  food: Json,
  energyIds: number[],
): Read<{
  per100: Per100;
  energyId: number;
}> {
  const energy = readEnergy(food, energyIds);
  if (!energy.ok) return energy;
  const out: Per100 = {
    kcal: energy.value.kcal,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  for (const key of ["protein", "carbs", "fat"] as const) {
    const n = NUTRIENTS[key];
    const read = readNutrient(food, n.id, n.unit, key);
    if (!read.ok) return read;
    out[key] = read.value;
  }
  // Per 100 g, macronutrients cannot exceed the food's weight and energy
  // cannot exceed pure fat. Allow for the source's rounding only.
  if (out.protein + out.carbs + out.fat > 101 || out.kcal > 902)
    return { ok: false, reason: "implausible-values" };
  return { ok: true, value: { per100: out, energyId: energy.value.id } };
}

const amountText = (n: number) => String(Math.round(n * 1000) / 1000);
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Household portions with their documented gram weights, in source order.
 * Each label describes the whole weighed portion ("1 egg", "0.5 breast").
 */
export function readPortions(food: Json, source: SourceKey): Portion[] {
  const rows = (Array.isArray(food.foodPortions) ? food.foodPortions : [])
    .filter(isObject)
    .sort(
      (a, b) =>
        Number(a.sequenceNumber ?? Infinity) -
          Number(b.sequenceNumber ?? Infinity) ||
        Number(a.id ?? 0) - Number(b.id ?? 0),
    );
  const out: Portion[] = [];
  const seen = new Set<string>();
  for (const p of rows) {
    const grams = p.gramWeight;
    if (
      typeof grams !== "number" ||
      !Number.isFinite(grams) ||
      grams <= 0 ||
      grams > 5000
    )
      continue;
    let label = "";
    if (source === "fndds") label = tidy(String(p.portionDescription ?? ""));
    else {
      const amount = p.amount;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
        continue;
      const unit = isObject(p.measureUnit)
        ? String(p.measureUnit.name ?? "")
        : "";
      const modifier = tidy(String(p.modifier ?? ""));
      const text =
        unit && unit !== "undetermined"
          ? modifier
            ? `${unit}, ${modifier}`
            : unit
          : modifier;
      if (!text || /^\d+$/.test(text)) continue;
      label = `${amountText(amount)} ${text}`;
    }
    if (!label || PORTION_EXCLUDE.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, grams });
    if (out.length >= MAX_PORTIONS) break;
  }
  return out;
}

function rankOf(description: string) {
  let r = 0;
  for (const re of PREFER) if (re.test(description)) r++;
  for (const re of DISCOURAGE) if (re.test(description)) r--;
  return Math.max(-2, Math.min(2, r));
}

/**
 * Whether two foods' values per 100 g are close enough that offering both
 * adds nothing: energy within 10 kcal or 5 %, each macronutrient within
 * 1 g or 10 %.
 */
export function nearIdentical(a: Per100, b: Per100) {
  const close = (x: number, y: number, abs: number, rel: number) =>
    Math.abs(x - y) <= Math.max(abs, rel * Math.max(x, y));
  return (
    close(a.kcal, b.kcal, 10, 0.05) &&
    close(a.protein, b.protein, 1, 0.1) &&
    close(a.carbs, b.carbs, 1, 0.1) &&
    close(a.fat, b.fat, 1, 0.1)
  );
}

function srName(description: string, rename: [RegExp, string][] = []) {
  let name = description;
  for (const [re, to] of rename) name = name.replace(re, to);
  name = tidy(name);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

type Input = { spec: SourceSpec; records: unknown[] };
export type CurateResult = {
  foods: CatalogFood[];
  exclusions: Exclusion[];
  inputs: Record<SourceKey, number>;
};

/** Curates the pinned sources into the catalog. Deterministic. */
export function curate(inputs: Input[]): CurateResult {
  const exclusions: Exclusion[] = [];
  const candidates: CatalogFood[] = [];
  const counts = { fndds: 0, sr: 0 } as Record<SourceKey, number>;
  const ids = new Set<string>();
  for (const { spec, records } of inputs) {
    counts[spec.key] = records.length;
    records.forEach((record, index) => {
      const exclude = (id: string, description: string, reason: string) =>
        exclusions.push({ id, source: spec.key, description, reason });
      if (!isObject(record))
        return exclude(`${spec.key}:#${index}`, "", "null-record");
      const fdcId = record.fdcId;
      const rawDescription = tidy(String(record.description ?? ""));
      if (typeof fdcId !== "number" || !Number.isInteger(fdcId) || fdcId <= 0)
        return exclude(`${spec.key}:#${index}`, rawDescription, "invalid-id");
      const id = `${spec.key}:${fdcId}`;
      if (ids.has(id)) throw new Error(`Duplicate source identifier ${id}`);
      ids.add(id);
      if (record.dataType !== spec.dataType)
        return exclude(id, rawDescription, "unexpected-data-type");
      if (!rawDescription) return exclude(id, "", "missing-description");

      let family: Family;
      let name: string;
      if (spec.key === "fndds") {
        const category = isObject(record.wweiaFoodCategory)
          ? String(record.wweiaFoodCategory.wweiaFoodCategoryDescription ?? "")
          : "";
        const mapped = FNDDS_CATEGORIES[category];
        if (!mapped)
          return exclude(
            id,
            rawDescription,
            `category-not-curated: ${category}`,
          );
        if (
          category === "Not included in a food category" &&
          !FNDDS_UNCATEGORIZED_ALLOW.test(rawDescription)
        )
          return exclude(id, rawDescription, "ingredient-only");
        const rule = FNDDS_EXCLUDE.find(
          (r) =>
            r.match.test(rawDescription) &&
            !FNDDS_RULE_EXEMPT[r.reason]?.includes(category),
        );
        if (rule) return exclude(id, rawDescription, rule.reason);
        family = mapped;
        name = rawDescription;
      } else {
        const clean = tidy(rawDescription.replace(SR_DESCRIPTION_NOISE, ""));
        if (SR_EXCLUDE.test(clean))
          return exclude(id, rawDescription, "sr-regional-or-variant");
        const rule = SR_RULES.find((r) => r.match.test(clean));
        if (!rule) return exclude(id, rawDescription, "sr-not-in-allowlist");
        family = rule.family;
        name = srName(clean, rule.name);
      }

      const values = readPer100(record, spec.energyNutrientIds);
      if (!values.ok) return exclude(id, rawDescription, values.reason);
      candidates.push({
        id,
        source: spec.key,
        fdcId,
        description: rawDescription,
        name,
        family,
        per100: values.value.per100,
        energyId: values.value.energyId,
        portions: readPortions(record, spec.key),
        rank: rankOf(rawDescription),
      });
    });
  }

  const excludeCandidate = (c: CatalogFood, reason: string) => {
    exclusions.push({
      id: c.id,
      source: c.source,
      description: c.description,
      reason,
    });
    return false;
  };

  // 1. Purchase-source variants of one dish ("…, restaurant", "…, home
  // recipe", the generic dish): the generic or home version is offered and
  // a variant is left out only when its values are near-identical to it.
  const sourceRank = (d: string) => {
    const q = d.match(SOURCE_QUALIFIER)?.[2];
    return q === undefined ? 0 : q === "home recipe" ? 1 : 2;
  };
  const groups = new Map<string, CatalogFood[]>();
  for (const c of candidates)
    if (c.source === "fndds" && SOURCE_QUALIFIER_FAMILIES.includes(c.family)) {
      const key = tidy(c.description.replace(SOURCE_QUALIFIER, ""));
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
  const sourceDropped = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = [...group].sort(
      (a, b) =>
        sourceRank(a.description) - sourceRank(b.description) ||
        a.fdcId - b.fdcId,
    );
    for (const c of rest)
      if (nearIdentical(first!.per100, c.per100)) {
        sourceDropped.add(c.id);
        excludeCandidate(c, "source-variant (near-identical values)");
      }
  }
  let kept = candidates.filter((c) => !sourceDropped.has(c.id));

  // 2. Named near-identical variants (decaffeinated, reduced sodium, …),
  // again only when the values confirm it.
  const offered = new Map(
    kept.filter((c) => c.source === "fndds").map((c) => [c.description, c]),
  );
  kept = kept.filter((c) => {
    if (c.source !== "fndds") return true;
    for (const v of EQUIVALENT_VARIANTS) {
      if (!v.remove.test(c.description)) continue;
      const other = offered.get(
        tidy(
          c.description.replace(v.remove, v.replace ?? "").replace(/ ,/g, ","),
        ).replace(/,$/, ""),
      );
      if (other && other !== c && nearIdentical(other.per100, c.per100))
        return excludeCandidate(c, v.reason);
    }
    return true;
  });

  // 3. Mixed foods are offered a limited number of qualifiers deep (a
  // purchase-source qualifier such as "from restaurant" doesn't count).
  kept = kept.filter((c) => {
    const limit = MAX_QUALIFIERS[c.family];
    const qualifiers = (
      c.description.replace(SOURCE_QUALIFIER, "").match(/[,;]/g) ?? []
    ).length;
    if (c.source === "fndds" && limit !== undefined && qualifiers > limit)
      return excludeCandidate(
        c,
        `mixed-food-detail (more than ${limit} qualifiers)`,
      );
    return true;
  });

  // One name, one food: an SR record whose display name matches an FNDDS
  // record is left out; any other collision is a rule error to fix.
  const byName = new Map<string, CatalogFood[]>();
  for (const c of kept) {
    const key = c.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  const drop = new Set<string>();
  const collisions: string[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const fndds = group.filter((c) => c.source === "fndds");
    if (fndds.length)
      for (const c of group.filter((c) => c.source === "sr")) {
        drop.add(c.id);
        exclusions.push({
          id: c.id,
          source: c.source,
          description: c.description,
          reason: "duplicate-name (FNDDS preferred)",
        });
      }
    const rest = group.filter((c) => !drop.has(c.id));
    if (rest.length > 1)
      collisions.push(rest.map((c) => `${c.id} "${c.name}"`).join(" / "));
  }
  if (collisions.length)
    throw new Error(`Display-name collisions:\n  ${collisions.join("\n  ")}`);
  kept = kept.filter((c) => !drop.has(c.id));

  kept.sort((a, b) => a.id.localeCompare(b.id, "en"));
  exclusions.sort((a, b) => a.id.localeCompare(b.id, "en"));
  return { foods: kept, exclusions, inputs: counts };
}

/** Catalog asset format, version 1: one compact row per food. */
export const FORMAT_VERSION = 1;
export type CatalogRow = [
  id: string,
  name: string,
  description: string,
  family: number,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  portions: [string, number][],
  rank: number,
];
export function encodeRow(f: CatalogFood): CatalogRow {
  return [
    f.id,
    f.name,
    f.description === f.name ? "" : f.description,
    FAMILIES.indexOf(f.family),
    f.per100.kcal,
    f.per100.protein,
    f.per100.carbs,
    f.per100.fat,
    f.portions.map((p) => [p.label, p.grams]),
    f.rank,
  ];
}

/** The catalog file: stable bytes for the same inputs (one food per line). */
export function serializeCatalog(
  catalogVersion: string,
  releases: Record<SourceKey, string>,
  foods: CatalogFood[],
  featured: string[],
) {
  const head = {
    formatVersion: FORMAT_VERSION,
    catalogVersion,
    releases,
    families: FAMILIES,
    featured,
  };
  const rows = foods.map((f) => JSON.stringify(encodeRow(f)));
  return `${JSON.stringify(head).slice(0, -1)},"foods":[\n${rows.join(",\n")}\n]}\n`;
}
