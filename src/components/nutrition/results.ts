import {
  amount,
  gramsText,
  kcalText,
  type FoodChoice,
} from "../../domain/nutrition";
import type { LibraryFood } from "../../domain/food-library";

// Food discovery results (Phase 7.3D): one presentation shape for every
// source, so rows never assume a food is generic. Today's sources are the
// lifter's recent and saved foods and the built-in USDA library. A branded
// catalogue (7.3E) and barcode lookups (7.3F) add sources here without
// changing the rows. Fields are filled only from data a source really has:
// nothing (brand, barcode, completeness) is inferred or invented.

export type ResultSource = "recent" | "saved" | "library";

export type FoodResult = {
  /** Stable list key, unique across sources. */
  key: string;
  source: ResultSource;
  /** Exact name as stored or published. */
  title: string;
  /** Manufacturer or brand, only when the source records one. */
  brand?: string;
  /** Barcode (GTIN), only when the source records one. */
  barcode?: string;
  /** "1 medium · 105 kcal": what one tap logs, and its energy. */
  detail: string;
  /** Where the values come from, when not the lifter's own ("USDA"). */
  provenance?: string;
  /** Spoken row label (kept stable for screen readers and tests). */
  label: string;
  /** Spoken label of the one-tap add. */
  addLabel: string;
  /** Spoken label of Undo after an add. */
  undoLabel: string;
  /** What tapping the row does. */
  hint: string;
};

/** "1 medium", "2 × 40 g", "1 serving": a food's usual portion. */
export const choicePortion = (f: Pick<FoodChoice, "quantity" | "serving">) =>
  f.serving
    ? f.quantity === 1
      ? f.serving
      : `${amount(f.quantity)} × ${f.serving}`
    : `${amount(f.quantity)} ${f.quantity === 1 ? "serving" : "servings"}`;

/** A recent or saved food, at the servings it is usually eaten. */
export function choiceResult(food: FoodChoice): FoodResult {
  const portion = choicePortion(food);
  const kcal = kcalText(food.calories * food.quantity);
  return {
    key: `${food.source}:${food.key}`,
    source: food.source,
    title: food.name,
    detail: `${portion} · ${kcal}`,
    // Logged from the library before: still a USDA value.
    provenance: food.meta?.sourceId
      ? food.meta.sourceEdited
        ? "Based on USDA"
        : "USDA"
      : undefined,
    label: `${food.name}, ${portion}, ${kcal}`,
    addLabel: `Add ${food.name}`,
    undoLabel: `Undo adding ${food.name}`,
    hint: "Choose servings and meal before adding",
  };
}

/** A built-in library food, shown per 100 g as published. */
export function libraryResult(food: LibraryFood): FoodResult {
  const kcal = kcalText(food.kcal);
  return {
    key: `lib:${food.id}`,
    source: "library",
    title: food.name,
    detail: `100 g · ${kcal} · ${gramsText(food.protein)} protein`,
    provenance: "USDA",
    label: `${food.name}, 100 g, ${kcal}, ${gramsText(food.protein)} protein`,
    addLabel: `Add 100 g of ${food.name}`,
    undoLabel: `Undo adding ${food.name}`,
    hint: "Choose a portion and meal before adding",
  };
}
