import { decodeLibrary, type FoodLibrary } from "../domain/food-library";

// Loads the bundled food library on first use: the catalog is parsed and
// indexed when Nutrition first needs it, never at app start, and then kept
// in memory. It is read-only and entirely offline.
//
// The catalog ships as one JSON string (catalog.js, generated from the
// reviewable catalog.json) because JSON.parse is several times faster than
// evaluating the same data as an object literal (measured on the emulator).

let cached: FoodLibrary | undefined;

export function loadFoodLibrary(): FoodLibrary {
  // Required lazily so the catalog module only runs when it's needed.
  cached ??= decodeLibrary(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    JSON.parse(require("./food-library/catalog.js") as string),
  );
  return cached;
}

/** The library, or why it couldn't be opened. */
export function tryLoadFoodLibrary():
  { library: FoodLibrary } | { error: string } {
  try {
    return { library: loadFoodLibrary() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
