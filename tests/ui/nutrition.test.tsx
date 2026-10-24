import React from "react";
import { Alert } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  act,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import type { TestInstance } from "test-renderer";
import { router } from "expo-router";
import JournalScreen from "../../src/screens/Journal";
import You from "../../src/screens/You";
import { DateSheet } from "../../src/components/DateSheet";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { addDays } from "../../src/domain/paths/model";
import { monthOf } from "../../src/domain/calendar-dates";
import { dayLabel } from "../../src/domain/training-display";
import { TARGETS_SAVED, totalsOf } from "../../src/domain/nutrition";
import { localDate } from "../../src/domain/types";

// Phase 7B WP4A: the Nutrition day, quick add, food editing, saved foods,
// and nutrition targets that are only shown once they are the lifter's own.

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
const mockParams: { kind?: string; edit?: string } = {};
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
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const pressAlert = (title: string, button: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  const choice = (call[2] as AlertButton[]).find((b) => b.text === button);
  if (!choice) throw new Error(`No "${button}" in "${title}"`);
  choice.onPress?.();
};
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.edit;
  mockParams.kind = "nutrition";
});

type Repo = ReturnType<typeof pathRepository>["r"];
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
const banana = {
  name: "Banana",
  calories: 105,
  protein: 1.3,
  carbs: 27,
  fat: 0.4,
  quantity: 1,
  serving: "1 medium",
};
const eggs = {
  name: "Eggs",
  calories: 72,
  protein: 6.3,
  carbs: 0.4,
  fat: 4.8,
  quantity: 3,
  serving: "1 large egg",
};
const day = (r: Repo, date: string) =>
  r.journal("nutrition").filter((e) => e.date === date);
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
async function menu(view: RenderResult, name: string, item: string) {
  await fireEvent.press(view.getByLabelText(`Options for ${name}`));
  await fireEvent.press(view.getByRole("menuitem", { name: item }));
}
/** Picks a day in an open DateSheet, moving back a month if needed. */
async function pickDay(view: RenderResult, date: string, shown = today) {
  if (monthOf(date) !== monthOf(shown))
    await fireEvent.press(view.getByLabelText("Previous month"));
  await fireEvent.press(view.getByRole("button", { name: dayLabel(date) }));
}
async function render_() {
  return render(<JournalScreen />);
}

// ---- The day ------------------------------------------------------------------

test("an empty day explains logging, and default targets are never shown as targets", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    expect(view.getByRole("header", { name: "Nutrition" })).toBeTruthy();
    expect(view.getByLabelText("0 calories eaten")).toBeTruthy();
    expect(view.queryByText(/of 2,000/)).toBeNull();
    expect(view.queryByText(/left$/)).toBeNull();
    expect(view.queryByLabelText("Calories")).toBeNull();
    expect(view.getByLabelText("Protein 0 g")).toBeTruthy();
    expect(view.getByText(/^Nothing logged today/)).toBeTruthy();
    for (const meal of ["Breakfast", "Lunch", "Dinner", "Snacks"])
      expect(view.getByLabelText(`Add to ${meal}`)).toBeTruthy();
    expect(view.getByRole("button", { name: "Add food" })).toBeTruthy();
    expect(
      view.getByLabelText("Next day").props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(
      view.getByRole("button", { name: "Set your daily targets" }),
    );
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: "/(tabs)/profile",
      params: { edit: "nutrition" },
    });
  } finally {
    db.close();
  }
});

test("the lifter's own targets show intake against them, including an explicit save of the defaults", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, calories: 2600, protein: 180 });
    r.addJournal(
      "nutrition",
      { ...oats, calories: 250, quantity: 2, meal: "Lunch" },
      today,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    expect(
      view.getByLabelText("500 of 2,600 calories, 2,100 left"),
    ).toBeTruthy();
    expect(view.getByText("of 2,600 kcal")).toBeTruthy();
    expect(view.getByLabelText("Protein 10 g of 180 g")).toBeTruthy();
    expect(
      view.queryByRole("button", { name: "Set your daily targets" }),
    ).toBeNull();
    r.addJournal(
      "nutrition",
      { ...oats, calories: 2500, meal: "Dinner" },
      today,
    );
    await view.rerender(<JournalScreen />);
    expect(
      view.getByLabelText("3,000 of 2,600 calories, 400 over"),
    ).toBeTruthy();
  } finally {
    db.close();
  }
  const saved = pathRepository();
  try {
    saved.r.saveProfile({ onboarded: true });
    saved.r.setSetting(TARGETS_SAVED, "1");
    jest.mocked(useRepo).mockReturnValue(saved.r);
    const view = await render_();
    expect(view.getByLabelText("0 of 2,000 calories, 2,000 left")).toBeTruthy();
  } finally {
    saved.db.close();
  }
});

test("a day groups entries by meal; older and unassigned entries stay visible; totals match", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    r.addJournal(
      "nutrition",
      { ...oats, name: "Greek yogurt", calories: 100, meal: "breakfast" },
      today,
    );
    r.addJournal(
      "nutrition",
      { ...oats, name: "Shake", calories: 120, meal: "Post-workout" },
      today,
    );
    r.addJournal("nutrition", { ...banana }, today);
    r.addJournal("nutrition", { ...eggs, meal: "Breakfast" }, yesterday);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    for (const h of [
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snacks",
      "Post-workout",
      "Other",
    ])
      expect(view.getByRole("header", { name: h })).toBeTruthy();
    expect(view.getByText("250 kcal")).toBeTruthy();
    expect(
      view.getByLabelText(/^Greek yogurt, 40 g, 100 kcal, protein 5 g/),
    ).toBeTruthy();
    expect(view.getByLabelText(/^Shake, 40 g, 120 kcal/)).toBeTruthy();
    expect(view.getByLabelText(/^Banana, 1 medium, 105 kcal/)).toBeTruthy();
    expect(view.queryByLabelText(/^Eggs/)).toBeNull();
    const total = Math.round(totalsOf(day(r, today)).calories);
    expect(view.getByLabelText(`${total} calories eaten`)).toBeTruthy();
    // Display never rewrites stored meals.
    expect(
      day(r, today)
        .map((e) => e.data.meal ?? null)
        .sort(),
    ).toEqual(["Breakfast", "Post-workout", "breakfast", null].sort());
  } finally {
    db.close();
  }
});

test("the day switcher moves a day at a time and never past today; the calendar offers past days", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", { ...banana, meal: "Snacks" }, today);
    r.addJournal("nutrition", { ...eggs, meal: "Breakfast" }, yesterday);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Previous day"));
    expect(view.getByLabelText(/^Yesterday, .*Choose a day$/)).toBeTruthy();
    expect(
      view.getByLabelText(/^Eggs, 3 × 1 large egg, 216 kcal/),
    ).toBeTruthy();
    expect(view.queryByLabelText(/^Banana/)).toBeNull();
    expect(view.getByLabelText("216 calories eaten")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Next day"));
    expect(view.getByLabelText(/^Banana/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Next day"));
    expect(view.getByLabelText(/^Today, .*Choose a day$/)).toBeTruthy();
    // The calendar: today and earlier only.
    await fireEvent.press(view.getByLabelText(/^Today, .*Choose a day$/));
    expect(view.getByRole("header", { name: "Choose a day" })).toBeTruthy();
    const tomorrow = addDays(today, 1);
    if (monthOf(tomorrow) === monthOf(today))
      expect(
        view.getByRole("button", { name: dayLabel(tomorrow) }).props
          .accessibilityState.disabled,
      ).toBe(true);
    await pickDay(view, yesterday);
    await fireEvent.press(
      view.getByLabelText(`Show for ${dayLabel(yesterday)}`),
    );
    expect(view.getByLabelText(/^Eggs/)).toBeTruthy();
  } finally {
    db.close();
  }
});

// ---- Quick add ------------------------------------------------------------------

test("+ logs a food into that meal and day in one tap; a double tap logs once; Undo removes it", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("food", { ...banana });
    r.addJournal(
      "nutrition",
      { ...oats, quantity: 2, meal: "Breakfast" },
      yesterday,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    expect(view.getByRole("header", { name: "Add food" })).toBeTruthy();
    expect(
      view.getByRole("tab", { name: "Lunch" }).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(view.getByRole("header", { name: "Recent" })).toBeTruthy();
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    await pressTwiceInOneFrame(view, "Add Banana");
    expect(day(r, today)).toHaveLength(1);
    const [entry] = day(r, today);
    expect(entry!.data).toEqual({
      name: "Banana",
      meal: "Lunch",
      calories: 105,
      protein: 1.3,
      carbs: 27,
      fat: 0.4,
      quantity: 1,
      serving: "1 medium",
    });
    // Undo takes back exactly that entry.
    await fireEvent.press(view.getByLabelText("Undo adding Banana"));
    expect(day(r, today)).toHaveLength(0);
    expect(view.getByLabelText("Add Banana")).toBeTruthy();
    // A recent food is added at the servings last eaten.
    await fireEvent.press(view.getByLabelText("Add Oats"));
    expect(day(r, today)[0]!.data).toMatchObject({
      name: "Oats",
      quantity: 2,
      meal: "Lunch",
    });
    expect(r.journal("nutrition")).toHaveLength(2);
  } finally {
    db.close();
  }
});

test("tapping a food sets servings and meal before adding, once", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("food", { ...oats });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    await fireEvent.press(view.getByLabelText("Oats, 40 g, 150 kcal"));
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    expect(
      view.getByLabelText("225 kcal, protein 8 g, carbs 41 g, fat 5 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "Dinner" }));
    await pressTwiceInOneFrame(view, "Add Oats to Dinner");
    expect(day(r, today)).toHaveLength(1);
    expect(day(r, today)[0]!.data).toMatchObject({
      name: "Oats",
      quantity: 1.5,
      meal: "Dinner",
    });
    // Back on the list, the food shows as added.
    expect(view.getByLabelText("Undo adding Oats")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("food added while looking at a past day goes to that day", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("food", { ...banana });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Previous day"));
    await fireEvent.press(view.getByLabelText("Add to Snacks"));
    expect(view.getByText("Adding to Yesterday")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Add Banana"));
    expect(day(r, yesterday)).toHaveLength(1);
    expect(day(r, today)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("search narrows the foods and offers to create a missing one", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("food", { ...banana });
    r.addJournal("food", { ...oats });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByRole("button", { name: "Add food" }));
    await fireEvent.changeText(view.getByLabelText("Search foods"), "ban");
    expect(view.getByLabelText("Add Banana")).toBeTruthy();
    expect(view.queryByLabelText("Add Oats")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Search foods"), "kiwi");
    // Not a saved food, but the built-in USDA library has it.
    expect(
      view.getByRole("header", { name: "Food library · USDA" }),
    ).toBeTruthy();
    expect(view.queryByLabelText("Add Banana")).toBeNull();
    await fireEvent.changeText(
      view.getByLabelText("Search foods"),
      "grandma's stew",
    );
    expect(view.getByText(/No foods match “grandma's stew”/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Create food"));
    expect(view.getByRole("header", { name: "New food" })).toBeTruthy();
    expect(view.getByLabelText("Food name").props.value).toBe("grandma's stew");
  } finally {
    db.close();
  }
});

test("a new food is checked kindly, accepts comma decimals, and is saved to my foods once", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    expect(view.getByText(/Foods you log appear here/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Create food"));
    await fireEvent.changeText(view.getByLabelText("Food name"), "Skyr");
    await fireEvent.press(view.getByLabelText("Add new food to Breakfast"));
    expect(view.getAllByText("Enter a number (0 if none)")).toHaveLength(4);
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "abc");
    await fireEvent.press(view.getByLabelText("Add new food to Breakfast"));
    expect(view.getByText("Enter a number from 0 to 20000")).toBeTruthy();
    expect(r.journal("nutrition")).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "105");
    await fireEvent.changeText(view.getByLabelText("Protein (g)"), "17,5");
    await fireEvent.changeText(view.getByLabelText("Carbs (g)"), "6");
    await fireEvent.changeText(view.getByLabelText("Fat (g)"), "0,2");
    await fireEvent.changeText(
      view.getByLabelText("Serving size (optional)"),
      "150 g",
    );
    await pressTwiceInOneFrame(view, "Add new food to Breakfast");
    expect(r.journal("nutrition")).toHaveLength(1);
    expect(r.journal("nutrition")[0]!.data).toEqual({
      name: "Skyr",
      calories: 105,
      protein: 17.5,
      carbs: 6,
      fat: 0.2,
      quantity: 1,
      serving: "150 g",
      meal: "Breakfast",
    });
    expect(r.journal("food").map((f) => f.data)).toEqual([
      {
        name: "Skyr",
        calories: 105,
        protein: 17.5,
        carbs: 6,
        fat: 0.2,
        quantity: 1,
        serving: "150 g",
      },
    ]);
    expect(view.getByLabelText("Undo adding Skyr")).toBeTruthy();
    // The same food again: logged again, but not saved twice.
    await fireEvent.press(view.getByLabelText("Create food"));
    for (const [label, value] of [
      ["Food name", "Skyr"],
      ["Calories (kcal)", "105"],
      ["Protein (g)", "17.5"],
      ["Carbs (g)", "6"],
      ["Fat (g)", "0.2"],
      ["Serving size (optional)", "150 g"],
    ])
      await fireEvent.changeText(view.getByLabelText(label!), value!);
    await fireEvent.press(view.getByLabelText("Add new food to Breakfast"));
    expect(r.journal("nutrition")).toHaveLength(2);
    expect(r.journal("food")).toHaveLength(1);
    // With Save to my foods off, nothing is added to the library.
    await fireEvent.press(view.getByLabelText("Create food"));
    for (const [label, value] of [
      ["Food name", "Kiwi"],
      ["Calories (kcal)", "42"],
      ["Protein (g)", "0.8"],
      ["Carbs (g)", "10"],
      ["Fat (g)", "0.4"],
    ])
      await fireEvent.changeText(view.getByLabelText(label!), value!);
    await fireEvent.press(view.getByLabelText("Save to my foods"));
    await fireEvent.press(view.getByLabelText("Add new food to Breakfast"));
    expect(r.journal("nutrition")).toHaveLength(3);
    expect(r.journal("food")).toHaveLength(1);
  } finally {
    db.close();
  }
});

// ---- Editing --------------------------------------------------------------------

test("editing an entry changes only what was edited and keeps everything else", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const original = r.addJournal(
      "nutrition",
      {
        ...oats,
        meal: "Post-workout",
        notes: "after run",
        custom: 7,
        flag: true,
      },
      today,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText(/^Oats, 40 g/));
    expect(view.getByRole("header", { name: "Edit entry" })).toBeTruthy();
    expect(view.getByText(/Logged under “Post-workout”/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Increase Servings by 0.25"));
    await pressTwiceInOneFrame(view, "Save entry");
    const [saved] = r.journal("nutrition");
    expect(saved).toMatchObject({
      id: original.id,
      date: today,
      createdAt: original.createdAt,
    });
    expect(saved!.data).toEqual({ ...original.data, quantity: 1.25 });
    expect(typeof saved!.data.custom).toBe("number");
    expect(saved!.data.flag).toBe(true);
    // Moving it to a meal and to yesterday.
    await view.rerender(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Oats, 1.25 × 40 g/));
    await fireEvent.press(view.getByRole("tab", { name: "Lunch" }));
    await fireEvent.press(view.getByLabelText(/^Day, Today/));
    await pickDay(view, yesterday);
    await fireEvent.press(
      view.getByLabelText(`Move for ${dayLabel(yesterday)}`),
    );
    await fireEvent.press(view.getByLabelText("Save entry"));
    const [moved] = r.journal("nutrition");
    expect(moved).toMatchObject({ id: original.id, date: yesterday });
    expect(moved!.data).toEqual({
      ...original.data,
      quantity: 1.25,
      meal: "Lunch",
    });
  } finally {
    db.close();
  }
});

test("closing an edited entry asks first and keeps the entry as it was", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText(/^Oats/));
    await fireEvent.press(view.getByLabelText("Close"));
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText(/^Oats/));
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "999");
    await fireEvent.press(view.getByLabelText("Close"));
    pressAlert("Discard changes?", "Discard");
    await waitFor(() =>
      expect(view.queryByRole("header", { name: "Edit entry" })).toBeNull(),
    );
    expect(r.journal("nutrition")[0]!.data.calories).toBe(150);
  } finally {
    db.close();
  }
});

test("deleting an entry asks first", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await menu(view, "Oats", "Delete");
    await waitFor(() => expect(confirm).toHaveBeenCalled(), { timeout: 3000 });
    expect(jest.mocked(confirm).mock.calls[0]!.slice(0, 2)).toEqual([
      "Delete entry?",
      "Oats will be removed from today.",
    ]);
    expect(r.journal("nutrition")).toHaveLength(1);
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(r.journal("nutrition")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("copy to today and save as food each add one record with Undo; a saved duplicate is refused", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal(
      "nutrition",
      { ...eggs, meal: "Breakfast", notes: "scrambled" },
      yesterday,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    await fireEvent.press(view.getByLabelText("Previous day"));
    await menu(view, "Eggs", "Copy to today");
    await waitFor(() => expect(day(r, today)).toHaveLength(1), {
      timeout: 3000,
    });
    expect(day(r, today)[0]!.data).toEqual(day(r, yesterday)[0]!.data);
    expect(view.getByText("Copied Eggs to today")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(day(r, today)).toHaveLength(0);
    expect(day(r, yesterday)).toHaveLength(1);
    await menu(view, "Eggs", "Save as food");
    await waitFor(() => expect(r.journal("food")).toHaveLength(1), {
      timeout: 3000,
    });
    expect(r.journal("food")[0]!.data).toEqual({ ...eggs });
    await menu(view, "Eggs", "Save as food");
    await waitFor(
      () =>
        expect(alert).toHaveBeenCalledWith("Already saved", expect.any(String)),
      { timeout: 3000 },
    );
    expect(r.journal("food")).toHaveLength(1);
  } finally {
    db.close();
  }
});

// ---- Saved foods ----------------------------------------------------------------

test("saved foods: search, edit without changing logged entries, delete asks, no duplicates", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("food", { ...oats });
    r.addJournal("food", { ...banana });
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    mockParams.kind = "food";
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    expect(view.getByRole("header", { name: "Saved foods" })).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Search saved foods"),
      "ban",
    );
    expect(view.getByLabelText("Edit Banana")).toBeTruthy();
    expect(view.queryByLabelText("Edit Oats")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Search saved foods"), "");
    await fireEvent.press(view.getByLabelText("Edit Oats"));
    await fireEvent.changeText(view.getByLabelText("Calories (kcal)"), "160");
    await fireEvent.press(view.getByLabelText("Save food"));
    const food = r.journal("food").find((f) => f.data.name === "Oats")!;
    expect(food.data).toEqual({ ...oats, calories: 160 });
    expect(r.journal("nutrition")[0]!.data.calories).toBe(150);
    await menu(view, "Banana", "Delete");
    await waitFor(() => expect(confirm).toHaveBeenCalled(), { timeout: 3000 });
    expect(jest.mocked(confirm).mock.calls[0]![1]).toMatch(/keep their values/);
    // Creating a food that is already saved is refused.
    await fireEvent.press(view.getByRole("button", { name: "Create food" }));
    for (const [label, value] of [
      ["Food name", "Banana"],
      ["Calories (kcal)", "105"],
      ["Protein (g)", "1.3"],
      ["Carbs (g)", "27"],
      ["Fat (g)", "0.4"],
      ["Serving size (optional)", "1 medium"],
    ])
      await fireEvent.changeText(view.getByLabelText(label!), value!);
    await fireEvent.press(view.getByLabelText("Save food"));
    expect(alert).toHaveBeenCalledWith("Already saved", expect.any(String));
    expect(r.journal("food")).toHaveLength(2);
  } finally {
    db.close();
  }
});

// ---- Unchanged neighbours ---------------------------------------------------------

test("the Goals nutrition metric still reads today's calories", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal(
      "nutrition",
      { ...oats, calories: 250, quantity: 2, meal: "Lunch" },
      today,
    );
    r.addJournal(
      "nutrition",
      { ...oats, calories: 900, meal: "Lunch" },
      yesterday,
    );
    r.addJournal("goal", {
      name: "Eat enough",
      metric: "nutrition",
      target: 2500,
      start: 0,
    });
    mockParams.kind = "goal";
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    expect(view.getByText("500.0 / 2500 nutrition")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("You shows targets only once they are the lifter's own, recorded after a successful save", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex", height: 180, weight: 80 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const hint = () =>
      view.getByLabelText("Nutrition targets").props.accessibilityHint;
    expect(hint()).toBe("Not set");
    // Closing without saving records nothing.
    await fireEvent.press(view.getByLabelText("Nutrition targets"));
    await fireEvent.press(view.getByLabelText("Close"));
    expect(r.setting(TARGETS_SAVED)).toBeUndefined();
    // An invalid save records nothing.
    await fireEvent.press(view.getByLabelText("Nutrition targets"));
    await fireEvent.changeText(
      view.getByLabelText("Daily calorie goal (kcal)"),
      "-5",
    );
    await fireEvent.press(view.getByText("Save targets"));
    expect(r.setting(TARGETS_SAVED)).toBeUndefined();
    expect(r.profile().calories).toBe(2000);
    await fireEvent.changeText(
      view.getByLabelText("Daily calorie goal (kcal)"),
      "2000",
    );
    // Saving the suggested values deliberately makes them the lifter's own.
    await fireEvent.press(view.getByText("Save targets"));
    await waitFor(() => expect(r.setting(TARGETS_SAVED)).toBe("1"));
    expect(r.profile()).toMatchObject({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
    });
    await view.rerender(<You />);
    expect(hint()).toBe("2,000 kcal · 150 g protein");
  } finally {
    db.close();
  }
  const own = pathRepository();
  try {
    own.r.saveProfile({ onboarded: true, calories: 2600 });
    jest.mocked(useRepo).mockReturnValue(own.r);
    const view = await render(<You />);
    expect(
      view.getByLabelText("Nutrition targets").props.accessibilityHint,
    ).toBe("2,600 kcal · 150 g protein");
  } finally {
    own.db.close();
  }
});

test("the calendar stays future-only for planning and past-only for logging", async () => {
  const onConfirm = jest.fn();
  const sheet = (range?: "past" | "future") => (
    <DateSheet
      visible
      title="Pick"
      confirmLabel="Go"
      range={range}
      onConfirm={onConfirm}
      onClose={() => {}}
    />
  );
  const view = await render(sheet());
  const state = (date: string) =>
    view.getByRole("button", {
      name: date === today ? `${dayLabel(date)}, today` : dayLabel(date),
    }).props.accessibilityState.disabled;
  const sameMonth = (d: string) => monthOf(d) === monthOf(today);
  expect(state(today)).toBe(false);
  if (sameMonth(yesterday)) expect(state(yesterday)).toBe(true);
  if (sameMonth(addDays(today, 1)))
    expect(state(addDays(today, 1))).toBe(false);
  await view.rerender(sheet("past"));
  expect(state(today)).toBe(false);
  if (sameMonth(yesterday)) expect(state(yesterday)).toBe(false);
  if (sameMonth(addDays(today, 1))) expect(state(addDays(today, 1))).toBe(true);
});

test("sheets opened from sheets render inside them, so iOS can present them", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, today);
    r.addJournal("food", { ...banana });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render_();
    const open = () =>
      view.container.queryAll((n) => n.type === "Modal" && n.props.visible);
    const nested = (node: TestInstance) => {
      for (let p = node.parent; p; p = p.parent)
        if (p.type === "Modal") return true;
      return false;
    };
    // The editor's day picker opens inside the editor.
    await fireEvent.press(view.getByLabelText(/^Oats/));
    await fireEvent.press(view.getByLabelText(/^Day, Today/));
    expect(open()).toHaveLength(2);
    expect(open().filter(nested)).toHaveLength(1);
    await fireEvent.press(view.getAllByLabelText("Close").at(-1)!);
    await fireEvent.press(view.getAllByLabelText("Close").at(-1)!);
    // Quick add switches steps within one sheet rather than stacking sheets.
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    expect(open()).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Banana, 1 medium, 105 kcal"));
    expect(open()).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Back to foods"));
    await fireEvent.press(view.getByLabelText("Create food"));
    expect(open()).toHaveLength(1);
  } finally {
    db.close();
  }
});
