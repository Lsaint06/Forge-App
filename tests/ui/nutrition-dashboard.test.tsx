import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import { router } from "expo-router";
import NutritionTab from "../../app/(tabs)/nutrition";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { localDate } from "../../src/domain/types";
import {
  TARGETS_SAVED,
  defaultMeal,
  entriesOn,
  totalsOf,
} from "../../src/domain/nutrition";

// Phase 7.3B: the REFORGE Nutrition dashboard (approved Nutrition reference).
// Logging, editing and the sheets are covered by nutrition, nutrition-tab and
// food-library; these tests pin the new frame, cards and their rules.

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
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  mockParams.kind = "nutrition";
});

const today = localDate();
const yesterday = addDays(today, -1);
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
  serving: "40 g",
};
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
type Repo = ReturnType<typeof pathRepository>["r"];
const dayEntries = (r: Repo, date: string) =>
  entriesOn(r.journal("nutrition"), date);

function seed(r: Repo, own = true) {
  r.saveProfile({ onboarded: true, calories: 2400, protein: 180 });
  if (own) r.setSetting(TARGETS_SAVED, "1");
  r.addJournal("nutrition", { ...oats, quantity: 2, meal: "Breakfast" }, today);
  r.addJournal(
    "nutrition",
    {
      ...oats,
      name: "Chicken",
      calories: 330,
      protein: 62,
      carbs: 0,
      fat: 7,
      meal: "Lunch",
    },
    today,
  );
  r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, yesterday);
  r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, addDays(today, -2));
  r.addJournal("food", {
    name: "Banana",
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.4,
    quantity: 1,
    serving: "1 medium",
  });
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

test("the tab follows the reference: brand header, title, hero, goal, streak, meals, quick add", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    // Brand header with the shared training streak.
    expect(
      view.getByLabelText(/^\d+ day streak\. Open progress$/),
    ).toBeTruthy();
    expect(view.getByRole("header", { name: "Nutrition" })).toBeTruthy();
    expect(
      view.getByText("Fuel your progress. Consistency compounds."),
    ).toBeTruthy();
    // Hero: the protected totals, against the lifter's own target.
    const totals = totalsOf(dayEntries(r, today));
    expect(Math.round(totals.calories)).toBe(630);
    expect(
      view.getByRole("header", { name: "Today's nutrition" }),
    ).toBeTruthy();
    expect(
      view.getByLabelText("630 of 2,400 calories, 1,770 left"),
    ).toBeTruthy();
    expect(view.getByText("of 2,400 kcal")).toBeTruthy();
    expect(view.getByText("26%")).toBeTruthy();
    expect(view.getByLabelText("Protein 72 g of 180 g")).toBeTruthy();
    // No photograph without approved artwork, and no slogan competing with
    // the numbers: the ember glow only. Macro labels are written in full.
    expect(view.queryByTestId("hero-artwork")).toBeNull();
    expect(view.queryByText("Tomorrows")).toBeNull();
    for (const m of ["Protein", "Carbs", "Fat"])
      expect(view.getByText(m)).toBeTruthy();
    // Calorie goal: what is left (the hero already shows eaten, goal and %);
    // the whole card opens the target editor.
    expect(view.queryByText("2,400 kcal")).toBeNull();
    await fireEvent.press(
      view.getByLabelText(
        "Calorie goal: 1,770 kcal left. Edit your daily targets",
      ),
    );
    // 7.3G G2: targets are edited in context, not in You.
    expect(view.getByRole("header", { name: "Daily targets" })).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(view.queryByRole("header", { name: "Daily targets" })).toBeNull();
    // Streak: days logged, from the entries.
    expect(
      view.getByLabelText(/^Nutrition streak: 3 days logged in a row\./),
    ).toBeTruthy();
    // Meals summarise each meal; quick add offers the lifter's own foods.
    expect(view.getByRole("header", { name: "Today's meals" })).toBeTruthy();
    expect(
      view.getByLabelText(
        "Lunch, 330 kcal, protein 62 g, carbs 0 g, fat 7 g, 1 food: Chicken",
      ),
    ).toBeTruthy();
    expect(view.getAllByTestId("quick-add").length).toBeGreaterThan(0);
    // Hydration (7.3C) is real: the day's water and no invented goal. Meal
    // times are still not simulated.
    expect(
      view.getByLabelText("Hydration: 0 millilitres logged. Open hydration"),
    ).toBeTruthy();
    expect(view.queryByText(/^\d+:\d+/)).toBeNull();
    // Add food stays pinned and opens the existing sheet.
    await fireEvent.press(view.getByRole("button", { name: "Add food" }));
    expect(view.getByRole("header", { name: "Add food" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("meals expand in place, keeping every food action and Add to meal", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    r.addJournal(
      "nutrition",
      { ...oats, name: "Shake", meal: "Post-workout" },
      today,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    const breakfast = view.getByRole("button", {
      name: /^Breakfast, 300 kcal/,
    });
    expect(breakfast.props.accessibilityState).toMatchObject({
      expanded: false,
    });
    expect(view.getByText("10P 54C 6F")).toBeTruthy();
    expect(view.queryByLabelText(/^Oats, 2 × 40 g/)).toBeNull();
    await fireEvent.press(breakfast);
    expect(
      view.getByRole("button", { name: /^Breakfast, 300 kcal/ }).props
        .accessibilityState,
    ).toMatchObject({ expanded: true });
    expect(view.getByLabelText(/^Oats, 2 × 40 g, 300 kcal/)).toBeTruthy();
    expect(view.getByLabelText("Options for Oats")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    expect(
      view.getByRole("tab", { name: "Breakfast" }).props.accessibilityState
        .selected,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("Close"));
    // Empty default meals add directly; an older meal name has no Add.
    expect(view.getByLabelText("Add to Dinner")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: /^Post-workout, / }),
    );
    expect(view.getByLabelText(/^Shake, 40 g/)).toBeTruthy();
    expect(view.queryByLabelText("Add to Post-workout")).toBeNull();
    // Collapsing hides the foods again.
    await fireEvent.press(
      view.getByRole("button", { name: /^Breakfast, 300 kcal/ }),
    );
    expect(view.queryByLabelText(/^Oats, 2 × 40 g/)).toBeNull();
  } finally {
    db.close();
  }
});

test("quick add logs the stated portion once, into the stated meal and day, with Undo", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    const meal = defaultMeal();
    const label = `Quick add Banana, 1 medium, 105 kcal, to ${meal}`;
    expect(view.getByLabelText(label)).toBeTruthy();
    // Each item states its portion and energy; the card states meal and day.
    expect(view.getByText("1 medium · 105 kcal")).toBeTruthy();
    expect(view.getByText(`Adds to ${meal} · Today`)).toBeTruthy();
    const before = dayEntries(r, today).length;
    await pressTwiceInOneFrame(view, label);
    const added = dayEntries(r, today);
    expect(added).toHaveLength(before + 1);
    expect(added.at(-1)!.data).toEqual({
      name: "Banana",
      meal,
      calories: 105,
      protein: 1.3,
      carbs: 27,
      fat: 0.4,
      quantity: 1,
      serving: "1 medium",
    });
    expect(view.getByText(`Added Banana to ${meal}`)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(dayEntries(r, today)).toHaveLength(before);
    // On a past day, the tile says so and logs there (a deliberate later tap,
    // after the double-tap guard).
    await act(() => new Promise((done) => setTimeout(done, 450)));
    await fireEvent.press(view.getByLabelText("Previous day"));
    await fireEvent.press(
      view.getByLabelText(
        `Quick add Banana, 1 medium, 105 kcal, to ${meal} · Yesterday`,
      ),
    );
    expect(dayEntries(r, yesterday).map((e) => e.data.name)).toContain(
      "Banana",
    );
    // The header opens Add food.
    await fireEvent.press(view.getByLabelText("Quick add. Open Add food"));
    expect(view.getByRole("header", { name: "Add food" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("without the lifter's own targets, nothing is shown as a target", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    expect(view.getByLabelText("0 calories eaten")).toBeTruthy();
    expect(view.getByText("kcal eaten")).toBeTruthy();
    expect(view.queryByText(/%$/)).toBeNull();
    expect(view.queryByLabelText(/^Daily goal/)).toBeNull();
    expect(view.queryByLabelText("Calories")).toBeNull();
    expect(
      view.getByLabelText(/^Nutrition streak: 0 days logged in a row\./),
    ).toBeTruthy();
    expect(
      view.getByText(
        "Your recent and saved foods show here for one-tap adding.",
      ),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    // 7.3G G2: the targets sheet opens in Nutrition.
    expect(view.getByRole("header", { name: "Daily targets" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    // Without targets the card is not a shortcut to a number that isn't there.
    expect(view.queryByLabelText(/^Calorie goal: /)).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("the pushed screen keeps Back and no brand header; past days rename the cards", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    expect(view.getByLabelText("Back")).toBeTruthy();
    expect(view.queryByLabelText(/day streak\. Open progress$/)).toBeNull();
    await fireEvent.press(view.getByLabelText("Previous day"));
    expect(
      view.getByRole("header", { name: "Yesterday's nutrition" }),
    ).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Yesterday's meals" }),
    ).toBeTruthy();
    expect(
      view.getByLabelText("150 of 2,400 calories, 2,250 left"),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("compact iPhones and large text: cards stack, macros stack, targets stay 44 pt", async () => {
  const { r, db } = pathRepository();
  try {
    seed(r);
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<NutritionTab />);
    for (const label of ["Previous day", "Next day", "Add to Dinner"]) {
      const s = flat(view.getByLabelText(label));
      expect(Number(s.minHeight ?? s.height)).toBeGreaterThanOrEqual(44);
    }
    for (const tile of view.getAllByTestId("quick-add"))
      expect(Number(flat(tile).minHeight)).toBeGreaterThanOrEqual(44);
    for (const row of view.getAllByTestId("meal-row"))
      expect(Number(flat(row).minHeight)).toBeGreaterThanOrEqual(44);
    expect(
      Number(flat(view.getByRole("button", { name: "Add food" })).minHeight),
    ).toBeGreaterThanOrEqual(44);
    // No decorative tagline when there is no room for it.
    expect(view.queryByText("Tomorrows")).toBeNull();
  } finally {
    db.close();
  }
});
