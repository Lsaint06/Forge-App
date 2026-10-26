import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { searchBranded } from "../../src/data/branded-catalog";
import { brandedFood, catalogKey } from "../../src/domain/branded";
import type { LibraryFood } from "../../src/domain/food-library";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";

// Phase 7.3E: branded products in Nutrition's Add food. The catalogue is
// mocked here (it is native SQLite; its queries are tested in
// branded-catalog.test.ts): these tests pin the journey from search to a
// logged, reopened entry, and the states around it.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
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

const today = localDate();
const QUEST = brandedFood({
  id: 1,
  fdcId: 2758974,
  name: "PROTEIN BAR, COOKIES & CREAM",
  brand: "QUEST",
  basis: "g",
  serving: 60,
  household: "1 BAR",
  kcal: 350,
  protein: 35,
  carbs: 36.7,
  fat: 13.3,
  gtin: "00888849000708",
});
const MILK = brandedFood({
  id: 2,
  fdcId: 2626113,
  name: "WHOLE ULTRA-FILTERED MILK",
  brand: "FAIRLIFE",
  basis: "ml",
  serving: 240,
  household: "1 cup (240 mL)",
  kcal: 62.5,
  protein: 5.42,
  carbs: 2.5,
  fat: 3.33,
});
const QUEST_ROW = "PROTEIN BAR, COOKIES & CREAM, QUEST, 1 BAR (60 g), 210 kcal";
const QUEST_ADD = "Add 1 BAR (60 g) of PROTEIN BAR, COOKIES & CREAM";

/** A catalogue holding these products, searched by brand and name. */
function catalogue(foods: LibraryFood[]) {
  jest.mocked(searchBranded).mockImplementation(async (query, offset = 0) => {
    const words = catalogKey(query).split(" ").filter(Boolean);
    if (words.join("").length < 2) return null;
    const hits = foods.filter((f) =>
      words.every((w) => catalogKey(`${f.brand} ${f.name}`).includes(w)),
    );
    return {
      foods: hits.slice(offset, offset + 30),
      total: hits.length,
      broad: false,
    };
  });
}

let fetchCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  fetchCalls = 0;
  // Branded foods are bundled: nothing may reach the network.
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error("offline");
  }) as typeof fetch;
  catalogue([QUEST, MILK]);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function setup() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const entries = (r: ReturnType<typeof setup>["r"]) => r.journal("nutrition");
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
/** The text a header shows. */
function textOf(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? c.join("") : String(c ?? "");
}
async function search(view: RenderResult, text: string) {
  await fireEvent.changeText(view.getByLabelText("Search foods"), text);
}
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}

test("a branded product is found by brand, logged at its label serving in one tap, once, with Undo", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await search(view, "quest");
    expect(
      view.getByRole("header", { name: "Brands · USDA Branded" }),
    ).toBeTruthy();
    expect(view.getByText("1 product")).toBeTruthy();
    expect(view.getByLabelText(QUEST_ROW)).toBeTruthy();
    expect(view.getByText("QUEST")).toBeTruthy();
    expect(view.getByText("USDA Branded")).toBeTruthy();
    // Selecting nothing logs nothing; a double tap logs once.
    expect(entries(r)).toHaveLength(0);
    await pressTwiceInOneFrame(view, QUEST_ADD);
    expect(entries(r)).toHaveLength(1);
    const [entry] = entries(r);
    expect(entry!.date).toBe(today);
    expect(entry!.data).toEqual({
      name: "PROTEIN BAR, COOKIES & CREAM",
      meal: "Breakfast",
      calories: 210,
      protein: 21,
      carbs: 22.02,
      fat: 7.98,
      quantity: 1,
      serving: "1 BAR (60 g)",
      sourceId: "usda-branded:2758974",
      sourceCatalog: "usda-branded-2026-04-30",
      sourceGrams: 60,
      sourceBrand: "QUEST",
      sourceBarcode: "00888849000708",
    });
    await fireEvent.press(
      view.getByLabelText("Undo adding PROTEIN BAR, COOKIES & CREAM"),
    );
    expect(entries(r)).toHaveLength(0);
    expect(view.getByLabelText(QUEST_ADD)).toBeTruthy();
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("a per-100 ml product is measured in millilitres; the amount, values, meal and day are clear before logging", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await search(view, "fairlife");
    await fireEvent.press(
      view.getByLabelText(
        "WHOLE ULTRA-FILTERED MILK, FAIRLIFE, 1 cup (240 ml), 150 kcal",
      ),
    );
    // Opens on the label serving, in millilitres, with the brand.
    expect(view.getByText("FAIRLIFE")).toBeTruthy();
    expect(
      view.getByText("Per 100 ml: 63 kcal · P 5.42 g · C 2.5 g · F 3.33 g"),
    ).toBeTruthy();
    expect(view.getByRole("button", { name: "1 cup · 240 ml" })).toBeTruthy();
    expect(
      view.getByLabelText("150 kcal, protein 13 g, carbs 6 g, fat 8 g, 240 ml"),
    ).toBeTruthy();
    expect(view.queryByRole("button", { name: "Grams" })).toBeNull();
    // Choosing millilitres measures exactly that; the values follow.
    await fireEvent.press(view.getByRole("button", { name: "Millilitres" }));
    expect(
      view.getByLabelText("63 kcal, protein 5 g, carbs 3 g, fat 3 g, 100 ml"),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Increase Millilitres by 10"));
    expect(view.getByText("For 110 ml")).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "Lunch" }));
    expect(view.getByText(/Logs to Lunch · Today/)).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
    await fireEvent.press(
      view.getByLabelText("Add WHOLE ULTRA-FILTERED MILK to Lunch"),
    );
    const [entry] = entries(r);
    expect(entry!.date).toBe(today);
    expect(entry!.data).toMatchObject({
      meal: "Lunch",
      serving: "110 ml",
      quantity: 1,
      calories: 68.75,
      sourceMl: 110,
      sourceBrand: "FAIRLIFE",
    });
    expect("sourceGrams" in entry!.data).toBe(false);
    // Reopened, the entry says what it is and where it came from.
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: /^Lunch, / }));
    await fireEvent.press(
      view.getByLabelText(/^WHOLE ULTRA-FILTERED MILK, 110 ml/),
    );
    expect(view.getByRole("header", { name: "Edit entry" })).toBeTruthy();
    expect(
      view.getByText(
        "FAIRLIFE · From USDA Branded Foods · FDC 2626113 · 1 serving = 110 ml",
      ),
    ).toBeTruthy();
    // Editing keeps the snapshot's provenance.
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "70");
    await fireEvent.press(view.getByLabelText("Save entry"));
    expect(entries(r)[0]!.data).toMatchObject({
      calories: 70,
      sourceId: "usda-branded:2626113",
      sourceBrand: "FAIRLIFE",
      sourceMl: 110,
      sourceEdited: true,
    });
  } finally {
    db.close();
  }
});

test("a branded product can be saved as the lifter's own food and found again by brand", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Snacks"));
    await search(view, "quest");
    await fireEvent.press(view.getByLabelText(QUEST_ROW));
    await fireEvent.press(
      view.getByLabelText("Save PROTEIN BAR, COOKIES & CREAM to my foods"),
    );
    expect(view.getByText("Saved to your foods")).toBeTruthy();
    expect(r.journal("food")).toHaveLength(1);
    expect(r.journal("food")[0]!.data).toMatchObject({
      serving: "1 BAR (60 g)",
      sourceBrand: "QUEST",
      sourceBarcode: "00888849000708",
    });
    expect(entries(r)).toHaveLength(0);
    // Back in the list, the saved copy leads, with its brand.
    await fireEvent.press(view.getByLabelText("Back to foods"));
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    expect(view.getAllByText("QUEST").length).toBeGreaterThanOrEqual(2);
  } finally {
    db.close();
  }
});

test("branded results come after the lifter's foods and the common foods", async () => {
  const { r, db } = setup();
  try {
    r.addJournal("food", {
      name: "Greek yogurt bowl, my prep",
      calories: 200,
      protein: 20,
      carbs: 15,
      fat: 5,
      quantity: 1,
      serving: "1 bowl",
    });
    catalogue([
      brandedFood({
        id: 3,
        fdcId: 2340001,
        name: "GREEK YOGURT, VANILLA",
        brand: "CHOBANI",
        basis: "g",
        serving: 150,
        household: "1 CONTAINER",
        kcal: 80,
        protein: 8.67,
        carbs: 10,
        fat: 0,
      }),
    ]);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await search(view, "greek yogurt");
    const titles = view
      .getAllByRole("header")
      .map((h) => h.props.accessibilityLabel ?? textOf(h));
    const at = (t: string) => titles.indexOf(t);
    expect(at("Saved foods")).toBeGreaterThanOrEqual(0);
    expect(at("Food library · USDA")).toBeGreaterThan(at("Saved foods"));
    expect(at("Brands · USDA Branded")).toBeGreaterThan(
      at("Food library · USDA"),
    );
  } finally {
    db.close();
  }
});
test("when branded foods can't be opened, everything else still works and Try again recovers", async () => {
  const { r, db } = setup();
  try {
    jest
      .mocked(searchBranded)
      .mockRejectedValueOnce(
        new Error(
          "Branded foods couldn't be opened. Your logs are safe; try again.",
        ),
      );
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await search(view, "quest");
    expect(view.getByText(/Branded foods couldn't be opened/)).toBeTruthy();
    expect(view.queryByText("No matches")).toBeNull();
    await fireEvent.press(
      view.getByLabelText("Try loading branded foods again"),
    );
    expect(view.getByLabelText(QUEST_ROW)).toBeTruthy();
    // The generic library never depended on it.
    await search(view, "banana");
    expect(
      view.getByRole("header", { name: "Food library · USDA" }),
    ).toBeTruthy();
    expect(r.journal()).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("No matches appears only once the branded search has answered", async () => {
  const { db } = setup();
  try {
    let answer!: (v: null) => void;
    jest
      .mocked(searchBranded)
      .mockImplementationOnce(() => new Promise((res) => (answer = res)));
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await search(view, "zzqx");
    expect(view.queryByText("No matches")).toBeNull();
    await act(async () => answer(null));
    expect(view.getByText("No matches")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("compact iPhones and large text: branded rows and their controls stay reachable", async () => {
  const { db } = setup();
  try {
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await search(view, "quest");
    const add = flat(view.getByLabelText(QUEST_ADD));
    expect(Number(add.width)).toBeGreaterThanOrEqual(44);
    expect(Number(add.height)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(view.getByLabelText(QUEST_ROW));
    for (const label of [
      "Decrease Portions by 0.25",
      "Increase Portions by 0.25",
      "Back to foods",
      "Add PROTEIN BAR, COOKIES & CREAM to Lunch",
    ]) {
      const s = flat(view.getByLabelText(label));
      expect(Number(s.minHeight ?? s.height)).toBeGreaterThanOrEqual(44);
    }
    expect(
      view.getByText(
        /Branded Foods \(2026-04-30\), FDC 2758974, barcode 00888849000708/,
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});
