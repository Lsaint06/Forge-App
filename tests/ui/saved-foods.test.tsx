import React from "react";
import { StyleSheet } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
import { router } from "expo-router";
import SavedFoods from "../../src/screens/SavedFoods";
import { confirm } from "../../src/state";
import { brandedFood } from "../../src/domain/branded";
import {
  correctionDraft,
  correctionOf,
  labelDraftForBarcode,
  readLabelDraft,
} from "../../src/domain/personal-foods";
import { theme } from "../../src/theme";
import { localDate } from "../../src/domain/types";
import { pathRepository } from "../path-fixture";

// Phase 7.3G G1: the REFORGE Saved foods screen. Search, filters, the
// existing editors and the delete / remove-correction rules, on a real
// repository with ordinary foods, a personal barcode food and a correction.

const mockProfile: { theme: "dark" | "light" } = { theme: "dark" };
// Like the app's store: useRepo re-renders on every saved change (revision).
const mockStore: {
  repo: unknown;
  listeners: Set<() => void>;
} = { repo: undefined, listeners: new Set() };
jest.mock("../../src/state", () => {
  const React = jest.requireActual("react");
  const touch = () => mockStore.listeners.forEach((l) => l());
  return {
    useRepo: jest.fn(() => {
      const [, set] = React.useState(0);
      React.useEffect(() => {
        const l = () => set((n: number) => n + 1);
        mockStore.listeners.add(l);
        return () => mockStore.listeners.delete(l);
      }, []);
      return mockStore.repo;
    }),
    mutate: (fn: () => unknown) => {
      const v = fn();
      touch();
      return v;
    },
    // Confirmations are accepted, as the lifter would.
    confirm: jest.fn((_t: string, _m: string, fn: () => void) => {
      fn();
      touch();
    }),
    useApp: Object.assign(
      (selector: (s: { revision: number; profile: unknown }) => unknown) =>
        selector({ revision: 0, profile: { ...mockProfile } }),
      { getState: () => ({ touch }) },
    ),
  };
});
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ kind: "food" }),
}));

const today = localDate();
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
  serving: "40 g",
};
const banana = {
  name: "Banana",
  calories: 105,
  protein: 1.3,
  carbs: 27,
  fat: 0.4,
  quantity: 1,
  serving: "1 medium",
};
const COKE = brandedFood({
  id: 7,
  fdcId: 2412345,
  name: "Coca-Cola Can, 12 fl oz",
  brand: "Coca-Cola",
  basis: "ml",
  serving: 355,
  household: "1 can",
  servingLabel: "1 can",
  servingSource: "label",
  kcal: 39.4,
  protein: 0,
  carbs: 10.98,
  fat: 0,
  gtin: "00049000006346",
});

function setup({ plain = true, personal = true, correction = true } = {}) {
  const fixture = pathRepository();
  const { r } = fixture;
  r.saveProfile({ onboarded: true });
  if (plain) {
    r.addJournal("food", { ...oats });
    r.addJournal("food", { ...banana });
  }
  if (personal) {
    const made = readLabelDraft(
      {
        ...labelDraftForBarcode("00078000082401"),
        name: "Dr Pepper",
        brand: "Keurig Dr Pepper",
        household: "1 can",
        unit: "ml",
        amount: "355",
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "food" },
    );
    if (!("data" in made)) throw new Error("draft");
    r.addJournal("food", made.data);
  }
  if (correction) {
    const fixed = readLabelDraft(
      {
        ...correctionDraft(COKE),
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "correction", of: correctionOf(COKE, "usda-branded-2026-04-30") },
    );
    if (!("data" in fixed)) throw new Error("draft");
    r.addJournal("food", fixed.data);
  }
  mockStore.repo = r;
  return fixture;
}
const names = (view: RenderResult) =>
  view
    .getAllByLabelText(/^Edit /)
    .map((e) => String(e.props.accessibilityLabel).replace(/^Edit /, ""));
/** The ••• menu runs its action once it has closed (as in nutrition.test). */
async function menu(view: RenderResult, name: string, item: string) {
  await fireEvent.press(view.getByLabelText(`Options for ${name}`));
  await fireEvent.press(view.getByRole("menuitem", { name: item }));
}
const confirmed = (n: number) =>
  waitFor(() => expect(jest.mocked(confirm).mock.calls.length).toBe(n), {
    timeout: 3000,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.theme = "dark";
});

test("a REFORGE sub-screen: title, count, Back, search, filters and every food with its values", async () => {
  const { db } = setup();
  try {
    const view = await render(<SavedFoods />);
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    expect(view.getByText("4 foods")).toBeTruthy();
    expect(view.getByLabelText("Search saved foods")).toBeTruthy();
    for (const tab of [
      "All, 4 foods",
      "Your labels, 1 food",
      "Corrections, 1 food",
    ])
      expect(view.getByRole("tab", { name: tab })).toBeTruthy();
    // Name order; brand, serving, macros and calories as saved (per serving).
    expect(names(view)).toEqual([
      "Banana",
      "Coca-Cola Can, 12 fl oz",
      "Dr Pepper",
      "Oats",
    ]);
    expect(view.getByText("Keurig Dr Pepper")).toBeTruthy();
    expect(
      view.getByText(
        "40 g · P\u00a05\u00a0g · C\u00a027\u00a0g · F\u00a03\u00a0g",
      ),
    ).toBeTruthy();
    expect(
      view.getAllByText(
        "1 can (355 ml) · P\u00a00\u00a0g · C\u00a041\u00a0g · F\u00a00\u00a0g",
      ),
    ).toHaveLength(2);
    expect(view.getAllByText("150 kcal").length).toBe(3);
    // Understated source pills, only on the lifter's own label values.
    expect(view.getByText("Your label")).toBeTruthy();
    expect(view.getByText("Your correction")).toBeTruthy();
    // The row speaks everything it shows.
    expect(view.getByLabelText("Edit Dr Pepper").props.accessibilityHint).toBe(
      "Dr Pepper, Keurig Dr Pepper, 1 can (355 ml), 150 kcal, P 0 g · C 41 g · F 0 g, Your label",
    );
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

test("search filters by name, brand or serving, in any order and case; no match offers Show all", async () => {
  const { db } = setup();
  try {
    const view = await render(<SavedFoods />);
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "BAN",
    );
    expect(names(view)).toEqual(["Banana"]);
    expect(view.getByText("1 of 4")).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "keurig",
    );
    expect(names(view)).toEqual(["Dr Pepper"]);
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "can 1",
    );
    expect(names(view)).toEqual(["Coca-Cola Can, 12 fl oz", "Dr Pepper"]);
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "quinoa",
    );
    expect(view.getByText("No matching foods")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Show all saved foods" }),
    );
    expect(names(view)).toHaveLength(4);
    expect(view.getByLabelText("Search saved foods").props.value).toBe("");
  } finally {
    db.close();
  }
});

test("filters: Your labels and Corrections, combined with search; empty filters explain how to fill them", async () => {
  const { db } = setup();
  try {
    const view = await render(<SavedFoods />);
    await fireEvent.press(
      view.getByRole("tab", { name: "Your labels, 1 food" }),
    );
    expect(names(view)).toEqual(["Dr Pepper"]);
    expect(view.getByText("1 of 4")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("tab", { name: "Corrections, 1 food" }),
    );
    expect(names(view)).toEqual(["Coca-Cola Can, 12 fl oz"]);
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "pepper",
    );
    expect(view.getByText("No matching foods")).toBeTruthy();
    expect(view.getByText(/in this filter/)).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Show all saved foods" }),
    );
    expect(names(view)).toHaveLength(4);
  } finally {
    db.close();
  }
  const only = setup({ personal: false, correction: false });
  try {
    const view = await render(<SavedFoods />);
    await fireEvent.press(
      view.getByRole("tab", { name: "Corrections, 0 foods" }),
    );
    expect(view.getByText("No corrections yet")).toBeTruthy();
    expect(view.getByText(/choose Correct nutrition/)).toBeTruthy();
    await fireEvent.press(
      view.getByRole("tab", { name: "Your labels, 0 foods" }),
    );
    expect(view.getByText("No label foods yet")).toBeTruthy();
  } finally {
    only.db.close();
  }
});

test("editing uses the existing editors: plain foods the usual form, personal foods and corrections their label form", async () => {
  const { r, db } = setup();
  try {
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    const view = await render(<SavedFoods />);
    await fireEvent.press(view.getByLabelText("Edit Oats"));
    expect(view.getByRole("header", { name: "Edit saved food" })).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "160");
    await fireEvent.press(view.getByLabelText("Save food"));
    expect(r.journal("food").find((f) => f.data.name === "Oats")!.data).toEqual(
      { ...oats, calories: 160 },
    );
    expect(r.journal("nutrition")[0]!.data.calories).toBe(150);
    expect(view.getByText("160 kcal")).toBeTruthy();
    // A personal barcode food: its label form, barcode kept.
    await fireEvent.press(view.getByLabelText("Edit Dr Pepper"));
    expect(view.getByRole("header", { name: "Edit food" })).toBeTruthy();
    expect(
      view.getByLabelText("Barcode 078000082401, Linked barcode"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    // A correction, from its menu.
    await menu(view, "Coca-Cola Can, 12 fl oz", "Edit correction");
    expect(
      await view.findByRole(
        "header",
        { name: "Edit correction" },
        { timeout: 3000 },
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("delete and remove correction ask first, explain the effect on scans, and never touch logged entries", async () => {
  const { r, db } = setup();
  try {
    r.addJournal("nutrition", { ...banana, meal: "Snacks" }, today);
    const before = JSON.stringify(r.journal("nutrition"));
    const view = await render(<SavedFoods />);
    await menu(view, "Banana", "Delete");
    await confirmed(1);
    expect(jest.mocked(confirm).mock.calls[0]![0]).toBe("Delete saved food?");
    expect(jest.mocked(confirm).mock.calls[0]![1]).toMatch(/keep their values/);
    expect(names(view)).not.toContain("Banana");
    await menu(view, "Dr Pepper", "Delete");
    await confirmed(2);
    expect(jest.mocked(confirm).mock.calls[1]![1]).toMatch(
      /Product not found again/,
    );
    await menu(view, "Coca-Cola Can, 12 fl oz", "Remove correction");
    await confirmed(3);
    expect(jest.mocked(confirm).mock.calls[2]![0]).toBe("Remove correction?");
    expect(jest.mocked(confirm).mock.calls[2]![1]).toMatch(
      /USDA's values again/,
    );
    expect(jest.mocked(confirm).mock.calls[2]![3]).toEqual({
      action: "Remove correction",
    });
    expect(names(view)).toEqual(["Oats"]);
    expect(r.journal("food").map((f) => f.data.name)).toEqual(["Oats"]);
    expect(view.getByText("1 food")).toBeTruthy();
    expect(JSON.stringify(r.journal("nutrition"))).toBe(before);
  } finally {
    db.close();
  }
});

test("with nothing saved: an honest empty state and Create food opens the existing creator", async () => {
  const { r, db } = setup({ plain: false, personal: false, correction: false });
  try {
    const view = await render(<SavedFoods />);
    expect(view.getByText("No saved foods yet")).toBeTruthy();
    expect(view.queryByLabelText("Search saved foods")).toBeNull();
    expect(view.queryByRole("tab", { name: /^All/ })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Create food" }));
    expect(view.getByRole("header", { name: "New saved food" })).toBeTruthy();
    for (const [label, value] of [
      ["Food name", "Greek yogurt"],
      ["Calories (kcal)", "100"],
      ["Protein (g)", "17"],
      ["Carbs (g)", "6"],
      ["Fat (g)", "0"],
    ])
      await fireEvent.changeText(view.getByLabelText(label!), value!);
    await fireEvent.press(view.getByLabelText("Save food"));
    expect(r.journal("food")).toHaveLength(1);
    expect(names(view)).toEqual(["Greek yogurt"]);
    expect(view.queryByText("Your label")).toBeNull();
  } finally {
    db.close();
  }
});

test("opened directly, Back returns to Nutrition", async () => {
  const { db } = setup();
  try {
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    const view = await render(<SavedFoods />);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/nutrition");
  } finally {
    db.close();
  }
});

test("light mode uses the light palette; touch targets stay at least 44 pt", async () => {
  mockProfile.theme = "light";
  const { db } = setup();
  try {
    const view = await render(<SavedFoods />);
    const color = (text: string) =>
      (
        StyleSheet.flatten(view.getByText(text).props.style) as {
          color?: string;
        }
      ).color;
    expect(color("Oats")).toBe(theme.palettes.light.text);
    expect(color("Saved foods")).toBe(theme.palettes.light.text);
    const row = StyleSheet.flatten(
      (view.getByLabelText("Edit Oats").props.style as unknown) ?? {},
    ) as { minHeight?: number };
    expect(Number(row.minHeight)).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});
