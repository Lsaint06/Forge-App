import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import Home from "../../src/screens/Home";
import Train from "../../app/(tabs)/train";
import NutritionTab from "../../app/(tabs)/nutrition";
import Progress from "../../app/(tabs)/progress";
import You from "../../src/screens/You";
import History from "../../src/screens/History";
import WorkoutScreen from "../../src/screens/Workout";

// Phase 8.5 (M3): an accessibility sweep of the five tabs, History, the
// logger and their main menus and sheets, with a lifter's data. Every
// control VoiceOver and TalkBack can reach has a role and a name, every text
// field a label, and a control drawn smaller than 44 pt reaches 44 with its
// hit slop. (Sizes come from styles: layout isn't computed here.)

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
beforeEach(() =>
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 }),
);
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
  notificationsAvailable: true,
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

const today = localDate();
const BENCH = "barbell-bench-press";
function lifter() {
  const f = pathRepository();
  const { r, db } = f;
  r.saveProfile({ onboarded: true, height: 180, weight: 85 });
  for (let i = 1; i <= 8; i++) {
    const w = r.startWorkout(`Session ${i}`);
    for (const lift of [BENCH, "back-squat"]) {
      const row = r.addExercise(w.id, lift);
      for (let s = 0; s < 3; s++)
        r.addSet(row.id, { weight: 60, reps: 8, completed: true });
    }
    r.finishWorkout(w.id);
    const end = new Date(`${addDays(today, -i * 2)}T18:00:00`).getTime();
    db.prepare(
      "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
    ).run(end - 3_600_000, end, w.id);
  }
  r.addJournal(
    "nutrition",
    {
      name: "Oats",
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      quantity: 1,
      serving: "40 g",
      meal: "Breakfast",
    },
    today,
  );
  r.addJournal("measurement", { name: "Bodyweight", value: 85, unit: "kg" });
  r.addJournal("goal", {
    name: "Bench 100",
    metric: "strength",
    exerciseId: BENCH,
    target: 100,
    start: 80,
    reps: 1,
    goalRules: 2,
  });
  jest.mocked(useRepo).mockReturnValue(r);
  return f;
}
function inProgress(r: ReturnType<typeof lifter>["r"]) {
  const w = r.startWorkout("Push");
  for (const lift of [BENCH, "back-squat"]) {
    const row = r.addExercise(w.id, lift);
    r.addSet(row.id, { weight: 60, reps: 8, completed: true });
    r.addSet(row.id, { weight: 60, reps: 8 });
  }
}

const text = (n: TestInstance): string =>
  n.children
    .map((c) => (typeof c === "string" ? c : text(c)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
const span = (slop: unknown, a: "top" | "left", b: "bottom" | "right") =>
  typeof slop === "number"
    ? 2 * slop
    : ((slop as Record<string, number> | undefined)?.[a] ?? 0) +
      ((slop as Record<string, number> | undefined)?.[b] ?? 0);

/** Problems found, and how many controls were checked. */
function sweep(root: TestInstance) {
  const problems: string[] = [];
  let checked = 0;
  for (const n of root.queryAll(() => true)) {
    const p = n.props;
    if (n.type === "TextInput") {
      checked++;
      if (!p.accessibilityLabel && !p["aria-label"])
        problems.push(`a text field without a label (${p.placeholder ?? ""})`);
      continue;
    }
    const hidden =
      p.accessible === false ||
      p.accessibilityElementsHidden === true ||
      p.importantForAccessibility === "no-hide-descendants" ||
      p["aria-hidden"] === true;
    const pressable =
      typeof p.onClick === "function" ||
      typeof p.onResponderRelease === "function";
    if (!pressable || hidden) continue;
    checked++;
    const name = String(p.accessibilityLabel ?? p["aria-label"] ?? text(n));
    const style = StyleSheet.flatten(p.style) ?? {};
    const height = Number(style.minHeight ?? style.height ?? NaN);
    const width = Number(style.minWidth ?? style.width ?? NaN);
    const issues = [
      !(p.accessibilityRole ?? p.role) && "no role",
      !name && "no name",
      height + span(p.hitSlop, "top", "bottom") < 44 && `${height} pt tall`,
      width + span(p.hitSlop, "left", "right") < 44 && `${width} pt wide`,
    ].filter(Boolean);
    if (issues.length) problems.push(`"${name}": ${issues.join(", ")}`);
  }
  return { problems, checked };
}
async function expectAccessible(root: TestInstance, atLeast: number) {
  const { problems, checked } = sweep(root);
  expect(problems).toEqual([]);
  expect(checked).toBeGreaterThanOrEqual(atLeast);
}

test.each([
  ["Home", () => <Home />, 8],
  ["Train", () => <Train />, 6],
  ["Nutrition", () => <NutritionTab />, 10],
  ["Progress", () => <Progress />, 20],
  ["You", () => <You />, 10],
  ["History", () => <History />, 10],
] as const)("%s", async (_, screen, atLeast) => {
  const { db } = lifter();
  try {
    const view = await render(screen());
    await expectAccessible(view.container, atLeast);
  } finally {
    db.close();
  }
});

test("Home's session menu and Nutrition's Add food", async () => {
  const { db } = lifter();
  try {
    const home = await render(<Home />);
    await fireEvent.press(home.getByLabelText("Session options"));
    await expectAccessible(home.container, 10);
    await home.unmount();
    const nutrition = await render(<NutritionTab />);
    await fireEvent.press(nutrition.getByLabelText("Add food"));
    await expectAccessible(nutrition.container, 30);
  } finally {
    db.close();
  }
});

test("the logger, its menus, Progression and Finish", async () => {
  const { r, db } = lifter();
  try {
    inProgress(r);
    const view = await render(<WorkoutScreen />);
    await expectAccessible(view.container, 15);
    await fireEvent.press(view.getByLabelText("Workout options"));
    await expectAccessible(view.container, 20);
    await view.unmount();
    const card = await render(<WorkoutScreen />);
    await fireEvent.press(
      card.getByLabelText("Options for Barbell Bench Press"),
    );
    await expectAccessible(card.container, 20);
    await fireEvent.press(card.getByRole("menuitem", { name: "Progression" }));
    await waitFor(() =>
      expect(card.getByRole("header", { name: "Progression" })).toBeTruthy(),
    );
    await expectAccessible(card.container, 20);
    await card.unmount();
    const finish = await render(<WorkoutScreen />);
    await fireEvent.press(finish.getByLabelText("Finish workout"));
    await expectAccessible(finish.container, 20);
  } finally {
    db.close();
  }
});

test("on the smallest iPhone at twice the text size", async () => {
  Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
  const { r, db } = lifter();
  try {
    for (const [screen, atLeast] of [
      [<Home key="home" />, 8],
      [<NutritionTab key="nutrition" />, 10],
      [<Progress key="progress" />, 20],
    ] as const) {
      const view = await render(screen);
      await expectAccessible(view.container, atLeast);
      await view.unmount();
    }
    inProgress(r);
    const view = await render(<WorkoutScreen />);
    await expectAccessible(view.container, 15);
  } finally {
    db.close();
  }
});
