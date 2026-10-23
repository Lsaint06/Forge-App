import React from "react";
import { Alert, Text, Linking } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import WorkoutScreen from "../../src/screens/Workout";
import You from "../../src/screens/You";
import Templates from "../../app/templates";
import JournalScreen from "../../src/screens/Journal";
import Account from "../../app/account";
import { RecoveryScreen, ErrorBoundary } from "../../src/components/Recovery";
import { useRepo } from "../../src/state";
import {
  shareBackup,
  saveBackupToFolder,
  canSaveToFolder,
} from "../../src/platform/backup";
import { rescue } from "../../src/platform/rescue";
import { recordBackup } from "../../src/data/backup";
import { lbToKg } from "../../src/domain/metrics";
import { pathRepository } from "../path-fixture";

// Phase 7B WP1: the finish safeguard, backup status and reminders, template
// units, bodyweight goals, the recovery screen and the guest account copy.

const mockParams: { kind?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("../../src/platform/backup", () => {
  const { recordBackup: record, recordShare: share } = jest.requireActual(
    "../../src/data/backup",
  );
  type MockRepo = Parameters<typeof record>[0];
  return {
    shareBackup: jest.fn(async (r: MockRepo) => share(r)),
    saveBackupToFolder: jest.fn(async (r: MockRepo) => {
      record(r);
      return { saved: true, folder: "Downloads" };
    }),
    canSaveToFolder: jest.fn(() => true),
    pickBackup: jest.fn(async () => null),
    downloadBackup: jest.fn(async () => {}),
    shareFile: jest.fn(async () => {}),
  };
});
jest.mock("../../src/platform/rescue", () => ({ rescue: jest.fn() }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.kind;
});

type Repo = ReturnType<typeof pathRepository>["r"];

/** Bench: set 1 ticked, set 2 entered but not ticked. Row: set 1 entered,
 * set 2 empty. */
function workout(r: Repo) {
  r.saveProfile({ onboarded: true });
  const w = r.startWorkout("Upper");
  const bench = r.addExercise(w.id, "barbell-bench-press");
  const done = r.addSet(bench.id);
  r.editSet(done.id, { weight: 60, reps: 5, completed: true });
  const forgot = r.addSet(bench.id);
  r.editSet(forgot.id, { weight: 62.5, reps: 4 });
  const row = r.addExercise(w.id, "barbell-bent-over-row");
  const planned = r.addSet(row.id);
  r.editSet(planned.id, { weight: 50, reps: 8 });
  r.addSet(row.id);
  return { w, forgot, planned };
}
const completedIds = (r: Repo, workoutId: string) =>
  r
    .workoutSets(workoutId)
    .filter((s) => s.completed)
    .map((s) => s.id);

// ---- Finish (C-04) ----------------------------------------------------------

test("finishing lists entered but unticked sets and leaves them out unless included", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, forgot, planned } = workout(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    expect(view.getByText("1 set will be saved")).toBeTruthy();
    expect(view.getByText("Not marked done")).toBeTruthy();
    expect(view.getByText("Set 2 · 62.5×4")).toBeTruthy();
    expect(view.getByText("Set 1 · 50×8")).toBeTruthy();
    // Nothing is finished yet, and the empty set is not listed.
    expect(r.workout(w.id)!.status).toBe("active");
    expect(view.queryByText(/Set 2 · 0/)).toBeNull();

    await fireEvent.press(view.getByLabelText("Include Barbell Bench Press"));
    expect(view.getByText("2 sets will be saved")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Save workout"));
    expect(r.workout(w.id)!.status).toBe("completed");
    const done = completedIds(r, w.id);
    expect(done).toContain(forgot.id);
    expect(done).not.toContain(planned.id);
    expect(done).toHaveLength(2);
  } finally {
    db.close();
  }
});

test("Keep training closes the sheet without finishing", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = workout(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Keep training"));
    expect(view.queryByText("Not marked done")).toBeNull();
    expect(r.workout(w.id)!.status).toBe("active");
    expect(router.back).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("a workout with values but nothing ticked can be saved once sets are included", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Legs");
    const row = r.addExercise(w.id, "back-squat");
    const s = r.addSet(row.id);
    r.editSet(s.id, { weight: 100, reps: 5 });
    recordBackup(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    // Previously: "No completed sets" and no way forward but ticking each.
    expect(alert).not.toHaveBeenCalled();
    expect(view.getByText("No sets marked done yet")).toBeTruthy();
    const save = view.getByLabelText("Save workout");
    expect(save.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByLabelText("Include Back Squat"));
    expect(
      view.getByLabelText("Save workout").props.accessibilityState.disabled,
    ).toBe(false);
    await fireEvent.press(view.getByLabelText("Save workout"));
    expect(r.workout(w.id)!.status).toBe("completed");
    expect(completedIds(r, w.id)).toEqual([s.id]);
    // Backed up moments ago: the summary has no backup reminder.
    expect(view.getByText("Workout complete")).toBeTruthy();
    expect(view.queryByText("Back up your training")).toBeNull();
    await fireEvent.press(view.getByLabelText("Done, back to training"));
    expect(router.back).toHaveBeenCalled();
    // Done without a due reminder snoozes nothing.
    expect(r.setting("backupSnoozedUntil")).toBe("0");
  } finally {
    db.close();
  }
});

test("an empty workout still cannot be finished", async () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout("Empty");
    r.addSet(r.addExercise(w.id, "back-squat").id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    expect(alert).toHaveBeenCalledWith("No completed sets", expect.any(String));
    expect(view.queryByLabelText("Save workout")).toBeNull();
  } finally {
    db.close();
  }
});

// ---- Backup reminders and status --------------------------------------------

test("after a workout a due backup is offered in the summary; a folder save confirms it", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = workout(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    expect(r.workout(w.id)!.status).toBe("completed");
    expect(view.getByText("Workout complete")).toBeTruthy();
    expect(view.getByText("Back up your training")).toBeTruthy();
    expect(
      view.getByText(/Never backed up · 1 workout on this phone/),
    ).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Save backup to a folder"));
    expect(saveBackupToFolder).toHaveBeenCalledWith(r);
    expect(alert).toHaveBeenCalledWith(
      "Backup saved",
      expect.stringContaining("Saved to Downloads and checked"),
    );
    expect(Number(r.setting("lastBackupAt"))).toBeGreaterThan(0);
    // The summary stays, reports the backup, and offers it only once.
    expect(view.getByText(/Backup saved and checked/)).toBeTruthy();
    expect(view.queryByLabelText("Save backup to a folder")).toBeNull();
    await fireEvent.press(view.getByLabelText("Done, back to training"));
    expect(router.back).toHaveBeenCalled();
    // A completed backup is not a "Not now".
    expect(r.setting("backupSnoozedUntil")).toBe("0");
  } finally {
    db.close();
  }
});

test("sharing after a workout is recorded as unconfirmed, not as a backup", async () => {
  const { r, db } = pathRepository();
  try {
    workout(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    await fireEvent.press(view.getByLabelText("Share a copy"));
    expect(shareBackup).toHaveBeenCalledWith(r);
    expect(r.setting("lastBackupAt")).toBeUndefined();
    expect(Number(r.setting("lastSharedAt"))).toBeGreaterThan(0);
    expect(
      view.getByText(/Forge can't confirm the file was saved/),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Done, back to training"));
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("a cancelled folder picker keeps the backup offer open", async () => {
  const { r, db } = pathRepository();
  try {
    workout(r);
    jest.mocked(saveBackupToFolder).mockResolvedValueOnce({ saved: false });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    await fireEvent.press(view.getByLabelText("Save backup to a folder"));
    expect(alert).not.toHaveBeenCalled();
    expect(view.getByLabelText("Save backup to a folder")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(r.setting("lastBackupAt")).toBeUndefined();
  } finally {
    db.close();
  }
});

test("without folder saving (iPhone), sharing is the backup action", async () => {
  const { r, db } = pathRepository();
  try {
    workout(r);
    jest.mocked(canSaveToFolder).mockReturnValue(false);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    expect(view.queryByLabelText("Save backup to a folder")).toBeNull();
    expect(view.getByLabelText("Share a copy")).toBeTruthy();
  } finally {
    jest.mocked(canSaveToFolder).mockReturnValue(true);
    db.close();
  }
});

test("Done without backing up snoozes the reminder (Not now) and returns to training", async () => {
  const { r, db } = pathRepository();
  try {
    workout(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    await fireEvent.press(view.getByLabelText("Done, back to training"));
    expect(saveBackupToFolder).not.toHaveBeenCalled();
    expect(shareBackup).not.toHaveBeenCalled();
    expect(Number(r.setting("backupSnoozedUntil"))).toBeGreaterThan(Date.now());
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("You reports shared copies as unconfirmed and folder saves as backups", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = workout(r);
    r.finishWorkout(w.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<You />);
    expect(
      view.getByText("Never backed up · 1 workout on this phone"),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Export backup"));
    expect(view.getByText("Back up your data")).toBeTruthy();
    expect(view.getByText(/can't confirm it was saved/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Share a copy"));
    expect(shareBackup).toHaveBeenCalledWith(r);
    await view.rerender(<You />);
    expect(
      view.getAllByText(/^Shared today · not confirmed saved/).length,
    ).toBeGreaterThan(0);

    await fireEvent.press(view.getByLabelText("Export backup"));
    await fireEvent.press(view.getByLabelText("Save to a folder"));
    expect(saveBackupToFolder).toHaveBeenCalledWith(r);
    await view.rerender(<You />);
    expect(view.getAllByText("Last backup today").length).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});

// ---- Template units (C-01) --------------------------------------------------

test("a pound user edits template loads in pounds while kilograms are stored", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ units: "lb" });
    r.saveTemplate("Push", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 5,
        weight: lbToKg(135),
        rest: 120,
      },
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit"));
    expect(view.queryByLabelText("kg")).toBeNull();
    const field = view.getByLabelText("lb");
    expect(field.props.value).toBe("135");
    await fireEvent(field, "focus");
    await fireEvent.changeText(field, "185");
    await fireEvent.press(view.getByLabelText("Save template"));
    const saved = r.templates()[0]!.exercises[0]!.weight;
    expect(saved).toBeCloseTo(lbToKg(185), 6);
    expect(saved).toBeCloseTo(83.91, 2);
  } finally {
    db.close();
  }
});

test("a kilogram user's template loads are unchanged", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Push", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 5,
        weight: 60,
        rest: 120,
      },
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit"));
    const field = view.getByLabelText("kg");
    expect(field.props.value).toBe("60");
    await fireEvent(field, "focus");
    await fireEvent.changeText(field, "62.5");
    await fireEvent.press(view.getByLabelText("Save template"));
    expect(r.templates()[0]!.exercises[0]!.weight).toBe(62.5);
  } finally {
    db.close();
  }
});

// ---- Bodyweight goal (C-02) -------------------------------------------------

function goal(r: Repo) {
  r.addJournal("goal", {
    name: "Reach 80 kg",
    metric: "bodyweight",
    start: 84,
    target: 80,
  });
}

test("a bodyweight goal reads any spelling of body weight", async () => {
  const { r, db } = pathRepository();
  try {
    r.addJournal(
      "measurement",
      { name: "Body weight", value: 83, unit: "kg" },
      "2026-10-01",
    );
    r.addJournal(
      "measurement",
      { name: "Body weight", value: 81.75, unit: "kg" },
      "2026-10-16",
    );
    goal(r);
    mockParams.kind = "goal";
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    expect(view.getByText("81.8 kg now · target 80 kg")).toBeTruthy();
    expect(
      view.getByLabelText("Reach 80 kg").props.accessibilityValue.now,
    ).toBe(56);
  } finally {
    db.close();
  }
});

test("a bodyweight goal with no weight logged shows no progress, not completion", async () => {
  const { r, db } = pathRepository();
  try {
    goal(r);
    mockParams.kind = "goal";
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<JournalScreen />);
    expect(
      view.getByText("No bodyweight logged yet · target 80 kg"),
    ).toBeTruthy();
    expect(
      view.getByLabelText("Reach 80 kg").props.accessibilityValue.now,
    ).toBe(0);
  } finally {
    db.close();
  }
});

// ---- Recovery screen --------------------------------------------------------

test("the recovery screen saves a copy of the data and reports the result", async () => {
  const retry = jest.fn();
  jest.mocked(rescue).mockResolvedValueOnce({ kind: "backup" });
  const view = await render(
    <RecoveryScreen
      message="database disk image is malformed"
      onRetry={retry}
    />,
  );
  expect(view.getByText("FORGE couldn't open")).toBeTruthy();
  expect(view.getByText(/has not been deleted/)).toBeTruthy();
  expect(view.getByText("database disk image is malformed")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Save a copy of my data"));
  expect(rescue).toHaveBeenCalledTimes(1);
  // A share is never claimed as a confirmed save.
  expect(
    await view.findByText(/handed to the share sheet\. Forge can't confirm/),
  ).toBeTruthy();
  expect(view.queryByText(/Backup file ready/)).toBeNull();
  await fireEvent.press(view.getByLabelText("Try again"));
  expect(retry).toHaveBeenCalledTimes(1);

  jest.mocked(rescue).mockResolvedValueOnce({
    kind: "database",
    reason: "malformed",
  });
  await fireEvent.press(view.getByLabelText("Save a copy of my data"));
  expect(await view.findByText(/copy of the database file/)).toBeTruthy();
  jest.mocked(rescue).mockResolvedValueOnce({
    kind: "failed",
    message: "no space left",
  });
  await fireEvent.press(view.getByLabelText("Save a copy of my data"));
  expect(
    await view.findByText("Couldn't create a copy: no space left"),
  ).toBeTruthy();
});

test("no support contact is shown until a real address is configured", async () => {
  const saved = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  try {
    delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    const none = await render(
      <RecoveryScreen message="disk unavailable" onRetry={jest.fn()} />,
    );
    expect(none.queryByLabelText("Email support")).toBeNull();
    expect(none.queryByText(/@/)).toBeNull();
    await none.unmount();

    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "not an address";
    const invalid = await render(
      <RecoveryScreen message="disk unavailable" onRetry={jest.fn()} />,
    );
    expect(invalid.queryByLabelText("Email support")).toBeNull();
    await invalid.unmount();

    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@forge.test";
    const view = await render(
      <RecoveryScreen message="disk unavailable" onRetry={jest.fn()} />,
    );
    expect(
      view.getByText(/Contact FORGE support at help@forge\.test/),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Email support"));
    const url = open.mock.calls[0]![0];
    expect(url).toMatch(/^mailto:help@forge\.test\?subject=/);
    expect(decodeURIComponent(url)).toContain("disk unavailable");
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = saved;
    open.mockRestore();
  }
});

test("the error boundary shows recovery and Try again remounts the app", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  function App() {
    if (fail) throw new Error("disk unavailable");
    return <Text>Today</Text>;
  }
  try {
    const view = await render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
    expect(view.getByText("disk unavailable")).toBeTruthy();
    fail = false;
    await fireEvent.press(view.getByLabelText("Try again"));
    expect(view.getByText("Today")).toBeTruthy();
  } finally {
    spy.mockRestore();
  }
});

// ---- Account guest copy (C-08) ----------------------------------------------

test("guest mode explains local storage without developer configuration text", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Account />);
    expect(view.getByText("Guest mode is active")).toBeTruthy();
    expect(view.getByText(/stays on this phone/)).toBeTruthy();
    expect(view.queryByText(/EXPO_PUBLIC|README|migration/)).toBeNull();
  } finally {
    db.close();
  }
});
