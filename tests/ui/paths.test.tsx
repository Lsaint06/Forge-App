import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import Paths, { PathDayEditor } from "../../src/screens/Paths";
import { useRepo, confirm } from "../../src/state";
import { pathRepository, pathPreferences } from "../path-fixture";
import { pathPrograms, pathSummary } from "../../src/data/paths";
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
