import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import Train from "../../app/(tabs)/train";
import Progress from "../../app/(tabs)/progress";
import HistoryRoute from "../../app/history";
import ExploreRoute from "../../app/explore";
import ExerciseRoute from "../../app/exercise";
import CalendarRoute from "../../app/calendar";
import TemplatesRoute from "../../app/templates";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { freshPathRepository } from "../legacy-fixture";
import { programLibrary } from "../../src/programs";
import {
  currentEnrollment,
  enrollProgram,
  programWorkoutContext,
} from "../../src/data/programs";
import { pathPrograms } from "../../src/data/paths";
import { addDays } from "../../src/domain/paths/model";
import { localDate } from "../../src/domain/types";

// Phase 7.2B: the Train hub (dynamic hero, Start a workout, Training tools)
// and Training History's move to You.

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
    (selector: (s: { profile: undefined }) => unknown) =>
      selector({ profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
});

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
const program = programLibrary.find(
  (p) => p.id === "forge-strength-intermediate-3-day",
)!;
const firstSession = program.phases[0]!.sessions[0]!.name;
// Session names contain regex characters ("Squat + Bench").
const session = firstSession.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type Repo = ReturnType<typeof pathRepository>["r"];
function template(r: Repo, name: string) {
  return r.saveTemplate(name, [
    {
      exerciseId: "barbell-bench-press",
      sets: 3,
      reps: 8,
      weight: 40,
      rest: 90,
    },
  ]);
}

test("without a plan the hero offers Forge Paths; templates are optional", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByText("Find your program")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Browse Forge Paths"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
    // No templates yet: Empty workout and one clear way to make one.
    expect(view.queryAllByText("Start")).toHaveLength(0);
    expect(
      view.getByLabelText("Workout templates").props.accessibilityHint,
    ).toBe("Save a workout you repeat");
    await fireEvent.press(view.getByLabelText("Start empty workout"));
    expect(r.active()).toBeDefined();
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("an active program shows its progress and starts its due session through the program", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const { id } = enrollProgram(r, program, localDate());
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByText("Your program")).toBeTruthy();
    expect(
      view.getByRole("header", { name: currentEnrollment(r)!.data.name }),
    ).toBeTruthy();
    expect(
      view.getByLabelText(
        `${program.experience} · ${program.daysPerWeek} days a week`,
      ),
    ).toBeTruthy();
    expect(view.getByText(/^0 of \d+ sessions$/)).toBeTruthy();
    expect(
      view.getByLabelText(new RegExp(`^Up next: ${session}, `)),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("View plan"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    // Start uses the program's own start: the workout is a program session.
    const start = view.getByLabelText(
      new RegExp(`^Start ${session}( early)?$`),
    );
    await fireEvent.press(start);
    const w = r.active()!;
    expect(programWorkoutContext(r, w.id)?.enrollment.record.id).toBe(id);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("a program starting later offers Start early with its suggested day", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    enrollProgram(r, program, addDays(localDate(), 3));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByLabelText(`Start ${firstSession} early`)).toBeTruthy();
    expect(view.getByText(/^Suggested for /)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("an existing Path shows its sessions and opens its own screen", async () => {
  const { r, db } = freshPathRepository();
  try {
    const path = pathPrograms(r)[0]!;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByText("Your Path")).toBeTruthy();
    expect(view.getByText(/ of 32 sessions$/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("View plan"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/paths",
      params: { programId: path.record.id },
    });
  } finally {
    db.close();
  }
});

test("a workout in progress takes the hero: Resume only, nothing else starts", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    enrollProgram(r, program, localDate());
    const t = template(r, "Upper A");
    const active = r.startWorkout("Freestyle");
    r.addSet(r.addExercise(active.id, "barbell-bench-press").id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByText("Workout in progress")).toBeTruthy();
    expect(view.getByLabelText("0 of 1 sets")).toBeTruthy();
    // The plan's Start and View plan give way to Resume.
    expect(view.queryByLabelText(new RegExp(`^Start ${session}`))).toBeNull();
    expect(view.queryByLabelText("View plan")).toBeNull();
    await fireEvent.press(view.getByLabelText("Resume workout"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    // Empty and template starts are disabled; nothing new is created.
    const empty = view.getByLabelText("Start empty workout");
    expect(empty.props.accessibilityState).toMatchObject({ disabled: true });
    expect(view.getByText("Finish your current workout first")).toBeTruthy();
    await fireEvent.press(empty);
    await fireEvent.press(view.getByLabelText(`Start ${t.name}`));
    expect(r.workouts()).toHaveLength(1);
    // Paused reads as paused.
    r.pauseWorkout(active.id);
    await view.rerender(<Train />);
    expect(view.getByText("Workout paused")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("template shortcuts lead with the most recently trained, three at most", async () => {
  const { r, db } = pathRepository();
  try {
    const [a, , , d] = ["A", "B", "C", "D"].map((n) => template(r, n));
    for (const t of [a!, d!]) {
      const w = r.startWorkout(t.name, t.id);
      r.finishWorkout(w.id);
    }
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    const starts = view
      .getAllByLabelText(/^Start [A-D]$/)
      .map((el) => el.props.accessibilityLabel);
    // D was trained last, then A; B is the first untrained by name.
    expect(starts).toEqual(["Start D", "Start A", "Start B"]);
    expect(view.getByLabelText("Workout templates")).toBeTruthy();
    expect(view.getByText("4")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Training tools reach every destination; old deep links still resolve", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    for (const [label, route] of [
      ["Forge Paths", "/forge-paths"],
      ["Exercise library", "/explore"],
      ["Training calendar", "/calendar"],
    ] as const) {
      await fireEvent.press(view.getByLabelText(label));
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
    // Routes removed from the hub's presentation remain screens.
    for (const route of [
      HistoryRoute,
      ExploreRoute,
      ExerciseRoute,
      CalendarRoute,
      TemplatesRoute,
    ])
      expect(typeof route).toBe("function");
  } finally {
    db.close();
  }
});

test("Progress keeps its contextual link to Training history", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Progress />);
    await fireEvent.press(view.getByLabelText("Training history"));
    expect(router.push).toHaveBeenLastCalledWith("/history");
  } finally {
    db.close();
  }
});

test("compact screens and large text keep every action reachable at 44 pt", async () => {
  const { r, db } = pathRepository();
  try {
    template(r, "Upper A");
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    const height = (label: string) =>
      Number(flat(view.getByLabelText(label)).minHeight ?? 0);
    expect(height("Browse Forge Paths")).toBeGreaterThanOrEqual(44);
    expect(height("Start empty workout")).toBeGreaterThanOrEqual(44);
    expect(height("Start Upper A")).toBeGreaterThanOrEqual(44);
    expect(height("Upper A details")).toBeGreaterThanOrEqual(44);
    expect(height("Workout templates")).toBeGreaterThanOrEqual(44);
    for (const label of [
      "Forge Paths",
      "Exercise library",
      "Training calendar",
    ])
      expect(height(label)).toBeGreaterThanOrEqual(44);
    expect(view.getByLabelText(/day streak\. Open progress$/)).toBeTruthy();
  } finally {
    db.close();
  }
});
