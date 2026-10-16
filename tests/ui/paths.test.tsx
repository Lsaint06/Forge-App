import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import WorkoutExerciseCard from "../../src/components/WorkoutExerciseCard";
import Paths, { PathDayEditor } from "../../src/screens/Paths";
import { PathWorkoutList } from "../../src/components/PathWorkoutList";
import Templates from "../../app/templates";
import { useRepo, confirm } from "../../src/state";
import { pathRepository, pathPreferences } from "../path-fixture";
import {
  pathPrograms,
  pathSummary,
  acceptPath,
  pathSessions,
  reschedulePathSession,
  startPathSession,
} from "../../src/data/paths";
import { generatePath } from "../../src/domain/paths/generator";
import { exercises } from "../../src/data/catalog";
import { forgePaths } from "../../src/domain/paths/catalog";

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

test("switching from a saved Path retains its supported training frequency", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(
      r,
      generatePath(pathPreferences({ frequency: 2, duration: 90 }), exercises),
    );
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Paths />);
    await fireEvent.press(view.getByLabelText("Manage Path"));
    await fireEvent.press(view.getByLabelText("Browse or change Path"));
    await fireEvent.press(view.getByLabelText("Choose ATHLETE MODE"));
    expect(
      view.getByRole("button", { name: "2", selected: true }),
    ).toBeTruthy();
    expect(view.getByText("Available weekdays · 2 / 2 selected")).toBeTruthy();
  } finally {
    db.close();
  }
});

test.each(forgePaths)(
  "$name setup offers only catalog-supported training frequencies",
  async (path) => {
    const { r, db } = pathRepository();
    try {
      r.saveProfile({ experience: "Advanced" });
      jest.mocked(useRepo).mockReturnValue(r);
      const view = await render(<Paths />);
      await fireEvent.press(view.getByLabelText(`Choose ${path.name}`));
      for (let frequency = 1; frequency <= 7; frequency++) {
        const option = view.queryByRole("button", { name: String(frequency) });
        if (frequency < path.minDays || frequency > path.maxDays) {
          expect(option).toBeNull();
        } else {
          expect(option).toBeTruthy();
          await fireEvent.press(option!);
          expect(
            view.getByRole("button", {
              name: String(frequency),
              selected: true,
            }),
          ).toBeTruthy();
          expect(
            view.getByText(
              `Available weekdays · ${frequency} / ${frequency} selected`,
            ),
          ).toBeTruthy();
        }
      }
    } finally {
      db.close();
    }
  },
);

test("switching Paths preserves supported frequencies and weekdays, otherwise uses the new Path default", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ experience: "Advanced" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Paths />);
    await fireEvent.press(view.getByLabelText("Choose BUILD MUSCLE"));
    await fireEvent.press(view.getByRole("button", { name: "4" }));
    await fireEvent.press(view.getByLabelText("✓ Mon"));
    await fireEvent.press(view.getByLabelText("Wed"));
    await fireEvent.press(view.getByLabelText("Browse Paths"));
    await fireEvent.press(view.getByLabelText("Choose ATHLETE MODE"));
    expect(
      view.getByRole("button", { name: "4", selected: true }),
    ).toBeTruthy();
    expect(view.getByLabelText("Mon")).toBeTruthy();
    expect(view.getByLabelText("✓ Wed")).toBeTruthy();
    expect(view.getByText("Available weekdays · 4 / 4 selected")).toBeTruthy();

    await fireEvent.press(view.getByLabelText("Browse Paths"));
    await fireEvent.press(view.getByLabelText("Choose START STRONG"));
    const starter = forgePaths.find((p) => p.key === "start-strong")!;
    expect(
      view.getByRole("button", {
        name: String(starter.frequency),
        selected: true,
      }),
    ).toBeTruthy();
    expect(view.getByText("Available weekdays · 3 / 3 selected")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "1" }));
    await fireEvent.press(view.getByLabelText("Browse Paths"));
    await fireEvent.press(view.getByLabelText("Choose ADVANCED PHYSIQUE"));
    const physique = forgePaths.find((p) => p.key === "advanced-physique")!;
    expect(
      view.getByRole("button", {
        name: String(physique.frequency),
        selected: true,
      }),
    ).toBeTruthy();
    expect(view.getByText("Available weekdays · 5 / 5 selected")).toBeTruthy();
  } finally {
    db.close();
  }
});

test.each(forgePaths)(
  "$name rebuild uses the same supported options and retains the saved frequency",
  async (path) => {
    const { r, db } = pathRepository();
    try {
      acceptPath(
        r,
        generatePath(
          pathPreferences({
            pathKey: path.key,
            experience: "Advanced",
            frequency: path.frequency,
            duration: 90,
          }),
          exercises,
        ),
      );
      jest.mocked(useRepo).mockReturnValue(r);
      const view = await render(<Paths />);
      await fireEvent.press(view.getByLabelText("Manage Path"));
      await fireEvent.press(view.getByLabelText("Rebuild this Path"));
      expect(
        view.getByRole("button", {
          name: String(path.frequency),
          selected: true,
        }),
      ).toBeTruthy();
      for (let frequency = 1; frequency <= 7; frequency++) {
        const option = view.queryByRole("button", { name: String(frequency) });
        expect(!!option).toBe(
          frequency >= path.minDays && frequency <= path.maxDays,
        );
      }
    } finally {
      db.close();
    }
  },
);

test("Path personalization previews real workouts without saving until acceptance is confirmed", async () => {
  const { r, db } = pathRepository();
  jest.mocked(useRepo).mockReturnValue(r);
  const view = await render(<Paths />);
  await fireEvent.press(view.getByLabelText("Choose START STRONG"));
  await fireEvent.press(view.getByLabelText("Next step"));
  await fireEvent.press(view.getByLabelText("Next step"));
  await fireEvent.press(view.getByLabelText("Preview my eight-week plan"));
  expect(view.getByText("Your plan, before you commit.")).toBeTruthy();
  expect(r.journal("program")).toHaveLength(0);
  expect(r.journal("schedule")).toHaveLength(0);
  await fireEvent.press(view.getByLabelText("Start this Path"));
  expect(r.journal("program")).toHaveLength(0);
  expect(confirm).toHaveBeenCalledWith(
    "Start this eight-week Path?",
    expect.any(String),
    expect.any(Function),
  );
  await act(() => {
    jest.mocked(confirm).mock.calls.at(-1)![2]();
  });
  expect(pathPrograms(r)).toHaveLength(1);
  expect(r.journal("schedule")).toHaveLength(24);
  expect(pathSummary(r, pathPrograms(r)[0]!).completed).toBe(0);
  expect(view.getByText("0 / 24 workouts completed")).toBeTruthy();
  db.close();
}, 20_000);

test("Path preview honors imperial preferences while saving canonical kilograms", async () => {
  const { r, db } = pathRepository();
  r.saveProfile({ units: "lb" });
  jest.mocked(useRepo).mockReturnValue(r);
  const draft = generatePath(pathPreferences(), exercises);
  const onChange = jest.fn();
  const view = await render(
    <PathDayEditor
      day={draft.days[0]!}
      preferences={draft.preferences}
      catalog={exercises}
      onChange={onChange}
    />,
  );
  await fireEvent.changeText(
    view.getByLabelText(`${draft.days[0]!.name} exercise 1 load (lb)`),
    "44.092",
  );
  expect(onChange.mock.calls.at(-1)![0].exercises[0].weight).toBeCloseTo(20, 2);
  expect(r.profile().units).toBe("lb");
  db.close();
});

test("hypertrophy preview displays rep ranges and its editor preserves both boundaries", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const draft = generatePath(pathPreferences(), exercises);
    const day = draft.days[0]!;
    const list = await render(
      <PathWorkoutList items={day.exercises} catalog={exercises} />,
    );
    expect(list.getByText(/× 6-8/)).toBeTruthy();
    expect(list.getByText(/× 10-12/)).toBeTruthy();
    await list.unmount();
    const onChange = jest.fn();
    const view = await render(
      <PathDayEditor
        day={day}
        preferences={draft.preferences}
        catalog={exercises}
        onChange={onChange}
      />,
    );
    await fireEvent.changeText(
      view.getByLabelText(`${day.name} exercise 1 maximum reps`),
      "10",
    );
    expect(onChange.mock.calls.at(-1)![0].exercises[0]).toMatchObject({
      reps: 6,
      repMax: 10,
    });
    await fireEvent.changeText(
      view.getByLabelText(`${day.name} exercise 1 reps`),
      "9",
    );
    expect(onChange.mock.calls.at(-1)![0].exercises[0]).toMatchObject({
      reps: 9,
      repMax: 9,
    });
  } finally {
    db.close();
  }
});

test("workout shows its saved rep range even if the template later changes, with no unsupported load suggestion", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
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
      view.getByText(
        `Path target: ${row.target!.sets} × 6-8 reps · ${row.rest}s rest`,
      ),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Expand Barbell Bench Press"));
    await fireEvent.press(view.getByLabelText("Exercise options"));
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
      view.getByText("Template target: 2 × 6-8 reps · 120s rest"),
    ).toBeTruthy();
    expect(view.getByText("1 / 2 sets complete")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Expand Barbell Bench Press"));
    await fireEvent.changeText(view.getByLabelText("Set 2 weight (kg)"), "45");
    await fireEvent.changeText(view.getByLabelText("Set 2 reps"), "8");
    expect(view.queryByLabelText("Set notes")).toBeNull();
    await fireEvent.press(view.getByLabelText("Exercise options"));
    expect(view.getByLabelText("Set notes").props.value).toBe("Controlled");
    expect(view.getByLabelText("RIR (0–20, optional)").props.value).toBe("2");
    expect(view.getByLabelText("Tempo (e.g. 3-1-1-0)").props.value).toBe(
      "3-1-1-0",
    );
    await fireEvent.press(view.getByRole("button", { name: "Set 2" }));
    await fireEvent.changeText(
      view.getByLabelText("Set notes"),
      "Second working set",
    );
    await fireEvent.changeText(
      view.getByLabelText("RIR (0–20, optional)"),
      "3",
    );
    await fireEvent.press(view.getByLabelText("Hide exercise options"));
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
    await fireEvent.press(view.getByLabelText("Exercise options"));
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

test("weekly calendar navigates Monday–Sunday, shows rest days and recovers a moved session", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Paths />);
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
    await view.rerender(<Paths />);
    for (let i = 1; i < 12; i++)
      await fireEvent.press(view.getByLabelText("Next week →"));
    expect(view.getByText("Calendar week 12")).toBeTruthy();
    expect(view.getByText("2027-01-04 · scheduled")).toBeTruthy();
    expect(view.getByText("Training week 1 · Foundation")).toBeTruthy();
    expect(view.getByText("0 / 32 workouts completed")).toBeTruthy();
  } finally {
    db.close();
  }
}, 20_000);

test("gym access selects equipment and individual machines can still be deselected", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ equipment: "" });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Paths />);
    await fireEvent.press(view.getByLabelText("Choose START STRONG"));
    await fireEvent.press(view.getByLabelText("Next step"));
    await fireEvent.press(view.getByText("Gym access"));
    expect(view.getByLabelText("✓ Chest press machine")).toBeTruthy();
    expect(view.getByLabelText("✓ Leg curl machine")).toBeTruthy();
    expect(view.getByLabelText("✓ Cable station")).toBeTruthy();
    expect(view.queryByLabelText("Full gym machines")).toBeNull();
    await fireEvent.press(view.getByLabelText("✓ Leg curl machine"));
    expect(view.getByLabelText("Leg curl machine")).toBeTruthy();
    expect(view.getByLabelText("✓ Chest press machine")).toBeTruthy();
  } finally {
    db.close();
  }
}, 20_000);

test("selected Path shows one actionable workout and keeps essays and alternatives behind controls", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Paths />);
    expect(view.getAllByLabelText("Start workout")).toHaveLength(1);
    expect(view.queryByText("Weekly muscle coverage")).toBeNull();
    expect(view.queryByLabelText("Pause Path")).toBeNull();
    expect(view.queryByLabelText(/Change movement/)).toBeNull();
    expect(view.queryByText("Upper body · angles & detail")).toBeNull();
    await fireEvent.press(view.getByLabelText("Plan details"));
    expect(view.getByText("Weekly muscle coverage")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("Manage Path"));
    expect(view.getByLabelText("Pause Path")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("Workout options"));
    await fireEvent.press(
      view.getByLabelText("Move Upper body · chest & back"),
    );
    await fireEvent.changeText(
      view.getByLabelText("New session date (YYYY-MM-DD)"),
      "2027-01-04",
    );
    await fireEvent.press(view.getByLabelText("Save new session date"));
    expect(view.getByText("Calendar week 12")).toBeTruthy();
    expect(view.getByText("2027-01-04 · scheduled")).toBeTruthy();
    expect(pathSummary(r, pathPrograms(r)[0]!).completed).toBe(0);
  } finally {
    db.close();
  }
}, 20_000);

test("Path workouts progress against the Path's prescribed rep target, not the global range", async () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(
      r,
      generatePath(
        pathPreferences({ pathKey: "get-strong", frequency: 3 }),
        exercises,
      ),
    );
    const session = pathSessions(r, pathPrograms(r)[0]!)[0]!;
    const workout = startPathSession(r, session.record.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard
        row={r.workoutExercises(workout.id)[0]!}
        initialExpanded
      />,
    );
    await fireEvent.press(view.getByLabelText("Exercise options"));
    // The first Get Strong lift is prescribed 5 reps; the suggestion is driven
    // by that target (not the profile's 8-12 range) and stays user-applied.
    const row = r.workoutExercises(workout.id)[0]!;
    expect(
      view.getByText(
        `Path target: ${row.target!.sets} × 5 reps · ${row.rest}s rest`,
      ),
    ).toBeTruthy();
    expect(view.getByLabelText("Apply suggested load")).toBeTruthy();
    expect(view.queryByText(/Path progression:/)).toBeNull();
  } finally {
    db.close();
  }
}, 20_000);
