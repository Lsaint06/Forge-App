import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { router } from "expo-router";
import Home from "../../src/screens/Home";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { programLibrary, libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { ARRIVAL_KEY, writeArrival } from "../../src/domain/onboarding/journey";
import { revealTitle } from "../../src/domain/onboarding/reveal";
import { programKey, publishedPrograms } from "../../src/domain/programs/model";
import { localDate } from "../../src/domain/types";

// Phase 9.2: after setup, Home opens on the Forge Path the athlete was just
// shown. It only opens that program in Forge Paths; nothing is enrolled.

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

beforeEach(() => jest.clearAllMocks());

const program = publishedPrograms(programLibrary).find(
  (p) => p.id === "forge-strength-intermediate-4-day",
)!;
function setup(arrival?: string) {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, name: "Sam" });
  if (arrival !== undefined) fixture.r.setSetting(ARRIVAL_KEY, arrival);
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}

test("Home picks up where the reveal left off: the Forge Path, and a way to it", async () => {
  const { r, db } = setup(writeArrival(programKey(program)));
  const view = await render(<Home />);
  const card = view.getByTestId("forge-path-arrival");
  expect(card).toBeTruthy();
  expect(view.getByRole("header", { name: revealTitle(program) })).toBeTruthy();
  expect(view.getByText("4 days a week · 8 weeks")).toBeTruthy();
  expect(view.getByText(/Nothing starts until you choose/)).toBeTruthy();
  await act(async () =>
    fireEvent.press(view.getByRole("button", { name: "View your Forge Path" })),
  );
  // Only the program's page in Forge Paths: starting it stays a choice.
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/forge-paths/[programId]",
    params: { programId: program.id, version: String(program.version) },
  });
  expect(r.journal("program")).toEqual([]);
  expect(r.active()).toBeUndefined();
  db.close();
});

test("closing the card forgets it; nothing else changes", async () => {
  const { r, db } = setup(writeArrival(programKey(program)));
  const view = await render(<Home />);
  await act(async () =>
    fireEvent.press(
      view.getByRole("button", { name: "Close your Forge Path card" }),
    ),
  );
  expect(r.setting(ARRIVAL_KEY)).toBeUndefined();
  await view.rerender(<Home />);
  expect(view.queryByTestId("forge-path-arrival")).toBeNull();
  expect(r.journal("program")).toEqual([]);
  db.close();
});

test("no card without a real Forge Path, or once a plan is running", async () => {
  for (const raw of [undefined, "", "{", writeArrival("forge-unknown@1")]) {
    const { db } = setup(raw);
    const view = await render(<Home />);
    expect(view.queryByTestId("forge-path-arrival")).toBeNull();
    await view.unmount();
    db.close();
  }
  const { r, db } = setup(writeArrival(programKey(program)));
  const chosen = libraryPrograms().find((p) => p.id === program.id)!;
  enrollProgram(r, chosen, localDate());
  const view = await render(<Home />);
  expect(view.queryByTestId("forge-path-arrival")).toBeNull();
  db.close();
});
