import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import NutritionTab from "../../app/(tabs)/nutrition";
import Preferences from "../../src/screens/Preferences";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { localDate } from "../../src/domain/types";
import { TARGETS_SAVED } from "../../src/domain/nutrition";
import { hydrationData } from "../../src/domain/hydration";

// Phase 7.3C: the Hydration card and sheet, and the goal and unit in You.

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
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
});

const today = localDate();
const yesterday = addDays(today, -1);
type Repo = ReturnType<typeof pathRepository>["r"];
const water = (r: Repo, date = today) =>
  r.journal("hydration").filter((e) => e.date === date);
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
async function open(r: Repo) {
  jest.mocked(useRepo).mockReturnValue(r);
  const view = await render(<NutritionTab />);
  return view;
}

test("the card shows real water, no invented goal, and opening it never logs (H4, H9)", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const view = await open(r);
    const card = view.getByLabelText(
      "Hydration: 0 millilitres logged. Open hydration",
    );
    // Compact: the amount and a small Set goal chip, no empty bar.
    expect(view.getByText("logged")).toBeTruthy();
    expect(view.getByText("Set goal")).toBeTruthy();
    expect(view.queryByLabelText("Water")).toBeNull();
    await fireEvent.press(card);
    // The sheet is open (its title and the day's water).
    expect(view.getByRole("header", { name: "Hydration" })).toBeTruthy();
    expect(view.getByText("Today's water")).toBeTruthy();
    expect(water(r)).toHaveLength(0);
    // Without a goal the sheet shows the amount only, and the goal editor.
    expect(view.getByText(/^No daily goal yet\. Set your own/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Set daily goal" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("presets log once per tap with feedback and Undo; custom amounts too", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const view = await open(r);
    await fireEvent.press(view.getByTestId("hydration-card"));
    for (const p of ["250 mL", "500 mL", "750 mL"])
      expect(view.getByLabelText(`Add ${p}`)).toBeTruthy();
    await pressTwiceInOneFrame(view, "Add 250 mL");
    expect(water(r).map((e) => e.data)).toEqual([
      { ml: 250, amount: 250, unit: "ml" },
    ]);
    expect(view.getByText("Added 250 mL")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Undo adding 250 mL"));
    expect(water(r)).toHaveLength(0);
    // A typed amount, with kind checks.
    await fireEvent.changeText(view.getByLabelText("Custom amount (mL)"), "0");
    await fireEvent.press(view.getByLabelText("Add custom amount"));
    expect(view.getByText("Enter 1 to 5,000 mL")).toBeTruthy();
    expect(water(r)).toHaveLength(0);
    await fireEvent.changeText(
      view.getByLabelText("Custom amount (mL)"),
      "330,5",
    );
    await fireEvent.press(view.getByLabelText("Add custom amount"));
    expect(water(r)[0]!.data).toEqual({ ml: 330.5, amount: 330.5, unit: "ml" });
    // Water never reaches the food totals.
    expect(r.journal("nutrition")).toHaveLength(0);
    expect(view.getByLabelText("0 calories eaten")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("US fluid ounces: presets, custom amounts and display keep what was typed", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, fluidUnit: "oz" });
    const view = await open(r);
    await fireEvent.press(view.getByTestId("hydration-card"));
    for (const p of ["8 fl oz", "16 fl oz", "24 fl oz"])
      expect(view.getByLabelText(`Add ${p}`)).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Custom amount (fl oz)"),
      "12",
    );
    await fireEvent.press(view.getByLabelText("Add custom amount"));
    expect(water(r)[0]!.data).toEqual({
      ml: 354.882355,
      amount: 12,
      unit: "oz",
    });
    expect(view.getByLabelText("Water, 12 fluid ounces")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("entries can be edited and deleted (with confirmation)", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const entry = r.addJournal("hydration", hydrationData(500, "ml"), today);
    const view = await open(r);
    await fireEvent.press(view.getByTestId("hydration-card"));
    expect(view.getByText("1 drink")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Edit 500 mL"));
    await fireEvent.changeText(view.getByLabelText("Amount (mL)"), "330");
    await fireEvent.press(view.getByLabelText("Save amount"));
    expect(water(r)[0]).toMatchObject({
      id: entry.id,
      date: today,
      data: { ml: 330, amount: 330, unit: "ml" },
    });
    await fireEvent.press(view.getByLabelText("Delete 330 mL"));
    expect(jest.mocked(confirm).mock.calls[0]!.slice(0, 2)).toEqual([
      "Delete water entry?",
      "330 mL will be removed from today.",
    ]);
    expect(water(r)).toHaveLength(1);
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(water(r)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("a personal goal gives percentage and remainder; the same goal shows in Preferences", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("hydration", hydrationData(2100, "ml"), today);
    const view = await open(r);
    await fireEvent.press(view.getByTestId("hydration-card"));
    await fireEvent.press(view.getByRole("button", { name: "Set daily goal" }));
    await fireEvent.changeText(
      view.getByLabelText("Daily water goal (mL)"),
      "200",
    );
    await fireEvent.press(view.getByRole("button", { name: "Save goal" }));
    expect(view.getByText("Enter 500 to 10,000 mL")).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Daily water goal (mL)"),
      "3000",
    );
    await fireEvent.press(view.getByRole("button", { name: "Save goal" }));
    expect(r.profile().waterGoal).toBe(3000);
    expect(view.getByText("70% · 900 mL to go")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<NutritionTab />);
    expect(
      view.getByLabelText(
        "Hydration: 2.1 litres of 3.0 litres, 70 percent. Open hydration",
      ),
    ).toBeTruthy();
    expect(view.getByText("70%")).toBeTruthy();
    // Preferences (You, 7.5D) edits the same fields: one value, no conflict (H8).
    await view.unmount();
    const you = await render(<Preferences />);
    expect(you.getByText("3.0 L a day · mL")).toBeTruthy();
    await fireEvent.press(you.getByRole("button", { name: "Hydration" }));
    await fireEvent.press(you.getByRole("tab", { name: "US fluid ounces" }));
    expect(r.profile().fluidUnit).toBe("oz");
    expect(r.profile().waterGoal).toBe(3000);
    expect(you.getByText("101 fl oz a day")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a past day logs to that day; food totals and targets are unaffected", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, calories: 2400 });
    r.setSetting(TARGETS_SAVED, "1");
    r.addJournal(
      "nutrition",
      {
        name: "Oats",
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
        quantity: 2,
        meal: "Breakfast",
      },
      yesterday,
    );
    const view = await open(r);
    await fireEvent.press(view.getByLabelText("Previous day"));
    expect(
      view.getByLabelText("300 of 2,400 calories, 2,100 left"),
    ).toBeTruthy();
    await fireEvent.press(view.getByTestId("hydration-card"));
    expect(view.getByText("Water · Yesterday")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Add 500 mL"));
    expect(water(r, yesterday)).toHaveLength(1);
    expect(water(r, today)).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<NutritionTab />);
    expect(
      view.getByLabelText("300 of 2,400 calories, 2,100 left"),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

const order = (view: RenderResult) =>
  view.container
    .queryAll((n) =>
      ["hydration-card", "meal-row", "quick-add"].includes(
        String(n.props.testID),
      ),
    )
    .map((n) => String(n.props.testID))
    .filter((id, i, all) => all.indexOf(id) === i);

test("Hydration sits right under the hero, before meals and Quick add, sized to its content", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, waterGoal: 3000 });
    for (const name of ["Oats", "Rice", "Eggs", "Yogurt"])
      r.addJournal("food", {
        name,
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 2,
        quantity: 1,
      });
    for (const width of [393, 430]) {
      Object.assign(mockDims, { width, height: 900, fontScale: 1 });
      const view = await open(r);
      expect(order(view)).toEqual(["hydration-card", "meal-row", "quick-add"]);
      // Never stretched to another card's height.
      const style = flat(view.getByTestId("hydration-card"));
      expect(style.flex).toBeUndefined();
      expect(style.minHeight).toBeUndefined();
      expect(style.height).toBeUndefined();
      // Quick add has its own full-width card again: all four foods.
      expect(view.getAllByTestId("quick-add")).toHaveLength(4);
      await view.unmount();
    }
  } finally {
    db.close();
  }
});

test("compact iPhones and large text keep the card and presets at 44 pt or more", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, waterGoal: 3000 });
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    const view = await open(r);
    expect(order(view)[0]).toBe("hydration-card");
    await fireEvent.press(view.getByTestId("hydration-card"));
    for (const preset of view.getAllByTestId("water-preset"))
      expect(Number(flat(preset).minHeight)).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});
