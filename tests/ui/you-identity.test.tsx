import React from "react";
import { Alert, StyleSheet } from "react-native";
import { act, render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import You from "../../src/screens/You";
import Preferences from "../../src/screens/Preferences";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { freshPathRepository } from "../legacy-fixture";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { pathPrograms } from "../../src/data/paths";
import { localDate } from "../../src/domain/types";
import { theme } from "../../src/theme";

// Phase 7.5B: the You tab's athlete identity and current-plan card.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: mockProfile }),
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
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

type Repo = ReturnType<typeof pathRepository>["r"];
function finished(r: Repo, daysAgo = 0) {
  const w = r.startWorkout("Push day");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { completed: true, weight: 50, reps: 5 });
  r.finishWorkout(w.id);
  if (daysAgo) {
    const end = Date.now() - daysAgo * 86400000;
    // Move it back so "Training since" and the streak are deterministic.
    (r as unknown as { db: { run: (s: string, p: unknown[]) => void } }).db.run(
      "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
      [end - 3000000, end, w.id],
    );
  }
  return w;
}
const identity = (view: Awaited<ReturnType<typeof render>>) =>
  within(view.getByTestId("you-identity"));
const direction = (view: Awaited<ReturnType<typeof render>>) =>
  StyleSheet.flatten(view.getByTestId("you-identity").props.style)
    .flexDirection;

test("identity: name as header, monogram, experience, focus and training since", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({
      onboarded: true,
      name: "Alex Carter",
      experience: "Intermediate",
      goal: "Strength",
      restDay: 0,
    });
    finished(r, 40);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const id = identity(view);
    expect(id.getByRole("header", { name: "Alex Carter" })).toBeTruthy();
    expect(id.getByText("AC", { includeHiddenElements: true })).toBeTruthy();
    expect(id.getByText("Intermediate lifter")).toBeTruthy();
    expect(id.getByText("Strength focus")).toBeTruthy();
    expect(id.getByText(/^Training since \w+/)).toBeTruthy();
    // The monogram is decorative; the name carries the meaning.
    expect(
      view.getByTestId("you-monogram", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(view.queryByLabelText("AC")).toBeNull();
    // No incomplete-profile prompt when everything is set.
    expect(view.queryByTestId("you-profile-prompt")).toBeNull();
    // The edit badge opens the existing profile editor.
    const edit = id.getByRole("button", { name: "Edit profile" });
    const s = StyleSheet.flatten(edit.props.style);
    expect(
      Number(s.width) + 2 * Number(edit.props.hitSlop),
    ).toBeGreaterThanOrEqual(44);
    await fireEvent.press(edit);
    expect(view.getByLabelText("Display name")).toBeTruthy();
    expect(view.getByText("Save profile")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("missing details: nothing invented, the focus invites the lifter", async () => {
  const { r, db } = pathRepository();
  try {
    // The schema never stores a blank name: the default is "Athlete".
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const id = identity(view);
    expect(id.getByRole("header", { name: "Athlete" })).toBeTruthy();
    expect(id.getByText("A", { includeHiddenElements: true })).toBeTruthy();
    expect(id.queryByText(/lifter$/)).toBeNull();
    expect(id.getByText("No workouts yet")).toBeTruthy();
    // The existing prompt for recommendations stays, as a REFORGE row.
    expect(view.getByTestId("you-profile-prompt")).toBeTruthy();
    await fireEvent.press(
      id.getByRole("button", { name: "Set your training focus" }),
    );
    expect(view.getByText("Save training focus")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a long name wraps to two lines, never truncated to a single one", async () => {
  const { r, db } = pathRepository();
  try {
    const long = "Maximilian Alexander Featherstonehaugh-Montgomery";
    r.saveProfile({ onboarded: true, name: long });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const header = identity(view).getByRole("header", { name: long });
    expect(header.props.numberOfLines).toBe(2);
    expect(
      identity(view).getByText("MA", { includeHiddenElements: true }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("current program: name, Forge Paths source, week, level, progress and next; opens the program", async () => {
  const { r, db } = pathRepository();
  try {
    const program = libraryPrograms()[0]!;
    r.saveProfile({ onboarded: true });
    enrollProgram(r, program, localDate());
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const card = view.getByLabelText(`Your program: ${program.name}`);
    const plan = within(card);
    expect(plan.getByText("Your program")).toBeTruthy();
    expect(plan.getByText(program.name)).toBeTruthy();
    expect(plan.getByText(/^Week 1 · /)).toBeTruthy();
    // The source and level share one quiet meta line.
    expect(
      plan.getByText(
        `Forge Paths · ${program.experience} · ${program.daysPerWeek} days a week`,
      ),
    ).toBeTruthy();
    // Closed programs count "0 of N sessions", open-ended ones "0 sessions completed".
    expect(
      plan.getByText(/^0 (of \d+ sessions|sessions completed)$/),
    ).toBeTruthy();
    expect(plan.getByText("Up next")).toBeTruthy();
    expect(plan.getByText("View plan")).toBeTruthy();
    await fireEvent.press(card);
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
  } finally {
    db.close();
  }
});

test("an existing Path is named as a Path, without a Forge Paths source", async () => {
  const { r, db } = freshPathRepository();
  try {
    const path = pathPrograms(r)[0]!;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const card = view.getByLabelText(`Your Path: ${path.data.name}`);
    expect(within(card).getByText("Your Path")).toBeTruthy();
    expect(within(card).queryByText(/Forge Paths/)).toBeNull();
    expect(within(card).getByText(/ of 32 sessions$/)).toBeTruthy();
    await fireEvent.press(card);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/paths",
      params: { programId: path.record.id },
    });
  } finally {
    db.close();
  }
});

test("no plan: an honest empty card that opens Forge Paths", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const plan = within(view.getByTestId("you-plan"));
    expect(plan.getByRole("header", { name: "No active plan" })).toBeTruthy();
    expect(plan.queryByText(/^Week /)).toBeNull();
    expect(plan.queryByRole("progressbar")).toBeNull();
    await fireEvent.press(
      plan.getByRole("button", { name: "Browse Forge Paths" }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    db.close();
  }
});

test("brand header: the shared day streak opens Progress", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    finished(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    expect(view.getByLabelText("FORGE")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("1 day streak. Open progress"));
    expect(router.navigate).toHaveBeenLastCalledWith("/(tabs)/progress");
  } finally {
    db.close();
  }
});

test("deep links still open their editors once", async () => {
  for (const [edit, save] of [
    ["profile", "Save profile"],
    ["training", "Save preferences"],
    ["nutrition", "Save targets"],
  ]) {
    const { r, db } = pathRepository();
    try {
      r.saveProfile({ onboarded: true });
      params.edit = edit;
      jest.mocked(useRepo).mockReturnValue(r);
      const view = await render(<You />);
      expect(view.getByText(save!)).toBeTruthy();
      expect(router.setParams).toHaveBeenCalledWith({ edit: undefined });
      await view.unmount();
    } finally {
      db.close();
      delete params.edit;
    }
  }
});

test("compact screens and large text stack the identity; light mode uses the light palette", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex Carter" });
    jest.mocked(useRepo).mockReturnValue(r);
    const roomy = await render(<You />);
    expect(direction(roomy)).toBe("row");
    await roomy.unmount();
    mockDims.width = 320;
    const small = await render(<You />);
    expect(direction(small)).toBe("column");
    await small.unmount();
    Object.assign(mockDims, { width: 393, fontScale: 2 });
    const large = await render(<You />);
    expect(direction(large)).toBe("column");
    await large.unmount();
    Object.assign(mockDims, { width: 393, fontScale: 1 });
    mockProfile = { theme: "light" };
    const light = await render(<You />);
    const name = identity(light).getByRole("header", { name: "Alex Carter" });
    expect(StyleSheet.flatten(name.props.style).color).toBe(
      theme.palettes.light.text,
    );
    // The monogram ring is drawn in SVG: a light-palette ember halo around a
    // gradient-stroked ring.
    const circles = light.container.queryAll(
      (n) => n.type === "RNSVGCircle",
    ) as unknown as { props: Record<string, unknown> }[];
    const argb = (hex: string) => parseInt(`FF${hex.slice(1)}`, 16);
    expect(
      circles.some(
        (n) =>
          (n.props.stroke as { payload?: number } | undefined)?.payload ===
          argb(theme.palettes.light.emberHot),
      ),
    ).toBe(true);
    expect(
      light.getByTestId("you-monogram-ring", { includeHiddenElements: true }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

// ---- Phase 7.5B.1: the REFORGE profile editor ---------------------------------

type Btn = { text?: string; onPress?: () => void };
const alertButtons = (spy: jest.SpyInstance) =>
  (spy.mock.calls.at(-1)?.[2] ?? []) as Btn[];

test("Edit profile: grouped fields, a live preview and a saved name in the header", async () => {
  const { r, db } = pathRepository();
  try {
    // Edit profile requires height and weight, as before.
    r.saveProfile({
      onboarded: true,
      name: "Alex Carter",
      height: 180,
      weight: 80,
    });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    await fireEvent.press(
      identity(view).getByRole("button", { name: "Edit profile" }),
    );
    // Identity, then body, each a labelled group.
    expect(view.getByText("Identity")).toBeTruthy();
    expect(view.getByText("Body")).toBeTruthy();
    expect(view.getByLabelText("Preview: Alex Carter")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Display name"), "Sam  Lee");
    // The preview follows the typing; nothing is stored yet.
    const preview = within(view.getByTestId("you-identity-preview"));
    expect(preview.getByText("Sam Lee")).toBeTruthy();
    expect(preview.getByText("SL")).toBeTruthy();
    expect(r.profile().name).toBe("Alex Carter");
    await fireEvent.press(view.getByText("Save profile"));
    expect(r.profile().name).toBe("Sam  Lee");
    expect(view.queryByText("Save profile")).toBeNull();
    // The identity header and monogram show the saved name.
    const id = identity(view);
    expect(id.getByRole("header", { name: "Sam  Lee" })).toBeTruthy();
    expect(id.getByText("SL", { includeHiddenElements: true })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Edit profile has no body fat field, and saving keeps a stored body fat value", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({
      onboarded: true,
      name: "Alex Carter",
      height: 180,
      weight: 80,
      bodyFat: 18.5,
    });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    await fireEvent.press(
      identity(view).getByRole("button", { name: "Edit profile" }),
    );
    expect(view.queryByLabelText(/body fat/i)).toBeNull();
    expect(view.queryByText(/body fat/i)).toBeNull();
    // Name, height and weight remain.
    expect(view.getByLabelText("Display name")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Display name"), "Sam Lee");
    await fireEvent.press(view.getByText("Save profile"));
    expect(view.queryByText("Save profile")).toBeNull();
    expect(r.profile()).toMatchObject({
      name: "Sam Lee",
      height: 180,
      weight: 80,
      bodyFat: 18.5,
    });
    // An unrelated editor (in Preferences since 7.5D) keeps it too.
    await view.unmount();
    const prefs = await render(<Preferences />);
    await fireEvent.press(prefs.getByText("Training preferences"));
    await fireEvent.press(prefs.getByText("Save preferences"));
    expect(prefs.queryByText("Save preferences")).toBeNull();
    expect(r.profile().bodyFat).toBe(18.5);
  } finally {
    db.close();
  }
});

test("Edit profile: Cancel closes at once when clean and asks before discarding edits", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex Carter" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    const open = () =>
      fireEvent.press(
        identity(view).getByRole("button", { name: "Edit profile" }),
      );
    await open();
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(alert).not.toHaveBeenCalled();
    expect(view.queryByText("Save profile")).toBeNull();

    await open();
    await fireEvent.changeText(view.getByLabelText("Display name"), "Sam");
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenLastCalledWith(
      "Discard changes?",
      expect.any(String),
      expect.any(Array),
    );
    // Keep editing leaves the sheet and the typed name in place.
    expect(view.getByText("Save profile")).toBeTruthy();
    const discard = alertButtons(alert).find((b) => b.text === "Discard");
    await act(async () => discard!.onPress!());
    expect(view.queryByText("Save profile")).toBeNull();
    expect(r.profile().name).toBe("Alex Carter");
    expect(
      identity(view).getByRole("header", { name: "Alex Carter" }),
    ).toBeTruthy();
  } finally {
    alert.mockRestore();
    db.close();
  }
});

test("Edit profile: an empty name is refused with a visible error and nothing is saved", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex Carter" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    await fireEvent.press(
      identity(view).getByRole("button", { name: "Edit profile" }),
    );
    await fireEvent.changeText(view.getByLabelText("Display name"), "  ");
    // The preview never shows a blank identity.
    expect(view.getByLabelText("Preview: Athlete")).toBeTruthy();
    await fireEvent.press(view.getByText("Save profile"));
    expect(alert).toHaveBeenCalledWith(
      "Check your settings",
      expect.any(String),
    );
    expect(view.getByText("Save profile")).toBeTruthy();
    expect(r.profile().name).toBe("Alex Carter");
  } finally {
    alert.mockRestore();
    db.close();
  }
});

test("every editor entry point opens its REFORGE editor; only Edit profile previews the name", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    type View = Awaited<ReturnType<typeof render>>;
    const check = async (
      view: View,
      open: () => Promise<unknown>,
      save: string,
      group: string,
    ) => {
      await open();
      expect(view.getByText(save)).toBeTruthy();
      expect(view.getByText(group)).toBeTruthy();
      expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(!!view.queryByTestId("you-identity-preview")).toBe(
        save === "Save profile",
      );
      await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
      expect(view.queryByText(save)).toBeNull();
    };
    // On You: Edit profile and the focus invitation.
    const you = await render(<You />);
    await check(
      you,
      () =>
        fireEvent.press(
          identity(you).getByRole("button", { name: "Edit profile" }),
        ),
      "Save profile",
      "Identity",
    );
    await check(
      you,
      () =>
        fireEvent.press(
          identity(you).getByRole("button", {
            name: "Set your training focus",
          }),
        ),
      "Save training focus",
      "Save training focus",
    );
    await you.unmount();
    // In Preferences (7.5D): the same editors.
    const prefs = await render(<Preferences />);
    for (const [row, save, group] of [
      ["Training focus", "Save training focus", "Save training focus"],
      ["Training preferences", "Save preferences", "Progression"],
      ["Nutrition targets", "Save targets", "Daily targets"],
    ] as const)
      await check(
        prefs,
        () => fireEvent.press(prefs.getByLabelText(row)),
        save,
        group,
      );
  } finally {
    db.close();
  }
});
test("the editor holds up on compact screens, large text and the light palette", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Maximilian Featherstonehaugh" });
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    await fireEvent.press(
      identity(view).getByRole("button", { name: "Edit profile" }),
    );
    const name = view.getByLabelText("Display name");
    expect(name.props.value).toBe("Maximilian Featherstonehaugh");
    // The preview wraps a long name rather than cutting it to one line.
    const shown = within(view.getByTestId("you-identity-preview")).getByText(
      "Maximilian Featherstonehaugh",
    );
    expect(shown.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(shown.props.style).color).toBe(
      theme.palettes.light.text,
    );
    // Save and Cancel stay comfortable touch targets.
    for (const label of ["Cancel", "Save profile"]) {
      const b = view.getByRole("button", { name: label });
      expect(
        Number(StyleSheet.flatten(b.props.style).minHeight ?? 0),
      ).toBeGreaterThanOrEqual(44);
    }
  } finally {
    db.close();
  }
});
