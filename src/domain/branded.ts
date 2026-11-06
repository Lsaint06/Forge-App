// The bundled branded-food catalogue (Phase 7.3E): what the app and the
// build pipeline share. The catalogue itself is a read-only SQLite file built
// from USDA FoodData Central Branded Foods by scripts/branded-catalog and
// shipped inside the app; see docs/audits/PHASE_7_3E_BRANDED_FOOD_ARCHITECTURE.md.
import type { LibraryFood, LibraryPortion } from "./food-library";
import type { ServingSource } from "./servings";

/** The catalogue layout this build reads. Bumped on any table change. */
export const BRANDED_SCHEMA = 4;

/** Namespace of a branded product's source identity ("usda-branded:2758974"). */
export const BRANDED_PREFIX = "usda-branded";

/** True for a source identity from the branded catalogue. */
export const isBrandedId = (id: string | undefined) =>
  !!id && id.startsWith(`${BRANDED_PREFIX}:`);

/** The catalogue version recorded on entries ("usda-branded-2026-04-30"). */
export const brandedCatalogVersion = (release: string) =>
  `${BRANDED_PREFIX}-${release}`;

/**
 * Lower case, no accents or apostrophes, words only: the form brand and
 * category keys are stored in, and queries are compared in. The build and
 * the app must use this same function.
 */
export function catalogKey(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One product as stored: values per 100 g (basis "g") or 100 ml ("ml"). */
export type BrandedProduct = {
  /** Row id: the catalogue's static order. Not stable across releases. */
  id: number;
  /** USDA FoodData Central ID: stable within a published label version. */
  fdcId: number;
  name: string;
  brand: string;
  basis: "g" | "ml";
  /** One manufacturer serving, in the basis unit. */
  serving: number;
  /** Household serving text as published ("1.15 oz", "1 bar"), or "". */
  household: string;
  /** The serving's name ("1 stick", "1 package", "1 serving"). */
  servingLabel: string;
  /** Where that name comes from (domain/servings.ts). */
  servingSource: ServingSource;
  /** The whole package, in the basis unit, when it is a few servings. */
  package?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Canonical GTIN-14, when the product has a valid barcode. */
  gtin?: string;
};

/** The whole package's portion name. */
export const WHOLE_PACKAGE = "whole package";

/**
 * A branded product as a library food, so it is chosen, measured and logged
 * exactly like a generic one. Its first portion is one manufacturer serving
 * under its catalogue name ("1 stick (32 g)", "1 serving (28 g)"); a whole
 * package follows when the package is a few servings. Amounts are in the
 * product's own unit (grams or millilitres). Brand and barcode are carried
 * only when the product has them.
 */
export function brandedFood(p: BrandedProduct): LibraryFood {
  const portion = (label: string, amount: number): LibraryPortion =>
    p.basis === "ml" ? { label, ml: amount } : { label, grams: amount };
  return {
    id: `${BRANDED_PREFIX}:${p.fdcId}`,
    name: p.name,
    description: p.name,
    family: "branded",
    kcal: p.kcal,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    portions: [
      portion(p.servingLabel, p.serving),
      ...(p.package ? [portion(WHOLE_PACKAGE, p.package)] : []),
    ],
    rank: 0,
    basis: p.basis,
    brand: p.brand,
    ...(p.gtin ? { barcode: p.gtin } : {}),
    servingInfo: {
      source: p.servingSource,
      household: p.household,
      ...(p.package ? { servingsPerPackage: p.package / p.serving } : {}),
    },
  };
}

/** What the food step says about a branded serving's name, or undefined. */
export function servingNote(food: LibraryFood) {
  const info = food.servingInfo;
  if (!info) return undefined;
  if (info.source === "sibling")
    return "Serving name from another listing of this product";
  if (info.source === "package") return "The package holds one serving";
  if (info.source === "about") return "Count as printed on the label";
  if (info.source === "serving" && info.household)
    return `Label serving: ${info.household}`;
  return undefined;
}
