import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import NutritionTab from "../../app/(tabs)/nutrition";
import JournalScreen from "../../src/screens/Journal";
import SavedFoods from "../../src/screens/SavedFoods";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { localDate } from "../../src/domain/types";

// Phase 7.1A: Nutrition is a primary tab. The tab and `/journal?kind=nutrition`
// render the same screen over the same stored entries; only the Back control
// differs.

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
const mockParams: { kind?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.kind = "nutrition";
});

const today = localDate();
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
  serving: "40 g",
  meal: "Breakfast",
};

test("the Nutrition tab shows the stored day with its totals and no Back control", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", oats, today);
    r.addJournal("nutrition", { ...oats, name: "Rice" }, addDays(today, -1));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    expect(view.getByRole("header", { name: "Nutrition" })).toBeTruthy();
    expect(view.queryByLabelText("Back")).toBeNull();
    // Only today's entry, with the same totals the journal screen shows.
    expect(view.getByText("Oats")).toBeTruthy();
    expect(view.queryByText("Rice")).toBeNull();
    expect(view.getByLabelText("150 calories eaten")).toBeTruthy();
    // Logging and the day switcher are the existing ones.
    expect(view.getByRole("button", { name: "Add food" })).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Previous day"));
    expect(view.getByText("Rice")).toBeTruthy();
    // Saved foods and targets keep their routes.
    await fireEvent.press(view.getByLabelText("Saved foods"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "food" },
    });
  } finally {
    db.close();
  }
});

test("an older /journal?kind=nutrition link opens the same screen with Back", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", oats, today);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    expect(view.getByRole("header", { name: "Nutrition" })).toBeTruthy();
    expect(view.getByText("Oats")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    // Opened directly (nothing to go back to), Back lands on the tab.
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/nutrition");
  } finally {
    db.close();
  }
});

test("Saved foods returns to Nutrition when opened directly", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    const view = await render(<SavedFoods />);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/nutrition");
  } finally {
    db.close();
  }
});
