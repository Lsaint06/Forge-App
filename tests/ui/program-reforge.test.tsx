import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { router } from "expo-router";
import Library from "../../src/screens/programs/Library";
import Details from "../../src/screens/programs/Details";
import Dashboard from "../../src/screens/programs/Dashboard";
import LegacyPath from "../../src/screens/LegacyPath";
import Profile from "../../app/(tabs)/profile";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { legacyUserRepository } from "../legacy-fixture";
import { placeholderProgram } from "../program-fixture";
import {
  currentEnrollment,
  enrollProgram,
  startProgramSession,
} from "../../src/data/programs";
import { currentPath, pausePath } from "../../src/data/paths";
import { localDate } from "../../src/domain/types";
import type { CuratedProgram } from "../../src/domain/programs/model";

// Phase 7.2C-1: Forge Paths, program details, the program dashboard and the
// existing Path on the REFORGE secondary-screen frame. Behaviour is covered
// by forge-paths, program-details and legacy-path; these tests pin the new
// presentation states.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
const mockLibrary: CuratedProgram[] = [];
jest.mock("../../src/programs", () => {
  const model = jest.requireActual("../../src/domain/programs/model");
  return {
    get programLibrary() {
      return mockLibrary;
    },
    programSources: [],
    programLock: {},
    libraryPrograms: () => model.publishedPrograms(mockLibrary),
    libraryProgram: (id: string, version: number) =>
      model.findProgramVersion(mockLibrary, id, version),
  };
});
jest.mock("../../src/programs/preview", () => ({ draftPreviewEnabled: false }));
const mockParams: { programId?: string; version?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
  notifyAt: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
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

// A published three-session program: one week, so "complete" is reachable.
const short = placeholderProgram({
  status: "published",
  id: "test-short",
  name: "Test Short Program With A Deliberately Long Name For Wrapping",
  durationWeeks: 1,
  phases: [
    {
      ...placeholderProgram().phases[0]!,
      name: "Week 1 · Base",
      weeks: 1,
    },
  ],
});
const muscle = placeholderProgram({
  status: "published",
  id: "test-muscle",
  name: "Test Muscle Program",
  goal: "Muscle Building",
  experience: "Intermediate",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLibrary.splice(0, mockLibrary.length, short, muscle);
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  delete mockParams.programId;
  delete mockParams.version;
});

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
const height = (el: { props: { style?: unknown } }) =>
  Number(flat(el).minHeight ?? flat(el).height ?? 0);

function enrolled() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, restDay: 6 });
  const { id } = enrollProgram(fixture.r, short, localDate());
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return { ...fixture, id };
}
type Repo = ReturnType<typeof pathRepository>["r"];
function finish(r: Repo, workoutId: string) {
  for (const row of r.workoutExercises(workoutId))
    for (const set of r.sets(row.id))
      r.editSet(set.id, { completed: true, weight: 40, reps: 1 });
  r.finishWorkout(workoutId);
}

test("secondary screens share one frame: Back, overline and a condensed title header", async () => {
  const { db } = enrolled();
  try {
    const view = await render(<Library />);
    const back = view.getByLabelText("Back");
    expect(height(back)).toBeGreaterThanOrEqual(44);
    expect(view.getByRole("header", { name: "Forge Paths" })).toBeTruthy();
    expect(view.getByText("2 programs")).toBeTruthy();
    // No brand header on secondary screens (C1).
    expect(view.queryByLabelText("FORGE")).toBeNull();
    // The plan is one row at the top; families are rows by goal.
    const plan = view.getByLabelText(`Your program: ${short.name}`);
    expect(
      plan.props.accessibilityHint.replace(/[\u00a0\u2060]/g, (ch: string) =>
        ch === "\u00a0" ? " " : "",
      ),
    ).toBe("Week 1 · 0 of 3 sessions");
    await fireEvent.press(plan);
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    expect(
      height(
        view.getByLabelText("Intermediate Muscle Building, 3 days · Ongoing"),
      ),
    ).toBeGreaterThanOrEqual(56);
  } finally {
    db.close();
  }
});

test("the recommendation is the library's hero with one primary action", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Beginner", goal: "Strength" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Library />);
    expect(view.getByText("Recommended for you")).toBeTruthy();
    expect(view.getByRole("header", { name: short.name })).toBeTruthy();
    expect(view.getAllByRole("button", { name: "View program" })).toHaveLength(
      1,
    );
  } finally {
    db.close();
  }
});

test("program details pin Start program; long names wrap; compact large text keeps 44 pt", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    Object.assign(mockDims, { width: 320, height: 568, fontScale: 2 });
    mockParams.programId = short.id;
    mockParams.version = String(short.version);
    const view = await render(<Details />);
    const title = view.getByRole("header", { name: short.name });
    expect(title.props.numberOfLines).toBe(3);
    expect(view.getByText("Beginner · Strength")).toBeTruthy();
    // Stats in one strip: days, weeks and sessions.
    expect(view.getByLabelText("Days a week: 3")).toBeTruthy();
    expect(view.getByLabelText("Weeks: 1")).toBeTruthy();
    expect(view.getByLabelText("Sessions: 3")).toBeTruthy();
    for (const label of [
      "Back",
      "Start program",
      "How progression works",
      "About this program",
      "Week 1 · Base, details",
    ])
      expect(height(view.getByLabelText(label))).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});

test("the dashboard's next session is the hero: start, then resume", async () => {
  const { db } = enrolled();
  try {
    const view = await render(<Dashboard />);
    expect(view.getByText("Your program")).toBeTruthy();
    expect(view.getByText("Week 1 of 1 · Week 1 · Base")).toBeTruthy();
    expect(
      view.getByRole("progressbar", { name: "Program completion" }),
    ).toBeTruthy();
    expect(view.getByText("Next session")).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Placeholder session a" }),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Start session"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    await view.rerender(<Dashboard />);
    // The hero's overline and the session's row in Recent sessions.
    expect(view.getAllByText("In progress")).toHaveLength(2);
    expect(view.getByLabelText("Resume session")).toBeTruthy();
    expect(view.queryByLabelText("Skip this session")).toBeNull();
  } finally {
    db.close();
  }
});

test("another workout in progress turns the session's action into Resume current workout", async () => {
  const { r, db } = enrolled();
  try {
    r.startWorkout("Freestyle");
    const view = await render(<Dashboard />);
    expect(view.queryByLabelText("Start session")).toBeNull();
    expect(view.getByText(/Freestyle is in progress/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Resume current workout"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("a completed program offers the next one; End program is gone", async () => {
  const { r, db, id } = enrolled();
  try {
    for (let i = 0; i < 3; i++) finish(r, startProgramSession(r, id).id);
    const view = await render(<Dashboard />);
    expect(view.getAllByText("Program complete").length).toBeGreaterThan(0);
    expect(view.queryByLabelText("Start session")).toBeNull();
    expect(view.queryByLabelText("End program")).toBeNull();
    await fireEvent.press(view.getByLabelText("Choose your next program"));
    expect(currentEnrollment(r)).toBeUndefined();
    expect(router.replace).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    db.close();
  }
});

test("a program version missing from this app is explained and can still be ended", async () => {
  const { r, db } = enrolled();
  try {
    mockLibrary.splice(0, mockLibrary.length, muscle);
    const view = await render(<Dashboard />);
    expect(view.getByText("Program unavailable")).toBeTruthy();
    expect(
      view.getByText(/is not available in this app version\. Your history/),
    ).toBeTruthy();
    expect(view.queryByLabelText("Program details")).toBeNull();
    expect(view.getByLabelText("Browse programs")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("End program"));
    expect(jest.mocked(confirm).mock.calls.at(-1)![0]).toBe(
      "End this program?",
    );
    expect(r.workouts()).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("a paused Path says so and keeps Manage Path and the program prompt", async () => {
  const { r, db } = legacyUserRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    await act(async () => pausePath(r, currentPath(r)!.record.id));
    const view = await render(<LegacyPath />);
    expect(view.getByText("Paused · your progress is safe")).toBeTruthy();
    expect(view.queryByLabelText("Start workout")).toBeNull();
    expect(height(view.getByLabelText("Manage Path"))).toBeGreaterThanOrEqual(
      44,
    );
    await fireEvent.press(view.getByLabelText("Browse Forge programs"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
    await fireEvent.press(view.getByLabelText("Manage Path"));
    expect(view.getByRole("header", { name: "Manage your Path" })).toBeTruthy();
    expect(view.getByLabelText("Resume Path")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("You counts the published programs instead of a fixed number (C7)", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Profile />);
    // 7.5B: the empty plan card states the published count.
    expect(
      view.getByText(
        "Choose one of 2 curated Forge Paths programs and it becomes part of your profile here.",
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});
