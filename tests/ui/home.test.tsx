import React from "react";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import Home from "../../src/screens/Home";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { TARGETS_SAVED } from "../../src/domain/nutrition";
import { localDate } from "../../src/domain/types";

// Phase 7.1B: Home built to the approved REFORGE reference from real data.

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

function on(date: string, hour = 10) {
  jest
    .spyOn(Date, "now")
    .mockReturnValue(
      new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime(),
    );
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

type Repo = ReturnType<typeof pathRepository>["r"];
function finished(r: Repo, name = "Push day", weight = 50, reps = 5) {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.addSet(row.id);
  for (const s of r.workoutSets(w.id))
    r.editSet(s.id, { completed: true, weight, reps });
  r.finishWorkout(w.id);
  return w;
}
function setup(profile = {}) {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}

// ---- Session states ----------------------------------------------------------

test("in progress and paused workouts resume, never start another", async () => {
  const { r, db } = setup();
  try {
    const w = r.startWorkout("Upper A");
    r.addExercise(w.id, "barbell-bench-press");
    const view = await render(<Home />);
    expect(view.getByText("In progress")).toBeTruthy();
    expect(view.getByText("Upper A")).toBeTruthy();
    expect(view.getByLabelText("1 exercise")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Resume workout" }));
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(r.workouts()).toHaveLength(1);
    await view.unmount();

    r.pauseWorkout(w.id);
    const paused = await render(<Home />);
    expect(paused.getByText("Paused")).toBeTruthy();
    await fireEvent.press(
      paused.getByRole("button", { name: "Resume workout" }),
    );
    expect(r.active()?.id).toBe(w.id);
  } finally {
    db.close();
  }
});

test("a program session due today shows its facts and plan week, and starts", async () => {
  const { r, db } = setup({ restDay: 6 });
  try {
    on("2026-10-19");
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    enrollProgram(r, program, "2026-10-19");
    const view = await render(<Home />);
    const session = program.phases[0]!.sessions[0]!;
    expect(view.getByText("Today's session")).toBeTruthy();
    expect(view.getByText(session.name)).toBeTruthy();
    expect(
      view.getByLabelText(`${session.exercises.length} exercises`),
    ).toBeTruthy();
    expect(view.getByLabelText(program.experience)).toBeTruthy();
    // The header names the plan week and phase, and opens the program.
    const phase = program.phases[0]!.name.split(" · ").pop()!;
    expect(view.getByText(`Week 1 · ${phase}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Your program: ${program.name}`));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths/current");
    await fireEvent.press(view.getByRole("button", { name: "Start workout" }));
    expect(r.active()?.name).toBe(`${program.name} · ${session.name}`);
  } finally {
    db.close();
  }
});

test("an upcoming program session can be started early", async () => {
  const { r, db } = setup({ restDay: 6 });
  try {
    on("2026-10-20");
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    enrollProgram(r, program, "2026-10-19");
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

test("a planned template starts; a removed one sends the lifter to templates", async () => {
  const { r, db } = setup();
  try {
    const t = r.saveTemplate("Leg day", [
      { exerciseId: "back-squat", sets: 3, reps: 5, weight: 60, rest: 120 },
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 5,
        weight: 40,
        rest: 120,
      },
    ]);
    r.addJournal("schedule", { name: t.name, templateId: t.id }, localDate());
    const view = await render(<Home />);
    expect(view.getByText("Today's session")).toBeTruthy();
    expect(view.getByText("Leg day")).toBeTruthy();
    expect(view.getByLabelText("2 exercises")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Start workout" }));
    expect(r.active()?.name).toBe("Leg day");
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
  const missing = setup();
  try {
    missing.r.addJournal(
      "schedule",
      { name: "Old plan", templateId: "gone" },
      localDate(),
    );
    const view = await render(<Home />);
    expect(
      view.getByText("This template is no longer available."),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Choose a template" }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/templates");
    expect(missing.r.active()).toBeUndefined();
  } finally {
    missing.db.close();
  }
});

test("with nothing scheduled, a freestyle workout starts and Forge Paths is offered", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<Home />);
    expect(view.getByText("Nothing scheduled")).toBeTruthy();
    expect(view.getByText("Freestyle workout")).toBeTruthy();
    // No plan: no plan link in the header.
    expect(view.queryByLabelText(/^Your (program|Path):/)).toBeNull();
    await fireEvent.press(view.getByLabelText("Choose a Forge Path"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
    await fireEvent.press(view.getByRole("button", { name: "Start workout" }));
    expect(r.active()?.name).toBe("Freestyle");
  } finally {
    db.close();
  }
});

test("session options are existing destinations only", async () => {
  const { db } = setup();
  try {
    const view = await render(<Home />);
    await fireEvent.press(view.getByLabelText("Session options"));
    expect(
      view.getAllByRole("menuitem").map((m) => m.props.accessibilityLabel),
    ).toEqual(["Forge Paths", "Workout templates", "Training calendar"]);
  } finally {
    db.close();
  }
});

// ---- Header, greeting and recovery ---------------------------------------------

test("the header shows the real day streak and the greeting follows the time of day", async () => {
  const { r, db } = setup({ name: "Alex Carter" });
  try {
    on(localDate(), 15);
    finished(r);
    const view = await render(<Home />);
    expect(
      view.getByRole("header", { name: "Good afternoon, Alex." }),
    ).toBeTruthy();
    expect(view.getByRole("image", { name: "FORGE" })).toBeTruthy();
    await fireEvent.press(view.getByLabelText("1 day streak. Open progress"));
    expect(router.navigate).toHaveBeenLastCalledWith("/(tabs)/progress");
  } finally {
    db.close();
  }
  const anon = setup();
  try {
    on(localDate(), 7);
    const view = await render(<Home />);
    expect(view.getByRole("header", { name: "Good morning." })).toBeTruthy();
  } finally {
    anon.db.close();
  }
});

test("recovery shows today's check-in as recorded, with no computed score", async () => {
  const { r, db } = setup();
  try {
    r.addJournal(
      "recovery",
      {
        sleep: 7.5,
        quality: 4,
        soreness: 2,
        energy: 4,
        stress: 2,
        readiness: 4,
      },
      localDate(),
    );
    const view = await render(<Home />);
    const strip = view.getByRole("button", { name: "Recovery check-in" });
    for (const text of ["Mostly", "7h 30m", "Mild", "High"])
      expect(within(strip).getByText(text)).toBeTruthy();
    expect(within(strip).queryByText(/%/)).toBeNull();
    expect(strip.props.accessibilityHint).toMatch(
      /^Logged today\. Sleep 7 hours 30 minutes/,
    );
    await fireEvent.press(strip);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "recovery" },
    });
  } finally {
    db.close();
  }
});

test("the longest recovery words shrink to fit rather than truncate", async () => {
  const { r, db } = setup();
  try {
    r.addJournal(
      "recovery",
      {
        sleep: 10.75,
        quality: 4,
        soreness: 3,
        energy: 5,
        stress: 2,
        readiness: 1,
      },
      localDate(),
    );
    const view = await render(<Home />);
    const strip = view.getByRole("button", { name: "Recovery check-in" });
    for (const text of [
      "Not at all",
      "10h 45m",
      "Moderate",
      "Energised",
      "Ready",
      "Sleep",
      "Soreness",
      "Energy",
    ]) {
      const t = within(strip).getByText(text);
      expect(t.props.numberOfLines).toBe(1);
      expect(t.props.adjustsFontSizeToFit).toBe(true);
    }
    // One horizontal strip of four columns at standard width.
    const columns = within(strip).getByTestId("stat-strip").children;
    expect(columns).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("without a check-in, recovery invites one", async () => {
  const { db } = setup();
  try {
    const view = await render(<Home />);
    expect(view.getByText("How are you today?")).toBeTruthy();
    expect(view.getByText("Not logged today")).toBeTruthy();
  } finally {
    db.close();
  }
});

// ---- Snapshots ---------------------------------------------------------------------

test("the progress snapshot uses recorded weight, this week's volume and the streak, in the lifter's units", async () => {
  const { r, db } = setup({ units: "lb", frequency: 3 });
  try {
    r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 80, unit: "kg" },
      localDate(),
    );
    finished(r, "Push day", 100, 5); // 500 kg of volume
    const view = await render(<Home />);
    const card = view.getByRole("button", { name: "Progress snapshot" });
    expect(within(card).getByText("176.4 lb")).toBeTruthy(); // 80 kg
    expect(within(card).getByText("1,102 lb")).toBeTruthy(); // 500 kg in lb
    expect(within(card).getByText("Today")).toBeTruthy();
    expect(within(card).getByText("1 of 3 sessions")).toBeTruthy();
    // No invented comparisons.
    expect(within(card).queryByText(/vs |%/)).toBeNull();
    await fireEvent.press(card);
    expect(router.navigate).toHaveBeenLastCalledWith("/(tabs)/progress");
  } finally {
    db.close();
  }
});

test("a large weekly volume uses the compact form and is still spoken in full", async () => {
  const { r, db } = setup();
  try {
    finished(r, "Heavy day", 1250, 10); // 12,500 kg
    const view = await render(<Home />);
    const card = view.getByRole("button", { name: "Progress snapshot" });
    expect(within(card).getByText("12.5k kg")).toBeTruthy();
    expect(within(card).getByText("Volume")).toBeTruthy();
    expect(card.props.accessibilityHint).toContain(
      "Volume this week 12,500 kg",
    );
  } finally {
    db.close();
  }
});

test("without any weight the snapshot says so rather than showing a number", async () => {
  const { db } = setup();
  try {
    const view = await render(<Home />);
    const card = view.getByRole("button", { name: "Progress snapshot" });
    expect(within(card).getByText("Not logged")).toBeTruthy();
    expect(within(card).getByText("—")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("nutrition today shows the day's totals against the lifter's own targets and opens the Nutrition tab", async () => {
  const { r, db } = setup({ calories: 2400, protein: 180 });
  try {
    r.setSetting(TARGETS_SAVED, "1");
    r.addJournal(
      "nutrition",
      {
        name: "Chicken rice",
        calories: 620,
        protein: 55,
        carbs: 70,
        fat: 18,
        quantity: 1,
        meal: "Lunch",
      },
      localDate(),
    );
    const view = await render(<Home />);
    const card = view.getByRole("button", { name: "Nutrition today" });
    expect(within(card).getByText("620")).toBeTruthy();
    expect(within(card).getByText("of 2,400")).toBeTruthy();
    expect(within(card).getByText("55 g")).toBeTruthy();
    expect(
      within(card).getByLabelText("Calories").props.accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: 26 });
    await fireEvent.press(card);
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: "/(tabs)/nutrition",
      params: { day: "today" },
    });
  } finally {
    db.close();
  }
});

test("default nutrition targets are never presented as the lifter's own", async () => {
  const { db } = setup();
  try {
    const view = await render(<Home />);
    const card = view.getByRole("button", { name: "Nutrition today" });
    expect(within(card).getByText("kcal eaten")).toBeTruthy();
    expect(within(card).queryByText(/^of /)).toBeNull();
  } finally {
    db.close();
  }
});

// ---- Next target ---------------------------------------------------------------------

test("the next target is the active goal closest to its target, from recorded values", async () => {
  const { r, db } = setup();
  try {
    finished(r, "Push day", 50, 5);
    r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 85, unit: "kg" },
      localDate(),
    );
    r.addJournal("goal", {
      name: "Bench 100",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 100,
      start: 80,
      reps: 1,
      goalRules: 2,
    });
    r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    const view = await render(<Home />);
    expect(view.getByText("Cut to 80")).toBeTruthy();
    expect(view.queryByText("Bench 100")).toBeNull();
    expect(view.getByText("5 kg to go")).toBeTruthy();
    // The weigh-in appears in the snapshot and as the target's current value.
    expect(view.getAllByText("85 kg")).toHaveLength(2);
    expect(view.getByText("Target 80 kg")).toBeTruthy();
    // The bar shows the goal's own progress (90 → 80 kg, now 85 kg).
    expect(
      view.getByLabelText("Cut to 80", { includeHiddenElements: true }).props
        .accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: 50 });
    await fireEvent.press(view.getByLabelText("Next target, open goals"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "goal" },
    });
  } finally {
    db.close();
  }
});

test("without an active goal, Next target offers to set one", async () => {
  const { db } = setup();
  try {
    const view = await render(<Home />);
    expect(view.getByText("No active target")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Set a goal" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "goal" },
    });
  } finally {
    db.close();
  }
});

// ---- Preserved shortcuts -------------------------------------------------------------

test("the last session and history stay one tap away", async () => {
  const { r, db } = setup();
  try {
    const w = finished(r, "Pull day");
    const view = await render(<Home />);
    await fireEvent.press(view.getByLabelText("Review Pull day"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: w.id },
    });
    await fireEvent.press(view.getByLabelText("Workout history"));
    expect(router.push).toHaveBeenLastCalledWith("/history");
  } finally {
    db.close();
  }
});

// Phase 7.7B: the root entry gate sends an athlete without a finished setup
// to onboarding before Home can render (tests/ui/entry-routing.test.tsx);
// Home no longer redirects on its own, so it can't race the gate.
test("Home leaves onboarding to the entry gate", async () => {
  const fixture = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(fixture.r);
    await render(<Home />);
    expect(router.replace).not.toHaveBeenCalledWith("/onboarding");
  } finally {
    fixture.db.close();
  }
});
