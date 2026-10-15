import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import Paths, { PathDayEditor } from "../../src/screens/Paths";
import { useRepo, confirm } from "../../src/state";
import { pathRepository, pathPreferences } from "../path-fixture";
import {
  pathPrograms,
  pathSummary,
  acceptPath,
  pathSessions,
  reschedulePathSession,
} from "../../src/data/paths";
import { generatePath } from "../../src/domain/paths/generator";
import { exercises } from "../../src/data/catalog";

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
