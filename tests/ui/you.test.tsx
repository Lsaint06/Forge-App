import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import You from "../../src/screens/You";
import Preferences from "../../src/screens/Preferences";
import Account from "../../app/account";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { cancelAllNotifications } from "../../src/notifications";

// Phase 6: the You tab profile and settings. The lifetime snapshot is the
// performance strip since Phase 7.5C; since 7.5D the settings live in
// Preferences and the data actions in Account & privacy.

jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number }) => unknown) =>
      selector({ revision: 0 }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
const params: { edit?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => params,
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete params.edit;
});

type Repo = ReturnType<typeof pathRepository>["r"];
function finished(r: Repo) {
  const w = r.startWorkout("Push day");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.addSet(row.id);
  r.addSet(row.id);
  for (const s of r.workoutSets(w.id))
    r.editSet(s.id, { completed: true, weight: 50, reps: 5 });
  r.finishWorkout(w.id);
  return w;
}

test("a new lifter sees their identity, an empty performance strip and no plan", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex Smith" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    // 7.5B: the athlete's name is the screen's header (approved reference).
    expect(view.getByRole("header", { name: "Alex Smith" })).toBeTruthy();
    expect(view.getByText("AS", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText("No workouts yet")).toBeTruthy();
    expect(
      view.getByText(/record starts with your first workout/),
    ).toBeTruthy();
    // No row of zeros for someone who hasn't trained.
    expect(view.queryByLabelText(/^Workouts? completed: /)).toBeNull();
    // 7.5D: membership is shown in Account & privacy, not on You.
    expect(view.queryByTestId("you-membership")).toBeNull();
    expect(view.queryByText(/\$|subscribe|purchase/i)).toBeNull();
    // No plan: the plan card says so and opens Forge Paths.
    expect(view.getByRole("header", { name: "No active plan" })).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Browse Forge Paths" }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    db.close();
  }
});

test("the performance strip reuses recorded training and the plan card opens the program", async () => {
  const { r, db } = pathRepository();
  try {
    const program = libraryPrograms()[0]!;
    r.saveProfile({ onboarded: true });
    enrollProgram(r, program, "2026-10-19");
    finished(r);
    finished(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    expect(view.getByLabelText("Workouts completed: 2")).toBeTruthy();
    expect(view.getByLabelText("Day streak: 1")).toBeTruthy();
    expect(view.getByLabelText("Week consistent: 1")).toBeTruthy();
    expect(view.getByText(/^Training since /)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Your program: ${program.name}`));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    // Progress stays one tap away from You: the streak pill (and its tab).
    await fireEvent.press(view.getByLabelText("1 day streak. Open progress"));
    expect(router.navigate).toHaveBeenLastCalledWith("/(tabs)/progress");
  } finally {
    db.close();
  }
});

test("focused editors save only their own fields", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({
      onboarded: true,
      name: "Alex",
      height: 180,
      weight: 80,
      calories: 2000,
    });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    await fireEvent.press(view.getByLabelText("Edit profile"));
    expect(view.getByLabelText("Display name")).toBeTruthy();
    expect(view.queryByLabelText("Protein goal (g)")).toBeNull();
    expect(view.queryByText("Enable local notifications")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Display name"), "Sam");
    await fireEvent.press(view.getByText("Save profile"));
    expect(r.profile().name).toBe("Sam");
    expect(r.profile().calories).toBe(2000);

    // Nutrition targets is in Preferences (7.5D): the same editor.
    await view.unmount();
    const prefs = await render(<Preferences />);
    await fireEvent.press(prefs.getByLabelText("Nutrition targets"));
    await fireEvent.changeText(prefs.getByLabelText("Protein goal (g)"), "180");
    await fireEvent.press(prefs.getByText("Save targets"));
    expect(r.profile().protein).toBe(180);
    expect(r.profile().name).toBe("Sam");
  } finally {
    db.close();
  }
});

test("Library's complete-profile link opens the training focus editor", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    params.edit = "focus";
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    expect(view.getByText("Save training focus")).toBeTruthy();
    expect(router.setParams).toHaveBeenCalledWith({ edit: undefined });
  } finally {
    db.close();
  }
});

test("units, appearance and reminders save instantly (Preferences)", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, units: "kg", theme: "dark" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Preferences />);
    await fireEvent.press(view.getByText("Pounds"));
    expect(r.profile().units).toBe("lb");
    await fireEvent.press(view.getByText("Light"));
    expect(r.profile().theme).toBe("light");
    r.saveProfile({ notifications: true });
    await fireEvent(
      view.getByLabelText("Training reminders switch"),
      "valueChange",
      false,
    );
    expect(r.profile().notifications).toBe(false);
    expect(cancelAllNotifications).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("account, history, journals and data actions stay reachable", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    finished(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    // 7.5D: one Tools & settings card on You.
    await fireEvent.press(view.getByLabelText("Account & privacy"));
    expect(router.push).toHaveBeenLastCalledWith("/account");
    await fireEvent.press(view.getByLabelText("Preferences"));
    expect(router.push).toHaveBeenLastCalledWith("/preferences");
    await fireEvent.press(view.getByLabelText("Training history"));
    expect(router.push).toHaveBeenLastCalledWith("/history");
    for (const [label, kind] of [
      ["Body measurements", "measurement"],
      ["Recovery", "recovery"],
      ["Goals", "goal"],
    ]) {
      await fireEvent.press(view.getByLabelText(label!));
      expect(router.push).toHaveBeenLastCalledWith({
        pathname: "/journal",
        params: { kind },
      });
    }
    // Nutrition is a tab (7.1A); You no longer repeats it as a row.
    expect(view.queryByLabelText("Nutrition log")).toBeNull();
    await view.unmount();

    // The data actions, unchanged, in Account & privacy.
    const account = await render(<Account />);
    await fireEvent.press(
      account.getByLabelText("Privacy & training guidance"),
    );
    expect(account.getByText(/No advertising or analytics SDK/)).toBeTruthy();
    expect(account.getByLabelText("Export backup")).toBeTruthy();
    expect(account.getByLabelText("Import backup")).toBeTruthy();

    await fireEvent.press(account.getByLabelText("Delete all local data"));
    expect(confirm).toHaveBeenCalledWith(
      "Delete all local data?",
      expect.stringContaining("export a backup first"),
      expect.any(Function),
      { action: "Delete everything" },
    );
    // Nothing is deleted until the lifter confirms.
    expect(r.workouts()).toHaveLength(1);
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(r.workouts()).toHaveLength(0);
    expect(router.replace).toHaveBeenCalledWith("/onboarding");
  } finally {
    db.close();
  }
});
