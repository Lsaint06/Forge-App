import React from "react";
import { Alert, type AlertButton } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import WorkoutScreen from "../../src/screens/Workout";
import { toggleNotifications } from "../../src/components/ProfileForm";
import { useRepo, confirm } from "../../src/state";
import {
  cancelRestNotification,
  enableNotifications,
  restNotification,
} from "../../src/notifications";
import { editInProgress } from "../../src/data/workout-session";
import { REST_ALERT_INVITE, offeredIn } from "../../src/domain/rest-alerts";
import { pathRepository } from "../path-fixture";

// Phase 8.3C-3, workout reliability: T-1 typed values are saved before the
// field closes; W-1 a discarded workout's rest ends with it; W-2 the
// invitation to turn on rest alerts; W-4 a finished workout keeps at least
// one completed set.

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
const mockParams: { id?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  notificationsAvailable: true,
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.id;
});

type Repo = ReturnType<typeof pathRepository>["r"];
const BENCH = "barbell-bench-press";
const INVITE = "Know when you're ready.";
const rest = (r: Repo) =>
  r.setSetting("restDeadline", String(Date.now() + 90_000));
const lastAlert = () => alert.mock.calls.at(-1)!;

/** Push, in progress: set 1 done, set 2 still to log. */
function inProgress(r: Repo, name = "Push") {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, BENCH);
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.addSet(row.id, { weight: 80, reps: 8 });
  jest.mocked(useRepo).mockReturnValue(r);
  return { w, row };
}

/** Push, finished with two completed sets, opened from History. */
function finished(r: Repo) {
  const w = r.startWorkout("Push");
  const row = r.addExercise(w.id, BENCH);
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.finishWorkout(w.id);
  mockParams.id = w.id;
  jest.mocked(useRepo).mockReturnValue(r);
  return { w, row };
}

// ---- T-1: typed values are stored as they are typed --------------------------

test("T-1: a typed load and reps are saved with each keystroke, before the field closes", async () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout("Push");
    const row = r.addExercise(w.id, BENCH);
    r.addSet(row.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    const load = view.getByLabelText("Set 1 weight (kg)");
    await fireEvent(load, "focus");
    for (const text of ["1", "10", "102"])
      await fireEvent.changeText(load, text);
    expect(r.sets(row.id)[0]!.weight).toBe(102);
    // Half-typed, the last complete value stays saved.
    await fireEvent.changeText(load, "102,");
    expect(r.sets(row.id)[0]!.weight).toBe(102);
    await fireEvent.changeText(load, "102,5");
    const reps = view.getByLabelText("Set 1 reps");
    await fireEvent(reps, "focus");
    await fireEvent.changeText(reps, "6");
    // No endEditing: if Forge closes now (a force-quit, or iOS ending it in
    // the background), nothing typed is lost.
    expect(r.sets(row.id)[0]).toMatchObject({ weight: 102.5, reps: 6 });
    await view.unmount();
    expect(r.sets(row.id)[0]).toMatchObject({ weight: 102.5, reps: 6 });
  } finally {
    db.close();
  }
});

// ---- W-1: a discarded workout's rest ends with it ----------------------------

test("W-1: discarding a workout during a rest ends the rest and its alert; the next workout starts without it", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = inProgress(r);
    rest(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByLabelText("+30 sec")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Workout options"));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Discard workout" }),
    );
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const [title, , discard, options] = jest.mocked(confirm).mock.calls.at(-1)!;
    expect(title).toBe("Discard this workout?");
    expect(options).toEqual({ action: "Discard workout" });
    discard();
    expect(r.workout(w.id)).toBeUndefined();
    expect(r.setting("restDeadline")).toBe("0");
    expect(cancelRestNotification).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    await view.unmount();
    // The next workout opens with the rest timer ready, not mid-countdown.
    r.startWorkout("Pull");
    const next = await render(<WorkoutScreen />);
    expect(next.getByLabelText("Start rest")).toBeTruthy();
    expect(next.queryByLabelText("+30 sec")).toBeNull();
  } finally {
    db.close();
  }
});

test("W-1: deleting a finished session leaves the rest of the workout in progress alone", async () => {
  const { r, db } = pathRepository();
  try {
    const { w: old } = finished(r);
    r.startWorkout("Pull");
    rest(r);
    const deadline = r.setting("restDeadline");
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Workout options"));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Delete session" }),
    );
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const [title, , remove] = jest.mocked(confirm).mock.calls.at(-1)!;
    expect(title).toBe("Delete this workout?");
    remove();
    expect(r.workout(old.id)).toBeUndefined();
    expect(r.setting("restDeadline")).toBe(deadline);
    expect(cancelRestNotification).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

// ---- W-2: the invitation to turn on rest alerts -------------------------------

test("W-2: the first rest with alerts off brings a quiet invitation; permission is asked only on Enable", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = inProgress(r);
    const view = await render(<WorkoutScreen />);
    // Not resting: nothing to offer.
    expect(view.queryByText(INVITE)).toBeNull();
    rest(r);
    await view.rerender(<WorkoutScreen />);
    expect(view.getByText(INVITE)).toBeTruthy();
    expect(
      view.getByText(
        "Get a notification when your rest ends, even when your phone is locked.",
      ),
    ).toBeTruthy();
    expect(view.getByRole("button", { name: "Not now" })).toBeTruthy();
    // An invitation, not a prompt: nothing is asked of the phone yet.
    expect(enableNotifications).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(r.setting(REST_ALERT_INVITE)).toBe(offeredIn(w.id));
    await fireEvent.press(
      view.getByRole("button", { name: "Enable notifications" }),
    );
    await waitFor(() => expect(r.setting(REST_ALERT_INVITE)).toBe("enabled"));
    expect(enableNotifications).toHaveBeenCalledTimes(1);
    expect(r.profile().notifications).toBe(true);
    // The rest already running gets its alert.
    expect(restNotification).toHaveBeenCalledWith(
      Number(r.setting("restDeadline")),
    );
    await view.rerender(<WorkoutScreen />);
    expect(view.queryByText(INVITE)).toBeNull();
  } finally {
    db.close();
  }
});

test("W-2: a refused permission is explained and remembered; alerts stay off", async () => {
  const { r, db } = pathRepository();
  try {
    inProgress(r);
    rest(r);
    jest.mocked(enableNotifications).mockResolvedValueOnce(false);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(
      view.getByRole("button", { name: "Enable notifications" }),
    );
    await waitFor(() => expect(r.setting(REST_ALERT_INVITE)).toBe("declined"));
    expect(alert).toHaveBeenCalledWith(
      "Notifications not enabled",
      "Workouts and in-app timers still work. You can change permissions in phone settings.",
    );
    expect(r.profile().notifications).toBe(false);
    expect(restNotification).not.toHaveBeenCalled();
    await view.rerender(<WorkoutScreen />);
    expect(view.queryByText(INVITE)).toBeNull();
  } finally {
    db.close();
  }
});

test("W-2: Not now is remembered through later rests and workouts", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = inProgress(r);
    rest(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Not now" }));
    expect(r.setting(REST_ALERT_INVITE)).toBe("dismissed");
    expect(enableNotifications).not.toHaveBeenCalled();
    rest(r);
    await view.rerender(<WorkoutScreen />);
    expect(view.queryByText(INVITE)).toBeNull();
    await view.unmount();
    r.finishWorkout(w.id);
    r.startWorkout("Pull");
    rest(r);
    const next = await render(<WorkoutScreen />);
    expect(next.queryByText(INVITE)).toBeNull();
  } finally {
    db.close();
  }
});

test("W-2: an unanswered invitation stays with its workout and never follows the lifter", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = inProgress(r);
    rest(r);
    const first = await render(<WorkoutScreen />);
    expect(first.getByText(INVITE)).toBeTruthy();
    await first.unmount();
    // Reopened later in the same workout, it is still offered.
    rest(r);
    const again = await render(<WorkoutScreen />);
    expect(again.getByText(INVITE)).toBeTruthy();
    await again.unmount();
    r.finishWorkout(w.id);
    r.startWorkout("Pull");
    rest(r);
    const next = await render(<WorkoutScreen />);
    expect(next.queryByText(INVITE)).toBeNull();
  } finally {
    db.close();
  }
});

test("W-2: alerts already on, or a choice made in Preferences, mean no invitation", async () => {
  const { r, db } = pathRepository();
  try {
    inProgress(r);
    rest(r);
    r.saveProfile({ notifications: true });
    const view = await render(<WorkoutScreen />);
    expect(view.queryByText(INVITE)).toBeNull();
    // Turning alerts off in Preferences is a choice the logger respects.
    toggleNotifications(r);
    expect(r.profile().notifications).toBe(false);
    expect(r.setting(REST_ALERT_INVITE)).toBe("settings");
    await view.rerender(<WorkoutScreen />);
    expect(view.queryByText(INVITE)).toBeNull();
  } finally {
    db.close();
  }
});

// ---- W-4: a finished workout keeps at least one completed set ----------------

test("W-4: an edit that leaves no completed set isn't saved as finished; Keep editing keeps everything", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, row } = finished(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await fireEvent.press(view.getByLabelText("Mark set 1 incomplete"));
    await fireEvent.press(view.getByLabelText("Mark set 2 incomplete"));
    expect(r.sets(row.id).some((s) => s.completed)).toBe(false);
    await fireEvent.press(view.getByLabelText("Save changes"));
    const [title, message, buttons] = lastAlert();
    expect(title).toBe("No sets marked done");
    expect(message).toBe(
      "A finished workout needs at least one completed set. Keep editing to mark your sets done, or delete this session.",
    );
    const choices = buttons as AlertButton[];
    expect(choices.map((b) => [b.text, b.style])).toEqual([
      ["Keep editing", "cancel"],
      ["Delete session", "destructive"],
    ]);
    // Keep editing: nothing saved, nothing deleted; Cancel can still restore.
    choices[0]!.onPress?.();
    expect(confirm).not.toHaveBeenCalled();
    expect(editInProgress(r, w.id)).toBe(true);
    expect(r.workout(w.id)!.status).toBe("completed");
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Save changes")).toBeTruthy();
    // With a set done again, Save works as before.
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(editInProgress(r, w.id)).toBe(false);
    expect(r.sets(row.id).filter((s) => s.completed)).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("W-4: Delete session asks again; only a confirmed deletion removes the session", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, row } = finished(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await fireEvent.press(view.getByLabelText("Mark set 1 incomplete"));
    await fireEvent.press(view.getByLabelText("Mark set 2 incomplete"));
    await fireEvent.press(view.getByLabelText("Save changes"));
    (lastAlert()[2] as AlertButton[])[1]!.onPress?.();
    // The usual confirmation for deleting a session comes before anything goes.
    const [title, message, remove, options] = jest
      .mocked(confirm)
      .mock.calls.at(-1)!;
    expect(title).toBe("Delete this workout?");
    expect(message).toMatch(/cannot be undone, so export a backup first/);
    expect(options).toEqual({ action: "Delete workout" });
    expect(r.workout(w.id)).toBeDefined();
    expect(r.sets(row.id)).toHaveLength(2);
    remove();
    expect(r.workout(w.id)).toBeUndefined();
    expect(editInProgress(r, w.id)).toBe(false);
    expect(router.back).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});
