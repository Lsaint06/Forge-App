import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { dark } from "../../src/components/ui";
import Library from "../../src/screens/programs/Library";
import Details from "../../src/screens/programs/Details";
import Dashboard from "../../src/screens/programs/Dashboard";
import { WorkoutList } from "../../src/components/programs";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { libraryPrograms } from "../../src/programs";
import {
  currentEnrollment,
  enrollProgram,
  programProgress,
  startProgramSession,
} from "../../src/data/programs";
import { reducedSets } from "../../src/domain/programs/progression";
import { prescriptionLine } from "../../src/domain/programs/presentation";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import type { CuratedProgram } from "../../src/domain/programs/model";

// Phase 4 with the real published library: distinct programs, phase-specific
// programming kept visible, enrollment and the program dashboard.

const mockParams: { programId?: string; version?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

const program = (id: string) => libraryPrograms().find((p) => p.id === id)!;
const strength4 = program("forge-strength-intermediate-4-day");
function show(p: CuratedProgram) {
  mockParams.programId = p.id;
  mockParams.version = String(p.version);
}
type Repo = ReturnType<typeof pathRepository>["r"];
function finish(r: Repo, workoutId: string) {
  for (const row of r.workoutExercises(workoutId))
    for (const set of r.sets(row.id))
      r.editSet(set.id, { completed: true, weight: 40 });
  r.finishWorkout(workoutId);
}
function enrolled() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, restDay: 6 });
  const { id } = enrollProgram(fixture.r, strength4, "2026-10-19");
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return { ...fixture, id };
}
const workoutRows = (view: { queryAllByLabelText: (m: RegExp) => unknown[] }) =>
  view.queryAllByLabelText(/, \d+ exercises?$/).length;

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.programId;
  delete mockParams.version;
});

test("details present one distinct program, switch only between its authored siblings, and list each workout once", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ restDay: 6 });
    jest.mocked(useRepo).mockReturnValue(r);
    show(strength4);
    const view = await render(<Details />);
    // "4 Days" is kept together with a no-break space so titles wrap at "·".
    expect(view.getByText(/^Intermediate Strength · 4\sDays$/)).toBeTruthy();
    expect(view.getByLabelText("4 days").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(view.getByText("32")).toBeTruthy();
    expect(workoutRows(view)).toBe(4);
    expect(view.getByText(/The same workouts run in every phase/)).toBeTruthy();
    for (const phase of strength4.phases)
      expect(view.getByLabelText(`${phase.name}, details`)).toBeTruthy();
    expect(
      view.getByText("RIR 1–3 · about 30% fewer working sets"),
    ).toBeTruthy();
    // Expanding a workout shows its full authored prescription.
    const lower = strength4.phases[0]!.sessions[0]!;
    await fireEvent.press(
      view.getByLabelText(`${lower.name}, ${lower.exercises.length} exercises`),
    );
    expect(
      view.getByText(r.exercise(lower.exercises[0]!.exerciseId)!.name),
    ).toBeTruthy();
    for (const item of lower.exercises)
      expect(view.getAllByText(prescriptionLine(item)).length).toBeGreaterThan(
        0,
      );
    // The 5-day variant is its own authored program, not an adaptation.
    await fireEvent.press(view.getByLabelText("5 days"));
    expect(view.getByText(/^Intermediate Strength · 5\sDays$/)).toBeTruthy();
    expect(workoutRows(view)).toBe(5);
    expect(view.getByText("40")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("phase details, progression and the program description open as information sheets", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    show(strength4);
    const view = await render(<Details />);
    const week8 = strength4.phases[3]!;
    await fireEvent.press(view.getByLabelText(`${week8.name}, details`));
    expect(view.getByRole("header", { name: week8.name })).toBeTruthy();
    expect(view.getByText(week8.notes!)).toBeTruthy();
    expect(view.getByText(/About 30% fewer working sets/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("How progression works"));
    expect(view.getByText(strength4.progression)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("About this program"));
    expect(view.getByText(strength4.description)).toBeTruthy();
    expect(view.getByText(strength4.summary)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a workout that changes in one phase is shown in each version with its phases", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const varied = JSON.parse(JSON.stringify(strength4)) as CuratedProgram;
    varied.phases[2]!.sessions[0]!.exercises[0]!.reps = { min: 2, max: 3 };
    const view = await render(<WorkoutList program={varied} />);
    const session = varied.phases[0]!.sessions[0]!;
    const rows = view.getAllByLabelText(
      `${session.name}, ${session.exercises.length} exercises`,
    );
    expect(rows).toHaveLength(2);
    const [a, b, c, d] = varied.phases.map((p) => p.name);
    expect(
      view.getByText(
        `${session.exercises.length} exercises · ${a}, ${b}, ${d}`,
      ),
    ).toBeTruthy();
    expect(
      view.getByText(`${session.exercises.length} exercises · ${c}`),
    ).toBeTruthy();
    expect(view.getAllByText(/exercises · Every phase$/)).toHaveLength(3);
    expect(view.getByText(/Some workouts change between phases/)).toBeTruthy();
    await fireEvent.press(rows[1]!);
    expect(
      view.getByText(
        prescriptionLine(varied.phases[2]!.sessions[0]!.exercises[0]!),
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Start program keeps the start-date choices and the current program opens its dashboard", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    show(strength4);
    const view = await render(<Details />);
    await fireEvent.press(view.getByLabelText("Start program"));
    for (const label of ["Today", "Tomorrow", "Next Monday"])
      expect(view.getByLabelText(label)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Tomorrow"));
    await fireEvent.press(view.getByLabelText("Start tomorrow"));
    await waitFor(() =>
      expect(currentEnrollment(r)?.data.started).toBe(addDays(localDate(), 1)),
    );
    expect(router.dismissTo).toHaveBeenLastCalledWith("/forge-paths/current");
    const again = await render(<Details />);
    expect(again.queryByLabelText("Start program")).toBeNull();
    await fireEvent.press(again.getByLabelText("Open your program"));
    expect(router.dismissTo).toHaveBeenLastCalledWith("/forge-paths/current");
  } finally {
    db.close();
  }
  const monday = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(monday.r);
    show(program("forge-muscle-beginner-3-day"));
    const view = await render(<Details />);
    await fireEvent.press(view.getByLabelText("Start program"));
    await fireEvent.press(view.getByLabelText("Next Monday"));
    await fireEvent.press(view.getByLabelText("Start next Monday"));
    await waitFor(() => expect(currentEnrollment(monday.r)).toBeDefined());
    const started = currentEnrollment(monday.r)!.data.started;
    expect(new Date(`${started}T12:00:00`).getDay()).toBe(1);
    expect(started > localDate()).toBe(true);
  } finally {
    monday.db.close();
  }
});

test("the dashboard leads with week and phase, then the next session with an optional lower-fatigue choice", async () => {
  const { r, db } = enrolled();
  try {
    const view = await render(<Dashboard />);
    const first = strength4.phases[0]!;
    expect(view.getByText(`Week 1 of 8 · ${first.name}`)).toBeTruthy();
    expect(view.getByText("0 of 32 sessions completed")).toBeTruthy();
    expect(view.getByText(first.sessions[0]!.name)).toBeTruthy();
    expect(view.getByText(/^Suggested for /)).toBeTruthy();
    expect(view.getByText("Coming up")).toBeTruthy();
    // Start is the card's one orange action; Skip is a quiet text action.
    expect(
      StyleSheet.flatten(view.getByText("Skip this session").props.style).color,
    ).toBe(dark.text2);
    await fireEvent.press(view.getByLabelText("Lower fatigue"));
    const lf = strength4.lowerFatigue!;
    expect(
      view.getByText(
        new RegExp(
          `About ${Math.round(lf.setReduction * 100)}% fewer working sets`,
        ),
      ),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Start session"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    const sets = r
      .workoutExercises(r.active()!.id)
      .map((row) => r.sets(row.id).length);
    expect(sets).toEqual(
      first.sessions[0]!.exercises.map((e) =>
        reducedSets(e.sets, lf.setReduction),
      ),
    );
  } finally {
    db.close();
  }
});

test("skip, restore, review, the full session list, browse, details and end program stay available", async () => {
  const { r, db, id } = enrolled();
  try {
    // Four sessions done, so recent history shows three of four.
    const done: string[] = [];
    for (let i = 0; i < 4; i++) {
      const w = startProgramSession(r, id);
      finish(r, w.id);
      done.push(w.id);
    }
    const view = await render(<Dashboard />);
    await fireEvent.press(view.getByLabelText("Skip this session"));
    expect(jest.mocked(confirm).mock.calls[0]![0]).toBe("Skip this session?");
    await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
    const skipped = programProgress(r, currentEnrollment(r)!).logs.find(
      (l) => l.state === "skipped",
    )!;
    expect(skipped).toBeDefined();
    await view.rerender(<Dashboard />);
    const restore = view.getByLabelText(/^Restore Week 2 · /);
    await fireEvent.press(restore);
    expect(programProgress(r, currentEnrollment(r)!).skipped).toBe(0);
    await view.rerender(<Dashboard />);

    const last = strength4.phases[0]!.sessions[3]!;
    await fireEvent.press(view.getByLabelText(`Review Week 1 · ${last.name}`));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: done[3] },
    });
    expect(
      view.queryByLabelText(
        `Review Week 1 · ${strength4.phases[0]!.sessions[0]!.name}`,
      ),
    ).toBeNull();
    await fireEvent.press(view.getByLabelText("All program sessions"));
    expect(view.getByRole("header", { name: "Program sessions" })).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(
        `Review Week 1 · ${strength4.phases[0]!.sessions[0]!.name}`,
      ),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenLastCalledWith({
        pathname: "/workout",
        params: { id: done[0] },
      }),
    );

    await fireEvent.press(view.getByLabelText("Program details"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/forge-paths/[programId]",
      params: { programId: strength4.id, version: String(strength4.version) },
    });
    await fireEvent.press(view.getByLabelText("Browse programs"));
    expect(router.dismissTo).toHaveBeenLastCalledWith("/forge-paths");
    await fireEvent.press(view.getByLabelText("End program"));
    expect(jest.mocked(confirm).mock.calls.at(-1)![0]).toBe(
      "End this program?",
    );
    expect(currentEnrollment(r)).toBeDefined();
    await act(async () => jest.mocked(confirm).mock.calls.at(-1)![2]());
    expect(currentEnrollment(r)).toBeUndefined();
    await view.rerender(<Dashboard />);
    expect(view.getByText("No current program")).toBeTruthy();
    // Every recorded workout is kept.
    for (const w of done) expect(r.workout(w)?.status).toBe("completed");
  } finally {
    db.close();
  }
});

test("the library opens your program's dashboard, and back returns or falls back sensibly", async () => {
  const { db } = enrolled();
  try {
    const library = await render(<Library />);
    await fireEvent.press(
      library.getByLabelText(`Your program: ${strength4.name}`),
    );
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    await fireEvent.press(library.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(library.getByLabelText("Back"));
    expect(router.replace).toHaveBeenLastCalledWith("/(tabs)/train");
    const dashboard = await render(<Dashboard />);
    await fireEvent.press(dashboard.getByLabelText("Back"));
    expect(router.replace).toHaveBeenLastCalledWith("/(tabs)");
    show(strength4);
    const details = await render(<Details />);
    await fireEvent.press(details.getByLabelText("Back"));
    expect(router.replace).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    jest.mocked(router.canGoBack).mockReturnValue(true);
    db.close();
  }
});
