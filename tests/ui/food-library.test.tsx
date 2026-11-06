import React from "react";
import { Alert, Linking } from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import * as catalog from "../../src/data/food-catalog";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";

// Phase 7B WP4A.1: the built-in USDA food library inside Nutrition's Add
// food: first-use discovery, search, portions, one-tap logging with Undo,
// personal copies, provenance on reopened entries and failure handling.

jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ kind: "nutrition" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));
jest.spyOn(Alert, "alert").mockImplementation(() => {});

const today = localDate();
const CHICKEN =
  "Chicken breast, baked, broiled, or roasted, skin not eaten, from raw";
const EGG = "Egg, whole, boiled or poached";
let fetchCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  fetchCalls = 0;
  // Nothing in the library may reach the network.
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error("offline");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
function setup() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const entries = (r: ReturnType<typeof setup>["r"]) => r.journal("nutrition");
/** Opens a meal in place (Phase 7.3B: meals expand to show their foods). */
async function expand(view: RenderResult, meal: string) {
  await fireEvent.press(
    view.getByRole("button", { name: new RegExp(`^${meal}, `) }),
  );
}

test("a new lifter finds an ordinary food, weighs it in grams and logs it, offline", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    // First use: no recent or saved foods, but common foods are ready.
    expect(view.getByText(/Foods you log appear here/)).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Common foods · USDA" }),
    ).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Search foods"),
      "chicken breast",
    );
    expect(
      view.getByRole("header", { name: "Food library · USDA" }),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`${CHICKEN}, 100 g, 161 kcal, 30 g protein`),
    );
    expect(view.getByRole("header", { name: CHICKEN })).toBeTruthy();
    expect(view.getByText(/^Per 100 g: 161 kcal/)).toBeTruthy();
    expect(
      view.getByLabelText("161 kcal, protein 30 g, carbs 0 g, fat 4 g, 100 g"),
    ).toBeTruthy();
    // Typing grams updates the values at once.
    await fireEvent.changeText(view.getByLabelText("Grams"), "150");
    expect(
      view.getByLabelText("242 kcal, protein 45 g, carbs 0 g, fat 5 g, 150 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Increase Grams by 10"));
    expect(view.getByLabelText(/^258 kcal, .*, 160 g$/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Decrease Grams by 10"));
    await pressTwiceInOneFrame(view, `Add ${CHICKEN} to Lunch`);
    expect(entries(r)).toHaveLength(1);
    expect(entries(r)[0]!.date).toBe(today);
    expect(entries(r)[0]!.data).toEqual({
      name: CHICKEN,
      meal: "Lunch",
      calories: 241.5,
      protein: 45.3,
      carbs: 0,
      fat: 5.28,
      quantity: 1,
      serving: "150 g",
      sourceId: "fndds:2705956",
      sourceCatalog: "2026.1",
      sourceGrams: 150,
    });
    // Back in the list with the query kept, the food shows as added.
    expect(view.getByLabelText("Search foods").props.value).toBe(
      "chicken breast",
    );
    expect(view.getByLabelText(`Undo adding ${CHICKEN}`)).toBeTruthy();
    // Nothing is written to the user's foods unless asked.
    expect(r.journal("food")).toHaveLength(0);
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("a household portion keeps its documented weight: two eggs are 100 g", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await fireEvent.press(
      view.getByLabelText(`${EGG}, 100 g, 143 kcal, 12 g protein`),
    );
    await fireEvent.press(view.getByRole("button", { name: "1 egg · 50 g" }));
    expect(view.getByLabelText(/^72 kcal, .*, 50 g$/)).toBeTruthy();
    for (let i = 0; i < 4; i++)
      await fireEvent.press(view.getByLabelText("Increase Portions by 0.25"));
    expect(
      view.getByLabelText("143 kcal, protein 12 g, carbs 1 g, fat 10 g, 100 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Add ${EGG} to Breakfast`));
    const [entry] = entries(r);
    expect(entry!.data).toMatchObject({
      name: EGG,
      meal: "Breakfast",
      calories: 71.5,
      protein: 6.2,
      quantity: 2,
      serving: "1 egg (50 g)",
      sourceGrams: 50,
    });
    // Reopened, the entry explains its portion plainly.
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<JournalScreen />);
    await expand(view, "Breakfast");
    await fireEvent.press(
      view.getByLabelText(/^Egg, whole, boiled or poached, 2 × 1 egg \(50 g\)/),
    );
    expect(view.getByRole("header", { name: "Edit entry" })).toBeTruthy();
    expect(
      view.getByText("From USDA FNDDS · FDC 2707154 · 2 × 50 g = 100 g"),
    ).toBeTruthy();
    expect(view.getByLabelText("Serving size (optional)").props.value).toBe(
      "1 egg (50 g)",
    );
  } finally {
    db.close();
  }
});

test("+ logs 100 g in one tap; a double tap logs once; Undo removes exactly that entry", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Snacks"));
    await pressTwiceInOneFrame(view, "Add 100 g of Banana, raw");
    expect(entries(r)).toHaveLength(1);
    expect(entries(r)[0]!.data).toMatchObject({
      name: "Banana, raw",
      meal: "Snacks",
      calories: 97,
      quantity: 1,
      serving: "100 g",
      sourceId: "fndds:2709224",
    });
    await fireEvent.press(view.getByLabelText("Undo adding Banana, raw"));
    expect(entries(r)).toHaveLength(0);
    expect(view.getByLabelText("Add 100 g of Banana, raw")).toBeTruthy();
    // Undone, it can be added again.
    await fireEvent.press(view.getByLabelText("Add 100 g of Banana, raw"));
    expect(entries(r)).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("a library food can be saved as a personal copy, once; logged entries never depend on it", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await fireEvent.changeText(view.getByLabelText("Search foods"), "oats dry");
    await fireEvent.press(
      view.getByLabelText(/^Oats, rolled or quick, dry \(uncooked\), 100 g/),
    );
    await fireEvent.changeText(view.getByLabelText("Grams"), "40");
    await pressTwiceInOneFrame(
      view,
      "Save Oats, rolled or quick, dry (uncooked) to my foods",
    );
    expect(r.journal("food").map((f) => f.data)).toEqual([
      {
        name: "Oats, rolled or quick, dry (uncooked)",
        calories: 151.6,
        protein: 5.28,
        carbs: 27.08,
        fat: 2.608,
        quantity: 1,
        serving: "40 g",
        sourceId: "sr:173904",
        sourceCatalog: "2026.1",
        sourceGrams: 40,
      },
    ]);
    expect(view.getByLabelText("Saved to your foods")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(
        "Add Oats, rolled or quick, dry (uncooked) to Breakfast",
      ),
    );
    // The personal copy is offered under Saved foods, ahead of the library.
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    expect(
      view.getByLabelText("Add Oats, rolled or quick, dry (uncooked)"),
    ).toBeTruthy();
    expect(entries(r)).toHaveLength(1);
    r.deleteJournal(r.journal("food")[0]!.id);
    expect(entries(r)).toHaveLength(1);
    expect(entries(r)[0]!.data.calories).toBe(151.6);
  } finally {
    db.close();
  }
});

test("recent and saved foods come before library results", async () => {
  const { r, db } = setup();
  try {
    r.addJournal("food", {
      name: "Chicken breast (meal prep)",
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      quantity: 1,
      serving: "100 g",
    });
    r.addJournal(
      "nutrition",
      {
        name: "Chicken wrap",
        calories: 400,
        protein: 30,
        carbs: 40,
        fat: 12,
        quantity: 1,
        meal: "Lunch",
      },
      today,
    );
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Add food" }));
    await fireEvent.changeText(view.getByLabelText("Search foods"), "chicken");
    const headers = view
      .getAllByRole("header")
      .map((h) => String(h.props.children));
    expect(
      headers.filter((h) => /Eaten before|Saved foods|Food library/.test(h)),
    ).toEqual(["Eaten before", "Saved foods", "Food library · USDA"]);
    expect(view.getByLabelText("Add Chicken wrap")).toBeTruthy();
    expect(view.getByLabelText("Add Chicken breast (meal prep)")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("amounts out of range are refused and nothing is logged", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Dinner"));
    await fireEvent.changeText(
      view.getByLabelText("Search foods"),
      "olive oil",
    );
    await fireEvent.press(view.getByLabelText(/^Olive oil, 100 g/));
    await fireEvent.changeText(view.getByLabelText("Grams"), "6000");
    expect(view.getByText("Enter a number from 0.1 to 5000")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Grams"), "5000");
    expect(view.getByText(/more than one entry can hold/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Add Olive oil to Dinner"));
    expect(entries(r)).toHaveLength(0);
    await fireEvent.changeText(view.getByLabelText("Grams"), "14");
    await fireEvent.press(view.getByLabelText("Add Olive oil to Dinner"));
    expect(entries(r)[0]!.data).toMatchObject({ calories: 126, fat: 14 });
  } finally {
    db.close();
  }
});

test("editing a logged library food labels changed values as based on USDA", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await fireEvent.press(view.getByLabelText("Add 100 g of Banana, raw"));
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<JournalScreen />);
    await expand(view, "Lunch");
    await fireEvent.press(view.getByLabelText(/^Banana, raw, 100 g/));
    expect(
      view.getByText("From USDA FNDDS · FDC 2709224 · 1 serving = 100 g"),
    ).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "105");
    await fireEvent.press(view.getByLabelText("Save entry"));
    expect(entries(r)[0]!.data).toMatchObject({
      calories: 105,
      sourceId: "fndds:2709224",
      sourceEdited: true,
      sourceGrams: 100,
    });
    await view.rerender(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Banana, raw, 100 g/));
    expect(
      view.getByText(
        "Based on USDA FNDDS · FDC 2709224 (values edited) · 1 serving = 100 g",
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("if the library can't be opened, personal foods still work and Try again recovers", async () => {
  const { r, db } = setup();
  const spy = jest
    .spyOn(catalog, "tryLoadFoodLibrary")
    .mockReturnValue({ error: "The food library is damaged (test)." });
  try {
    r.addJournal("food", {
      name: "Skyr",
      calories: 105,
      protein: 17.5,
      carbs: 6,
      fat: 0.2,
      quantity: 1,
      serving: "150 g",
    });
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    expect(view.getByText("The food library is damaged (test).")).toBeTruthy();
    expect(
      view.queryByRole("header", { name: "Common foods · USDA" }),
    ).toBeNull();
    await fireEvent.press(view.getByLabelText("Add Skyr"));
    expect(entries(r)).toHaveLength(1);
    spy.mockRestore();
    await fireEvent.press(
      view.getByLabelText("Try loading the food library again"),
    );
    expect(
      view.getByRole("header", { name: "Common foods · USDA" }),
    ).toBeTruthy();
  } finally {
    spy.mockRestore();
    db.close();
  }
});

test("the source link opens FoodData Central only when asked", async () => {
  const { db } = setup();
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await fireEvent.press(
      view.getByLabelText(`${EGG}, 100 g, 143 kcal, 12 g protein`),
    );
    expect(open).not.toHaveBeenCalled();
    expect(
      view.getByText(
        /^Source: USDA FoodData Central, FNDDS 2021-2023 \(2024-10-31\), FDC 2707154\./,
      ),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`View ${EGG} on FoodData Central`),
    );
    expect(open).toHaveBeenCalledWith(
      "https://fdc.nal.usda.gov/food-details/2707154/nutrients",
    );
  } finally {
    open.mockRestore();
    db.close();
  }
});
