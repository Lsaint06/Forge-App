import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { router } from "expo-router";
import Home from "../../src/screens/Home";
import Train from "../../app/(tabs)/train";
import History from "../../src/screens/History";
import Profile from "../../app/(tabs)/profile";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { freshPathRepository } from "../legacy-fixture";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { currentPath, pathSessions } from "../../src/data/paths";
import { addDays } from "../../src/domain/paths/model";

// Phase 3: Today's next-workout hero, the Train hub and the History screen.

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

// Fix "today" for the date-dependent hero states.
function on(date: string) {
  jest
    .spyOn(Date, "now")
    .mockReturnValue(new Date(`${date}T10:00:00`).getTime());
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

type Repo = ReturnType<typeof pathRepository>["r"];
function finished(r: Repo, name = "Freestyle") {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.addSet(row.id);
  for (const s of r.workoutSets(w.id))
    r.editSet(s.id, { completed: true, weight: 50, reps: 5 });
  r.finishWorkout(w.id);
  return w;
}

// Phase 7.1B: Home follows the approved REFORGE reference. Earlier versions
// asserted a plain "Today" heading and no streak or metrics on Home (Design
// System 2.0 rules); the reference greets the lifter and shows the day streak
// and snapshots. The single primary action and its behaviour are unchanged.
test("Home greets the lifter with one primary action", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, name: "Alex Smith" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    expect(
      view.getByRole("header", {
        name: /^Good (morning|afternoon|evening), Alex\.$/,
      }),
    ).toBeTruthy();
    expect(view.getByLabelText("0 day streak. Open progress")).toBeTruthy();
    expect(view.getByText("Nothing scheduled")).toBeTruthy();
    // One primary (gradient) call to action.
    expect(view.getAllByRole("button", { name: "Start workout" })).toHaveLength(
      1,
    );
    // No plan yet: no plan row; Forge Paths stays one tap away.
    expect(view.queryByLabelText(/^Your (program|Path):/)).toBeNull();
    await fireEvent.press(view.getByLabelText("Choose a Forge Path"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
    await fireEvent.press(view.getByLabelText("Start workout"));
    expect(r.active()?.name).toBe("Freestyle");
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("Today resumes the workout in progress instead of starting another", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Program · Upper A");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    expect(view.getByText("In progress")).toBeTruthy();
    expect(view.getByText("Upper A")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Resume workout"));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(r.workouts()).toHaveLength(1);
    expect(r.active()?.id).toBe(w.id);
  } finally {
    db.close();
  }
});

test("Today starts the program session due today and links the plan", async () => {
  const { r, db } = pathRepository();
  try {
    on("2026-10-19");
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    r.saveProfile({ onboarded: true, restDay: 6 });
    enrollProgram(r, program, "2026-10-19");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    // The reference's overline for a session due today.
    expect(view.getByText("Today's session")).toBeTruthy();
    const session = program.phases[0]!.sessions[0]!.name;
    expect(view.getByText(session)).toBeTruthy();
    expect(view.getByText(`${program.name} · Week 1`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Your program: ${program.name}`));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    await fireEvent.press(view.getByLabelText("Start workout"));
    expect(r.active()?.name).toBe(`${program.name} · ${session}`);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("Today shows when the next program session is suggested and starts it early", async () => {
  const { r, db } = pathRepository();
  try {
    on("2026-10-20");
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    r.saveProfile({ onboarded: true, restDay: 6 });
    enrollProgram(r, program, "2026-10-19");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    const session = program.phases[0]!.sessions[0]!.name;
    expect(view.getByText("Next session")).toBeTruthy();
    expect(view.getByText("Suggested for tomorrow")).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Start ${session} early`));
    expect(r.active()?.name).toBe(`${program.name} · ${session}`);
  } finally {
    db.close();
  }
});

test("Today shows an existing Path's next and missed sessions at their scheduled dates", async () => {
  const { r, db } = freshPathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const path = currentPath(r)!;
    const sessions = pathSessions(r, path);
    const first = sessions[0]!;
    jest.mocked(useRepo).mockReturnValue(r);

    on(addDays(first.record.date, -1));
    const before = await render(<Home />);
    expect(before.getByText("Next session")).toBeTruthy();
    expect(before.getByText("Scheduled for tomorrow")).toBeTruthy();
    expect(before.getByLabelText(`Your Path: ${path.data.name}`)).toBeTruthy();
    await before.unmount();

    let gap = addDays(first.record.date, 1);
    const dates = sessions.map((s) => s.record.date);
    while (dates.includes(gap)) gap = addDays(gap, 1);
    on(gap);
    const later = await render(<Home />);
    expect(later.getByText("Missed session")).toBeTruthy();
    expect(later.getByText(first.data.name)).toBeTruthy();
    expect(later.getByText(/^Originally scheduled for /)).toBeTruthy();
    const dated = r.journal("schedule").map((j) => [j.id, j.date]);
    await fireEvent.press(later.getByLabelText("Start workout"));
    expect(r.active()?.name).toBe(`${path.data.name} · ${first.data.name}`);
    // Starting never reschedules.
    expect(r.journal("schedule").map((j) => [j.id, j.date])).toEqual(dated);
  } finally {
    db.close();
  }
});

test("Today keeps recovery check-in and the last session one tap away", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = finished(r, "Push day");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    expect(view.getByText("Not logged today")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Recovery check-in"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "recovery" },
    });
    await fireEvent.press(view.getByLabelText("Review Push day"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: w.id },
    });
    await fireEvent.press(view.getByLabelText("Workout history"));
    expect(router.push).toHaveBeenLastCalledWith("/history");
    expect(view.getByText("1 of 3 sessions")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Train is a hero, Start a workout and Training tools; history lives in You", async () => {
  const { r, db } = pathRepository();
  try {
    for (const name of ["A", "B", "C", "D"]) finished(r, name);
    for (const name of ["T1", "T2", "T3", "T4"])
      r.saveTemplate(name, [
        {
          exerciseId: "barbell-bench-press",
          sets: 3,
          reps: 8,
          repMax: 10,
          weight: 40,
          rest: 90,
        },
      ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.getByRole("header", { name: "Train" })).toBeTruthy();
    // Three template shortcuts (none trained yet: name order); the rest are
    // one tap away.
    expect(view.getAllByText("Start")).toHaveLength(3);
    expect(view.queryByText("T4")).toBeNull();
    expect(view.getByLabelText("Workout templates")).toBeTruthy();
    expect(view.getByText(`${libraryPrograms().length} curated programs`));
    // One primary action, the hero's (no plan yet: Forge Paths).
    expect(
      view.getByRole("button", { name: "Browse Forge Paths" }),
    ).toBeTruthy();
    // History moved to You; the exercise shortcuts live in the library.
    expect(view.queryByLabelText("Review D")).toBeNull();
    expect(view.queryByLabelText("All history")).toBeNull();
    expect(view.queryByLabelText("Search exercises")).toBeNull();
    expect(view.queryByLabelText("Create custom exercise")).toBeNull();
    const routes: [string, unknown][] = [
      ["Browse Forge Paths", "/forge-paths"],
      ["Forge Paths", "/forge-paths"],
      ["Workout templates", "/templates"],
      ["Exercise library", "/explore"],
      ["Training calendar", "/calendar"],
    ];
    for (const [label, route] of routes) {
      await fireEvent.press(view.getByLabelText(label));
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
  } finally {
    db.close();
  }
});

test("a template row opens its details; Start launches it directly", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate(
      "Upper",
      [
        {
          exerciseId: "barbell-bench-press",
          sets: 3,
          reps: 8,
          repMax: 10,
          weight: 40,
          rest: 90,
        },
      ],
      undefined,
      "Heavy week",
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    await fireEvent.press(view.getByLabelText("Upper details"));
    expect(view.getByRole("header", { name: "Upper" })).toBeTruthy();
    expect(view.getByText("Heavy week")).toBeTruthy();
    expect(view.getByText("3 × 8–10 reps · 90s rest")).toBeTruthy();
    expect(r.active()).toBeUndefined();
    // The sheet's Start waits for the sheet to close before navigating.
    await fireEvent.press(view.getByLabelText("Start workout"));
    expect(r.active()?.templateId).toBe(t.id);
    await waitFor(() =>
      expect(router.push).toHaveBeenLastCalledWith("/workout"),
    );
    expect(router.push).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

test("the row's compact Start begins the template without opening details", async () => {
  const { r, db } = pathRepository();
  try {
    const t = r.saveTemplate("Lower", [
      {
        exerciseId: "barbell-bench-press",
        sets: 2,
        reps: 5,
        weight: 60,
        rest: 120,
      },
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    await fireEvent.press(view.getByLabelText("Start Lower"));
    expect(r.active()?.templateId).toBe(t.id);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(view.queryByRole("header", { name: "Lower" })).toBeNull();
  } finally {
    db.close();
  }
});

test("History groups by month, opens review, and keeps Repeat and a confirmed Delete in each row's menu", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ units: "kg" });
    const older = finished(r, "Older");
    const newer = finished(r, "Newer");
    // Move the older workout into the previous month.
    const prevMonth = new Date();
    prevMonth.setDate(1);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    db.prepare(
      "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
    ).run(prevMonth.getTime(), prevMonth.getTime() + 3600000, older.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<History />);
    const month = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    expect(view.getByText(month(new Date()))).toBeTruthy();
    expect(view.getByText(month(prevMonth))).toBeTruthy();
    expect(view.getByText("2 workouts")).toBeTruthy();
    expect(view.getAllByText(/ min · 250 kg$/)).toHaveLength(2);

    await fireEvent.press(view.getByLabelText(/^Review Newer, /));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: newer.id },
    });

    await fireEvent.press(view.getByLabelText(/^Options for Older, /));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Delete workout" }),
    );
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(jest.mocked(confirm).mock.calls[0]![0]).toBe("Delete workout?");
    // Nothing is deleted until confirmed.
    expect(r.workout(older.id)).toBeDefined();
    await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
    expect(r.workout(older.id)).toBeUndefined();

    await fireEvent.press(view.getByLabelText(/^Options for Newer, /));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Repeat workout" }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenLastCalledWith("/workout"),
    );
    expect(r.active()?.name).toBe("Newer");
    expect(r.workout(newer.id)?.status).toBe("completed");
  } finally {
    db.close();
  }
});

test("History back returns to the previous screen, or to You from a link", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<History />);
    expect(view.getByText("No workouts yet")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/profile");
  } finally {
    db.close();
  }
});

test("You → Training history opens the History screen", async () => {
  const { r, db } = pathRepository();
  try {
    finished(r, "A");
    finished(r, "B");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Profile />);
    // Beside the lifetime totals, with the real completed count.
    const row = view.getByLabelText("Training history");
    expect(row.props.accessibilityHint).toBe(
      "2 completed workouts · review, edit or repeat",
    );
    await fireEvent.press(row);
    expect(router.push).toHaveBeenLastCalledWith("/history");
  } finally {
    db.close();
  }
});
