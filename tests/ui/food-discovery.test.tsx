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
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { localDate } from "../../src/domain/types";

// Phase 7.3D: food discovery and logging in the REFORGE sheets. Logging
// rules are also covered by nutrition and food-library; these tests pin the
// new presentation: sections, serving clarity, destination, states, layout.

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

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
});

const today = localDate();
const yesterday = addDays(today, -1);
type Repo = ReturnType<typeof pathRepository>["r"];
const day = (r: Repo, date: string) =>
  r.journal("nutrition").filter((e) => e.date === date);
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
const banana = {
  name: "Banana",
  calories: 105,
  protein: 1.3,
  carbs: 27,
  fat: 0.4,
  quantity: 1,
  serving: "1 medium",
};
function seed(r: Repo) {
  r.saveProfile({ onboarded: true });
  r.addJournal("food", banana);
  r.addJournal(
    "nutrition",
    {
      name: "Oats",
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      quantity: 2,
      serving: "40 g",
      meal: "Breakfast",
    },
    yesterday,
  );
}
async function openAdd(r: Repo) {
  jest.mocked(useRepo).mockReturnValue(r);
  const view = await render(<JournalScreen />);
  await fireEvent.press(view.getByRole("button", { name: "Add food" }));
  return view;
}

test("search groups the lifter's foods before the library and says how many matched", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    const view = await openAdd(r);
    expect(view.getByRole("header", { name: "Add food" })).toBeTruthy();
    for (const h of ["Recent", "Saved foods", "Common foods · USDA"])
      expect(view.getByRole("header", { name: h })).toBeTruthy();
    expect(view.getByLabelText("Oats, 2 × 40 g, 300 kcal")).toBeTruthy();
    expect(view.getByLabelText("Banana, 1 medium, 105 kcal")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Search foods"), "banana");
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Food library · USDA" }),
    ).toBeTruthy();
    expect(view.getByText(/^\d[\d,]* foods?$/)).toBeTruthy();
    // Library rows say where their values come from.
    expect(view.getAllByText("USDA").length).toBeGreaterThan(0);
    // No scanner yet: nothing that looks like one (Phase 7.3F).
    expect(view.queryByLabelText(/scan|barcode/i)).toBeNull();
    // Clearing the search restores the lists.
    await fireEvent.press(view.getByLabelText("Clear search"));
    expect(view.getByRole("header", { name: "Recent" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a chosen food shows serving, values for the amount, meal and day before logging once", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    const view = await openAdd(r);
    await fireEvent.press(view.getByLabelText("Banana, 1 medium, 105 kcal"));
    expect(view.getByRole("header", { name: "Banana" })).toBeTruthy();
    expect(
      view.getByText(
        "1 serving = 1 medium · 105 kcal · P 1 g · C 27 g · F 0 g",
      ),
    ).toBeTruthy();
    expect(view.getByText("For 1 medium")).toBeTruthy();
    expect(
      view.getByLabelText("105 kcal, protein 1 g, carbs 27 g, fat 0 g"),
    ).toBeTruthy();
    // Nothing is logged by choosing a food.
    expect(day(r, today)).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    expect(view.getByText("For 1.5 × 1 medium")).toBeTruthy();
    expect(
      view.getByLabelText("158 kcal, protein 2 g, carbs 41 g, fat 1 g"),
    ).toBeTruthy();
    // Typing an amount applies at once.
    await fireEvent.changeText(view.getByLabelText("Servings"), "2");
    expect(
      view.getByLabelText("210 kcal, protein 3 g, carbs 54 g, fat 1 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "Dinner" }));
    expect(view.getByText("Logs to Dinner · Today")).toBeTruthy();
    await pressTwiceInOneFrame(view, "Add Banana to Dinner");
    expect(day(r, today).map((e) => e.data)).toEqual([
      { ...banana, quantity: 2, meal: "Dinner" },
    ]);
    // Back on the list: confirmation with Undo.
    expect(view.getByText("Added")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Undo adding Banana"));
    expect(day(r, today)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("Back keeps the search; Close dismisses; a past day is named before adding", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Previous day"));
    await fireEvent.press(view.getByLabelText("Add to Snacks"));
    expect(view.getByText("Adding to Yesterday")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Search foods"), "ban");
    await fireEvent.press(view.getByLabelText("Banana, 1 medium, 105 kcal"));
    expect(view.getByText("Logs to Snacks · Yesterday")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to foods"));
    expect(view.getByLabelText("Search foods").props.value).toBe("ban");
    expect(day(r, yesterday).map((e) => e.data.name)).toEqual(["Oats"]);
    await fireEvent.press(view.getByLabelText("Close"));
    expect(view.queryByRole("header", { name: "Add food" })).toBeNull();
  } finally {
    db.close();
  }
});

test("empty states: first use explains, and a search with no match offers Create", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const view = await openAdd(r);
    expect(view.getByText(/^Foods you log appear here/)).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Search foods"),
      "zzqx food",
    );
    expect(view.getByText("No matches")).toBeTruthy();
    expect(view.getByText(/No foods match “zzqx food”/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Create food"));
    expect(view.getByRole("header", { name: "New food" })).toBeTruthy();
    expect(view.getByLabelText("Food name").props.value).toBe("zzqx food");
  } finally {
    db.close();
  }
});

test("a custom food is checked, shows its total, and logs to the shown meal and day", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const view = await openAdd(r);
    await fireEvent.press(view.getByLabelText("Create food"));
    await fireEvent.press(view.getByRole("tab", { name: "Lunch" }));
    await fireEvent.press(view.getByLabelText("Add new food to Lunch"));
    expect(view.getByText("Enter a name")).toBeTruthy();
    expect(day(r, today)).toHaveLength(0);
    for (const [label, value] of [
      ["Food name", "Skyr"],
      ["Calories (kcal)", "120"],
      ["Protein (g)", "20,5"],
      ["Carbs (g)", "8"],
      ["Fat (g)", "0"],
      ["Serving size (optional)", "1 pot"],
    ] as const)
      await fireEvent.changeText(view.getByLabelText(label), value);
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    expect(
      view.getByText("Total 150 kcal · P 26 g · C 10 g · F 0 g"),
    ).toBeTruthy();
    await pressTwiceInOneFrame(view, "Add new food to Lunch");
    expect(day(r, today).map((e) => e.data)).toEqual([
      {
        name: "Skyr",
        calories: 120,
        protein: 20.5,
        carbs: 8,
        fat: 0,
        quantity: 1.25,
        serving: "1 pot",
        meal: "Lunch",
      },
    ]);
    expect(r.journal("food")).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("compact iPhones and large text: controls stay reachable at 44 pt", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    const view = await openAdd(r);
    // At large text the search and meal scroll with the results.
    expect(view.getByLabelText("Search foods")).toBeTruthy();
    for (const tab of view.getAllByRole("tab"))
      expect(Number(flat(tab).minHeight)).toBeGreaterThanOrEqual(44);
    const add = flat(view.getByLabelText("Add Banana"));
    expect(Number(add.width)).toBeGreaterThanOrEqual(44);
    expect(Number(add.height)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(view.getByLabelText("Banana, 1 medium, 105 kcal"));
    for (const label of [
      "Decrease Servings by 0.25",
      "Increase Servings by 0.25",
      "Back to foods",
      "Add Banana to Breakfast",
    ]) {
      const s = flat(view.getByLabelText(label));
      expect(Number(s.minHeight ?? s.height)).toBeGreaterThanOrEqual(44);
    }
  } finally {
    db.close();
  }
});
