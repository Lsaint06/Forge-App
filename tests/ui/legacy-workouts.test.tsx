import React from "react";
import {
  render,
  fireEvent,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
import WorkoutExerciseCard from "../../src/components/WorkoutExerciseCard";
import LegacyPath from "../../src/screens/LegacyPath";
import Templates from "../../app/templates";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { freshPathRepository, legacyUserRepository } from "../legacy-fixture";
import {
  currentPath,
  pathPrograms,
  pathSessions,
  pathSummary,
  reschedulePathSession,
  startPathSession,
} from "../../src/data/paths";
import { repRangeLabel } from "../../src/domain/prescriptions";

// Shared workout UI and existing generated-Path workouts after the
// generator's retirement (Phase 6B). Path data comes from backups exported by
// the pre-Phase-6 app.

jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

// Opens the exercise menu, chooses an item and waits for its sheet (menu
// actions run once the menu has closed).
async function openProgression(view: RenderResult) {
  await fireEvent.press(view.getByLabelText(/^Options for /));
  await fireEvent.press(view.getByRole("menuitem", { name: "Progression" }));
  await waitFor(() =>
    expect(view.getByRole("header", { name: "Progression" })).toBeTruthy(),
  );
}

// Target lines carry invisible word joiners so ranges never wrap mid-way;
// match the visible text.
const visible = (s: string) =>
  s
    .replace(/\u2060/g, "")
    .replace(/\s+/g, " ")
    .trim();
test("a saved Path workout shows its saved rep range even if the template later changes, with no unsupported load suggestion", async () => {
  const { r, db } = freshPathRepository();
  try {
    const session = pathSessions(r, pathPrograms(r)[0]!)[0]!;
    const workout = startPathSession(r, session.record.id);
    const row = r.workoutExercises(workout.id)[0]!;
    const template = r.templates().find((t) => t.id === workout.templateId)!;
    r.saveTemplate(
      template.name,
      template.exercises.map((p) => ({ ...p, reps: 10, repMax: 15 })),
      template.id,
      template.notes,
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutExerciseCard row={row} />);
    expect(
      view.getByText(`${row.target!.sets} × 6-8 reps · ${row.rest}s rest`, {
        normalizer: visible,
      }),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Expand Barbell Bench Press"));
    // Existing Paths are program workouts: RIR is logged inline.
    expect(view.getByLabelText("Set 1 RIR")).toBeTruthy();
    // No inline suggestion without comparable history.
    expect(view.queryByLabelText(/^Use suggested load/)).toBeNull();
    await openProgression(view);
    expect(
      view.getByRole("button", {
        name: "Apply suggested load",
        disabled: true,
      }),
    ).toBeTruthy();
    expect(
      view.getByText(/Log a complete session at this prescription/),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("compact logging and optional set tracking preserve saved details and comparable target history", async () => {
  const { r, db } = pathRepository();
  try {
    const template = r.saveTemplate("Compact", [
      {
        exerciseId: "barbell-bench-press",
        sets: 2,
        reps: 6,
        repMax: 8,
        weight: 40,
        rest: 120,
      },
    ]);
    const workout = r.startWorkout(template.name, template.id);
    const row = r.workoutExercises(workout.id)[0]!;
    const [first, second] = r.sets(row.id);
    r.editSet(first!.id, {
      reps: 8,
      rpe: 8,
      rir: 2,
      tempo: "3-1-1-0",
      notes: "Controlled",
      completed: true,
    });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutExerciseCard row={row} />);
    expect(
      view.getByText("2 × 6-8 reps · 120s rest", { normalizer: visible }),
    ).toBeTruthy();
    expect(
      view.getByRole("button", {
        name: "Expand Barbell Bench Press",
        value: { text: "1 of 2 sets complete" },
      }),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Expand Barbell Bench Press"));
    await fireEvent.changeText(view.getByLabelText("Set 2 weight (kg)"), "45");
    await fireEvent.changeText(view.getByLabelText("Set 2 reps"), "8");
    expect(view.queryByLabelText("Set notes")).toBeNull();
    // A template workout is not a program: RIR stays in Set Details.
    expect(view.queryByLabelText("Set 2 RIR")).toBeNull();
    await fireEvent.press(view.getByLabelText("Set 1 details"));
    expect(view.getByLabelText("Set notes").props.value).toBe("Controlled");
    expect(view.getByLabelText("RIR (0–20, optional)").props.value).toBe("2");
    expect(view.getByLabelText("Tempo (e.g. 3-1-1-0)").props.value).toBe(
      "3-1-1-0",
    );
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("Set 2 details"));
    await fireEvent.changeText(
      view.getByLabelText("Set notes"),
      "Second working set",
    );
    await fireEvent.changeText(
      view.getByLabelText("RIR (0–20, optional)"),
      "3",
    );
    await fireEvent.press(view.getByLabelText("Close"));
    expect(view.queryByLabelText("RIR (0–20, optional)")).toBeNull();
    await fireEvent.press(view.getByLabelText("Complete set 2"));
    await fireEvent.press(view.getByLabelText("Collapse Barbell Bench Press"));
    expect(view.queryByLabelText("Set 2 reps")).toBeNull();
    const saved = r.sets(row.id);
    expect(saved[0]).toMatchObject({
      id: first!.id,
      rpe: 8,
      rir: 2,
      notes: "Controlled",
      tempo: "3-1-1-0",
      completed: true,
    });
    expect(saved[1]).toMatchObject({
      id: second!.id,
      weight: 45,
      reps: 8,
      rir: 3,
      notes: "Second working set",
      completed: true,
    });
    expect(r.workoutExercises(workout.id)[0]!.target).toEqual(row.target);
    r.finishWorkout(workout.id);
    expect(r.targetHistory(row.exerciseId, row.target!)[0]).toEqual(saved);
  } finally {
    db.close();
  }
});

test("template editor saves and reopens both rep boundaries without collapsing to a fixed target", async () => {
  const { r, db } = pathRepository();
  try {
    const template = r.saveTemplate("Range template", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 6,
        weight: 0,
        rest: 120,
      },
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    await fireEvent.changeText(view.getByLabelText("Maximum reps"), "8");
    await fireEvent.press(view.getByRole("button", { name: "Save template" }));
    expect(
      r.templates().find((t) => t.id === template.id)!.exercises[0],
    ).toMatchObject({ reps: 6, repMax: 8 });
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    expect(view.getByLabelText("Maximum reps").props.value).toBe("8");
    expect(view.getByLabelText("reps").props.value).toBe("6");
  } finally {
    db.close();
  }
});

test("applying a target recommendation changes only unfinished working sets", async () => {
  const { r, db } = pathRepository();
  try {
    const template = r.saveTemplate("Progression", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 6,
        repMax: 8,
        weight: 50,
        rest: 120,
      },
    ]);
    for (let i = 0; i < 2; i++) {
      const prior = r.startWorkout(template.name, template.id);
      for (const set of r.workoutSets(prior.id))
        r.editSet(set.id, { reps: 8, rir: 2, completed: true });
      r.finishWorkout(prior.id);
    }
    const workout = r.startWorkout(template.name, template.id);
    const row = r.workoutExercises(workout.id)[0]!;
    const completed = r.sets(row.id)[0]!;
    r.editSet(completed.id, { weight: 40, completed: true });
    const warmup = r.addSet(row.id, { kind: "warmup", weight: 20, reps: 5 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard row={row} initialExpanded />,
    );
    // The planned 50 kg differs from the earned increase, so it is offered
    // inline; the full reasoning and Apply live in the Progression sheet.
    expect(view.getByText("Suggested 52.5 kg")).toBeTruthy();
    await openProgression(view);
    await fireEvent.press(
      view.getByRole("button", { name: "Apply suggested load" }),
    );
    const result = r.sets(row.id);
    expect(result.find((s) => s.id === completed.id)!.weight).toBe(40);
    expect(result.find((s) => s.id === warmup.id)!.weight).toBe(20);
    expect(
      result
        .filter((s) => !s.completed && s.kind === "working")
        .every((s) => s.weight === 52.5),
    ).toBe(true);
  } finally {
    db.close();
  }
});

test("existing Path workouts progress against the Path's prescribed rep target, not the global range", async () => {
  const { r, db } = legacyUserRepository();
  try {
    const session = pathSessions(r, currentPath(r)!).find((s) =>
      ["scheduled", "missed"].includes(s.state),
    )!;
    const workout = startPathSession(r, session.record.id);
    const row = r.workoutExercises(workout.id)[0]!;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard row={row} initialExpanded />,
    );
    // The suggestion is driven by the Path's saved target (not the profile's
    // global range) and stays user-applied.
    expect(
      view.getByText(
        `${row.target!.sets} × ${repRangeLabel({ reps: row.target!.min, repMax: row.target!.max })} reps · ${row.rest}s rest`,
        { normalizer: visible },
      ),
    ).toBeTruthy();
    await openProgression(view);
    expect(view.getByLabelText("Apply suggested load")).toBeTruthy();
    expect(view.queryByText(/Path progression:/)).toBeNull();
  } finally {
    db.close();
  }
}, 20_000);

test("the existing-Path calendar navigates Monday–Sunday, shows rest days and recovers a moved session", async () => {
  // The Path starts on 2026-10-19; pin "today" before it so the first
  // session is still upcoming ("scheduled") whatever the real date is. Only
  // Date is faked; rendering timers stay real.
  jest.useFakeTimers({
    now: new Date("2026-10-15T12:00:00"),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  const { r, db } = freshPathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<LegacyPath />);
    expect(view.getByText("Calendar week 1")).toBeTruthy();
    expect(view.getByLabelText("Mon 2026-10-19, scheduled")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Wed 2026-10-21, Rest day"));
    expect(view.getByText(/Rest day · 2026-10-21/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Next week →"));
    expect(view.getByText("Calendar week 2")).toBeTruthy();
    expect(view.getByText("Training week 2 · Foundation")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("← Previous week"));
    const first = pathSessions(r, pathPrograms(r)[0]!)[0]!;
    reschedulePathSession(r, first.record.id, "2027-01-04", "2026-10-01");
    await view.rerender(<LegacyPath />);
    for (let i = 1; i < 12; i++)
      await fireEvent.press(view.getByLabelText("Next week →"));
    expect(view.getByText("Calendar week 12")).toBeTruthy();
    expect(view.getByText("2027-01-04 · scheduled")).toBeTruthy();
    expect(view.getByText("Training week 1 · Foundation")).toBeTruthy();
    expect(view.getByText("0 / 32 workouts completed")).toBeTruthy();
    expect(pathSummary(r, pathPrograms(r)[0]!).completed).toBe(0);
  } finally {
    db.close();
    jest.useRealTimers();
  }
}, 20_000);
