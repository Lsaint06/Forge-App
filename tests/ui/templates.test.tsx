import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import Templates from "../../app/templates";
import Home from "../../src/screens/Home";
import Train from "../../app/(tabs)/train";
import { useRepo } from "../../src/state";
import { localDate } from "../../src/domain/types";
import { pathRepository } from "../path-fixture";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ section: "programs" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));

beforeEach(() => jest.clearAllMocks());

test("templates remain available without starter program browsing or adoption, including old program links", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const before = r.exportBackup();
    const view = await render(<Templates />);
    expect(view.getByText("Workout templates")).toBeTruthy();
    expect(view.getByLabelText("Create template")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Programs" })).toBeNull();
    expect(view.queryByText("Starter programs")).toBeNull();
    expect(view.queryByRole("button", { name: /^Use / })).toBeNull();
    expect(r.exportBackup()).toEqual({
      ...before,
      exportedAt: expect.any(Number),
    });
  } finally {
    db.close();
  }
});

test("Train keeps Paths, custom templates and empty workouts without the separate programs entry", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(view.queryByLabelText("Training programs")).toBeNull();
    expect(view.queryByLabelText("Templates & programs")).toBeNull();
    await fireEvent.press(view.getByLabelText("Forge Paths"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
    await fireEvent.press(view.getByLabelText("Workout templates"));
    expect(router.push).toHaveBeenLastCalledWith("/templates");
    await fireEvent.press(view.getByLabelText("Start empty workout"));
    expect(r.active()).toBeDefined();
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("Home directs new guided-plan selection to Forge Paths", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Home />);
    expect(view.queryByLabelText("Choose a program")).toBeNull();
    await fireEvent.press(view.getByLabelText("Choose a Forge Path"));
    expect(router.push).toHaveBeenLastCalledWith("/forge-paths");
  } finally {
    db.close();
  }
});

test("previously adopted programs survive backup restore and still start their saved deload sessions", async () => {
  const { r, db } = pathRepository();
  const restored = pathRepository();
  try {
    const template = r.saveTemplate("Bench + upper", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 5,
        rest: 180,
        weight: 40,
      },
    ]);
    const completed = r.startWorkout(template.name, template.id);
    for (const set of r.workoutSets(completed.id))
      r.editSet(set.id, { completed: true, rpe: 8 });
    r.finishWorkout(completed.id);
    const program = r.addJournal("program", {
      name: "Powerbuilding",
      weeks: 8,
      started: localDate(),
      templates: template.id,
      deloadEvery: 4,
    });
    r.addJournal("schedule", {
      name: template.name,
      templateId: template.id,
      programId: program.id,
      week: 4,
      deload: true,
    });
    const backup = r.exportBackup();
    restored.r.importBackup(JSON.stringify(backup));
    const restoredBackup = restored.r.exportBackup();
    jest.mocked(useRepo).mockReturnValue(restored.r);
    const view = await render(<Templates />);
    // The template and its planned session are both listed.
    expect(view.getAllByText("Bench + upper")).toHaveLength(2);
    expect(view.getByLabelText("Edit Bench + upper")).toBeTruthy();
    expect(view.getByText(/Deload: one fewer set per exercise/)).toBeTruthy();
    expect(restored.r.exportBackup()).toEqual({
      ...restoredBackup,
      exportedAt: expect.any(Number),
    });
    await fireEvent.press(view.getByLabelText("Start planned session"));
    const active = restored.r.active()!;
    expect(active.templateId).toBe(template.id);
    expect(restored.r.workoutSets(active.id)).toHaveLength(2);
    expect(restored.r.workoutSets(completed.id)).toEqual(
      r.workoutSets(completed.id),
    );
    expect(restored.r.journal()).toEqual(r.journal());
    expect(restored.r.templates()).toEqual(restoredBackup.templates);
    expect(router.push).toHaveBeenLastCalledWith("/workout");
  } finally {
    db.close();
    restored.db.close();
  }
});
