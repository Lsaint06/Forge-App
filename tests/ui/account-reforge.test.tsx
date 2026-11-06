import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import Account from "../../app/account";
import { router } from "expo-router";
import { useRepo, confirm } from "../../src/state";
import { synchronize } from "../../src/cloud/sync";
import { pathRepository } from "../path-fixture";
import { theme } from "../../src/theme";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { EntryContext } from "../../src/auth/session";
import { recordSyncOutcome } from "../../src/cloud/sync-state";

// Phase 7.5G.3: Account & privacy in REFORGE. The cloud client and the sync
// engine are mocked here: these tests check what the screen says and which
// existing handlers it calls, not a real Supabase project.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: mockProfile }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  cancelAllNotifications: jest.fn(async () => {}),
}));
type Session = { user: { id: string; email?: string } } | null;
const mockCloud: {
  configured: boolean;
  session: Session;
  client?: Record<string, unknown>;
} = { configured: false, session: null };
jest.mock("../../src/cloud/client", () => ({
  cloudClient: () => (mockCloud.configured ? mockCloud.client : null),
  transport: jest.fn(() => ({})),
}));
jest.mock("../../src/cloud/sync", () => ({ synchronize: jest.fn() }));
// The link Forge was opened with (a password-reset link, in some tests).
let mockURL: string | null = null;
jest.mock("expo-linking", () => ({
  ...jest.requireActual("expo-linking"),
  useURL: () => mockURL,
}));

/** A Supabase-shaped access token naming `sub` (never verified in tests). */
const jwt = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;

function cloud(session: Session) {
  // The stored sign-in carries its account's token, as Supabase's does.
  const stored = session
    ? { ...session, access_token: jwt(session.user.id) }
    : null;
  const auth = {
    getSession: jest.fn(async () => ({
      data: { session: stored },
      error: null,
    })),
    // The account as the account service sees it now (Phase 7.8E).
    getUser: jest.fn(async () => ({
      data: { user: session?.user ?? null },
      error: null,
    })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    signInWithPassword: jest.fn(async () => ({ error: null })),
    signUp: jest.fn(async () => ({ error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    setSession: jest.fn(async () => ({ error: null })),
    updateUser: jest.fn(async () => ({ error: null })),
  };
  Object.assign(mockCloud, {
    configured: true,
    session,
    client: { auth, rpc: jest.fn(async () => ({ error: null })) },
  });
  return auth;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockURL = null;
  Object.assign(mockCloud, {
    configured: false,
    session: null,
    client: undefined,
  });
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

function setup() {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const flush = () => act(async () => {});
const sections = (view: Awaited<ReturnType<typeof render>>) =>
  view
    .getAllByRole("header")
    .map((h) => [h.props.children].flat().join(""))
    .filter((t) =>
      [
        "Account",
        "Cloud sync",
        "Data & privacy",
        "Membership",
        "About",
        "Delete",
      ].includes(t),
    );

test("guest: the sections in order, guest copy, no sync or cloud deletion", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<Account />);
    await flush();
    expect(sections(view)).toEqual([
      "Account",
      "Data & privacy",
      "Membership",
      "About",
      "Delete",
    ]);
    const guest = within(view.getByTestId("account-guest"));
    expect(guest.getByText("On this phone only")).toBeTruthy();
    expect(guest.getByText("Guest mode is active")).toBeTruthy();
    expect(
      view.queryByText(
        /everything is (safe|protected|backed up)|fully backed up|all your data is safe/i,
      ),
    ).toBeNull();
    expect(view.queryByLabelText("Delete cloud account")).toBeNull();
    expect(view.queryByRole("button", { name: "Synchronize now" })).toBeNull();
    // Delete all local data says what it removes, in words, and only asks.
    const del = view.getByRole("button", { name: "Delete all local data" });
    expect(del.props.accessibilityHint).toMatch(/on this phone/);
    await fireEvent.press(del);
    expect(confirm).toHaveBeenCalledWith(
      "Delete all local data?",
      expect.stringContaining("can't be undone"),
      expect.any(Function),
      { action: "Delete everything" },
    );
    expect(r.profile().onboarded).toBe(true);
  } finally {
    db.close();
  }
});

test("signed out: no sign-in form here; signing in lives on the entry screens (7.8E, E9)", async () => {
  const { r, db } = setup();
  try {
    const auth = cloud(null);
    const view = await render(<Account />);
    await flush();
    // Account & privacy opens only for a signed-in athlete; outside the gate
    // it says so and offers nothing to type into.
    const card = within(view.getByTestId("account-signed-out"));
    expect(card.getByText("Not signed in")).toBeTruthy();
    expect(view.queryByTestId("account-sign-in")).toBeNull();
    expect(view.queryByLabelText("Email")).toBeNull();
    expect(view.queryByLabelText("Password")).toBeNull();
    expect(view.queryByRole("tab")).toBeNull();
    expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    // Cloud sync explains that signing in comes first; local changes wait.
    const sync = within(view.getByTestId("account-sync"));
    expect(
      sync.getByLabelText(
        `On this phone: ${r.outbox().length} ${r.outbox().length === 1 ? "change" : "changes"} waiting to upload`,
      ),
    ).toBeTruthy();
    expect(sync.getByText(/^Sign in to synchronize\./)).toBeTruthy();
    expect(view.queryByRole("button", { name: "Synchronize now" })).toBeNull();
    expect(synchronize).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("signed in: the real email, one sync at a time, its result in words", async () => {
  const { r, db } = setup();
  try {
    const long =
      "alexander.featherstonehaugh-montgomery@example-training-club.com";
    const auth = cloud({ user: { id: "u1", email: long } });
    type Result = Awaited<ReturnType<typeof synchronize>>;
    let finish: (v: Result) => void = () => {};
    jest
      .mocked(synchronize)
      .mockImplementation(() => new Promise<Result>((done) => (finish = done)));
    const view = await render(<Account />);
    await flush();
    const me = within(view.getByTestId("account-signed-in"));
    expect(me.getByText("Signed in")).toBeTruthy();
    const email = me.getByText(long);
    expect(email.props.numberOfLines).toBeUndefined();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    expect(synchronize).toHaveBeenCalledTimes(1);
    const working = view.getByRole("button", { name: "Working…" });
    expect(working.props.accessibilityState.disabled).toBe(true);
    // Deleting the account waits while sync runs.
    expect(
      view.getByRole("button", { name: "Delete Forge account" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    await act(async () =>
      finish({
        uploaded: 3,
        downloaded: 1,
        matched: 0,
        rejected: 0,
        failed: 0,
        held: { update: 0, active: 0 },
        conflicts: 0,
        pending: 0,
        errors: [],
      }),
    );
    expect(
      view.getByText("Sync complete: 3 uploaded · 1 downloaded."),
    ).toBeTruthy();
    // Signing out ends only this phone's sign-in and keeps local data.
    await fireEvent.press(me.getByRole("button", { name: "Sign out" }));
    await flush();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(
      view.getByText("Signed out. Your local records remain on this device."),
    ).toBeTruthy();
    expect(r.profile().onboarded).toBe(true);
  } finally {
    db.close();
  }
});

test("signed in: every linked way into the account is listed (Phase 7.7B.1)", async () => {
  const { db } = setup();
  try {
    cloud({
      user: {
        id: "u1",
        email: "a@example.com",
        app_metadata: { provider: "email", providers: ["email", "google"] },
      },
    } as never);
    const view = await render(<Account />);
    await flush();
    const me = within(view.getByTestId("account-signed-in"));
    expect(me.getByText("Signs in with Email · Google")).toBeTruthy();
    expect(synchronize).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});
test("a failed sync says so, and pending changes are kept", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const pending = r.outbox().length;
    // Phase 7.8B: a lost connection stops the sync, with its reason.
    jest.mocked(synchronize).mockResolvedValueOnce({
      uploaded: 0,
      downloaded: 0,
      matched: 0,
      rejected: 0,
      failed: 0,
      held: { update: 0, active: 0 },
      stopped: "offline",
      conflicts: 0,
      pending,
      errors: ["TypeError: Network request failed"],
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(
      view.getByText(
        `Forge couldn't reach the cloud, so sync stopped. Nothing was lost: ${pending} ${pending === 1 ? "change is" : "changes are"} still waiting on this phone. Check your connection and try again.`,
      ),
    ).toBeTruthy();
    // The technical detail goes to the developer log, not the screen.
    expect(view.queryByText(/TypeError/)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[FORGE] Sync details:",
      "TypeError: Network request failed",
    );
    warn.mockRestore();
    // A sync that throws is explained the same way.
    jest
      .mocked(synchronize)
      .mockRejectedValueOnce(new TypeError("Network request failed"));
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(
      view.getByText(
        "Forge couldn't reach the cloud, so sync stopped. Nothing was lost. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(r.outbox()).toHaveLength(pending);
    expect(
      view.queryByText(
        /sync complete|up to date|synced successfully|fully backed up/i,
      ),
    ).toBeNull();
  } finally {
    db.close();
  }
});

test("conflicts are named by what they are, never by record id; choices still ask", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const id = "0f8b6c1e-9d6e-4c55-a7e2-conflict-id";
    r.conflict(
      id,
      "{}",
      JSON.stringify({
        id,
        kind: "workout",
        payload: { workout: { name: "Push day" } },
        revision: 3,
        deleted: false,
      }),
      3,
    );
    const view = await render(<Account />);
    await flush();
    expect(
      within(view.getByTestId("account-sync")).getByLabelText(
        "Conflicts: 1 waiting for your choice",
      ),
    ).toBeTruthy();
    expect(view.getByText("Workout · Push day")).toBeTruthy();
    expect(view.queryByText(new RegExp(id))).toBeNull();
    await fireEvent.press(
      view.getByRole("button", { name: "Keep local version" }),
    );
    expect(confirm).toHaveBeenLastCalledWith(
      "Keep local version?",
      expect.any(String),
      expect.any(Function),
      { action: "Keep local version", destructive: false },
    );
    expect(r.conflicts()).toHaveLength(1);
    await fireEvent.press(
      view.getByRole("button", { name: "Use cloud version" }),
    );
    expect(confirm).toHaveBeenLastCalledWith(
      "Use cloud version?",
      expect.any(String),
      expect.any(Function),
      { action: "Replace with cloud version" },
    );
  } finally {
    db.close();
  }
});

// Phase 7.8B, M4: both versions and what differs, so the choice isn't blind.
test("a conflict shows this phone's and the cloud's versions, and Use cloud version replaces it", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const j = r.addJournal("measurement", {
      name: "Bodyweight",
      value: 80,
      unit: "kg",
    });
    const op = r.outboxRow(j.id)!;
    r.conflict(
      j.id,
      op.payload,
      JSON.stringify({
        id: j.id,
        kind: "journal",
        payload: { ...j, data: { ...j.data, value: 79 } },
        revision: 2,
        deleted: false,
      }),
      2,
    );
    const view = await render(<Account />);
    await flush();
    const card = within(view.getByTestId("account-conflict"));
    expect(card.getByText("Measurement · Bodyweight")).toBeTruthy();
    expect(card.getByLabelText(/^This phone: Dated .+Changed /)).toBeTruthy();
    expect(card.getByLabelText(/^Cloud: Dated .+Changed /)).toBeTruthy();
    expect(card.getByText("Differs in: Value")).toBeTruthy();
    expect(view.queryByText(new RegExp(j.id))).toBeNull();
    await fireEvent.press(
      card.getByRole("button", { name: "Use cloud version" }),
    );
    // The confirmed choice runs the repository's tested resolution.
    await act(async () => jest.mocked(confirm).mock.calls.at(-1)![2]());
    expect(r.journal()[0]!.data.value).toBe(79);
    expect(r.conflicts()).toHaveLength(0);
    expect(r.outboxRow(j.id)).toBeUndefined();
  } finally {
    db.close();
  }
});

test("a conflict from a newer Forge can't be resolved either way until Forge is updated (M3)", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const w = r.startWorkout("Push day");
    r.addExercise(w.id, "barbell-bench-press");
    r.finishWorkout(w.id);
    const op = r.outboxRow(w.id)!;
    const payload = JSON.parse(op.payload) as {
      exercises: { exerciseId: string }[];
    };
    payload.exercises[0]!.exerciseId = "sled-push-from-a-newer-forge";
    r.conflict(
      w.id,
      op.payload,
      JSON.stringify({
        id: w.id,
        kind: "workout",
        payload,
        revision: 2,
        deleted: false,
      }),
      2,
    );
    const view = await render(<Account />);
    await flush();
    const card = within(view.getByTestId("account-conflict"));
    expect(
      card.getByText(/uses exercises from a newer version of Forge/),
    ).toBeTruthy();
    for (const name of ["Keep local version", "Use cloud version"])
      expect(
        card.getByRole("button", { name }).props.accessibilityState.disabled,
      ).toBe(true);
    expect(r.conflicts()).toHaveLength(1);
  } finally {
    db.close();
  }
});

// Phase 7.8D: the profile's card lists only what the athlete decides; the
// rest merged already.
test("a profile conflict shows only the setting the athlete decides", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    // Synchronized once (the merge base), then changed on both sides.
    r.acknowledge("profile", 1, r.outboxRow("profile")!.payload);
    const remote = { ...r.profileDocument(), name: "Ada A", rest: 120 };
    r.saveProfile({ name: "Ada B", calories: 2600 });
    r.conflict(
      "profile",
      r.outboxRow("profile")!.payload,
      JSON.stringify({
        id: "profile",
        kind: "profile",
        payload: remote,
        revision: 2,
        deleted: false,
      }),
      2,
    );
    const view = await render(<Account />);
    await flush();
    const card = within(view.getByTestId("account-conflict"));
    expect(card.getByText("Your profile")).toBeTruthy();
    expect(card.getByText("Display name: Ada B")).toBeTruthy();
    expect(card.getByText("Display name: Ada A")).toBeTruthy();
    expect(card.getByText("Differs in: Display name")).toBeTruthy();
    expect(card.queryByText(/Calorie goal|Default rest/)).toBeNull();
  } finally {
    db.close();
  }
});

test("a favourite conflict names the exercise and both choices", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    r.toggleFavorite("barbell-bench-press");
    const id = "favorite:barbell-bench-press";
    r.conflict(
      id,
      r.outboxRow(id)!.payload,
      JSON.stringify({
        id,
        kind: "journal",
        payload: {},
        revision: 2,
        deleted: true,
      }),
      2,
    );
    const view = await render(<Account />);
    await flush();
    const card = within(view.getByTestId("account-conflict"));
    expect(
      card.getByText(
        `Favorite exercise · ${r.exercise("barbell-bench-press")!.name}`,
      ),
    ).toBeTruthy();
    expect(card.getByText("Favorite on this phone")).toBeTruthy();
    expect(
      card.getByText("Removed from favorites on another device"),
    ).toBeTruthy();
    for (const name of ["Keep local version", "Use cloud version"])
      expect(
        card.getByRole("button", { name }).props.accessibilityState?.disabled,
      ).not.toBe(true);
  } finally {
    db.close();
  }
});

test("a conflict with a record saved by a newer Forge says why both choices wait", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const w = r.startWorkout("Push day");
    r.addExercise(w.id, "barbell-bench-press");
    r.finishWorkout(w.id);
    const op = r.outboxRow(w.id)!;
    const payload = JSON.parse(op.payload) as { workout: { effort?: number } };
    payload.workout.effort = 8;
    r.conflict(
      w.id,
      op.payload,
      JSON.stringify({
        id: w.id,
        kind: "workout",
        payload,
        revision: 2,
        deleted: false,
      }),
      2,
    );
    const view = await render(<Account />);
    await flush();
    const card = within(view.getByTestId("account-conflict"));
    expect(
      card.getByText(/was saved by a newer version of Forge/),
    ).toBeTruthy();
    for (const name of ["Keep local version", "Use cloud version"])
      expect(
        card.getByRole("button", { name }).props.accessibilityState.disabled,
      ).toBe(true);
  } finally {
    db.close();
  }
});
// Phase 7.8C: the last complete sync, for this phone's owner only.
test("another account's sync history is never shown", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    r.setSetting("cloudOwner", "someone-else");
    recordSyncOutcome(r, "someone-else", "complete", Date.now());
    const view = await render(<Account />);
    await flush();
    expect(view.getByLabelText("Last complete sync: Not yet")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the owner's last complete sync is shown, and a last sync that didn't finish", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    r.setSetting("cloudOwner", "u1");
    const at = Date.now() - 60_000;
    recordSyncOutcome(r, "u1", "complete", at);
    recordSyncOutcome(r, "u1", "stopped", at + 30_000);
    const view = await render(<Account />);
    await flush();
    const facts = within(view.getByTestId("account-sync"));
    expect(
      facts.getByLabelText(/^Last complete sync: (Today|Yesterday), /),
    ).toBeTruthy();
    expect(
      facts.getByText(/^Your last sync \(.+\) stopped before it finished\.$/),
    ).toBeTruthy();
    expect(facts.queryByText(/backed up/i)).toBeNull();
  } finally {
    db.close();
  }
});

test("Delete Forge account opens its own steps, told apart from deleting local data", async () => {
  const { db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const view = await render(<Account />);
    await flush();
    expect(view.queryByLabelText("Delete cloud account")).toBeNull();
    const cloudDelete = view.getByRole("button", {
      name: "Delete Forge account",
    });
    expect(cloudDelete.props.accessibilityHint).toMatch(
      /cloud training, then this phone's training.*export a backup first/,
    );
    expect(
      view.getByRole("button", { name: "Delete all local data" }).props
        .accessibilityHint,
    ).toMatch(/on this phone/);
    await fireEvent.press(cloudDelete);
    // Nothing is asked or deleted here: the steps start on their own screen.
    expect(router.push).toHaveBeenCalledWith("/delete-account");
    expect(confirm).not.toHaveBeenCalled();
    expect((mockCloud.client as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("account deletion states: unconfirmed, didn't go through, and deleted on another device", async () => {
  const { r, db } = setup();
  try {
    r.setSetting("cloudOwner", "u1");
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const mark = (state: string) =>
      r.setSetting(
        "accountDeletion",
        JSON.stringify({ owner: "u1", state, at: 1 }),
      );
    mark("requested");
    let view = await render(<Account />);
    await flush();
    let banner = within(view.getByTestId("account-deletion"));
    expect(
      banner.getByText(/couldn't confirm your account deletion/),
    ).toBeTruthy();
    await fireEvent.press(
      banner.getByRole("button", { name: "Open Delete Forge account" }),
    );
    expect(router.push).toHaveBeenCalledWith("/delete-account");
    await view.unmount();

    mark("notDeleted");
    view = await render(<Account />);
    await flush();
    expect(
      within(view.getByTestId("account-deletion")).getByText(
        /deletion didn't go through/,
      ),
    ).toBeTruthy();
    await view.unmount();

    // Another account's marker is never shown.
    r.setSetting(
      "accountDeletion",
      JSON.stringify({ owner: "someone-else", state: "requested", at: 1 }),
    );
    view = await render(<Account />);
    await flush();
    expect(view.queryByTestId("account-deletion")).toBeNull();
    await view.unmount();

    r.clearSetting("accountDeletion");
    r.setSetting(
      "accountDeleted",
      JSON.stringify({
        owner: "u1",
        at: 1,
        localRemoved: false,
        source: "sync",
      }),
    );
    view = await render(<Account />);
    await flush();
    banner = within(view.getByTestId("account-deletion"));
    expect(banner.getByText(/no longer exists/)).toBeTruthy();
    expect(banner.getByRole("button", { name: "Export backup" })).toBeTruthy();
    // Nothing left to delete in the cloud; this phone's data still can be.
    expect(view.queryByLabelText("Delete Forge account")).toBeNull();
    expect(view.getByLabelText("Delete all local data")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("sync finds the account deleted: said plainly, nothing sent, nothing removed", async () => {
  const { r, db } = setup();
  try {
    r.setSetting("cloudOwner", "u1");
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User not found", 403, "user_not_found"),
    } as never);
    const workouts = r.workouts().length;
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(synchronize).not.toHaveBeenCalled();
    expect(
      within(view.getByTestId("account-status")).getByText(
        /no longer exists, so sync stopped\. Nothing on this phone was removed/,
      ),
    ).toBeTruthy();
    expect(r.workouts().length).toBe(workouts);
    expect(JSON.parse(r.setting("accountDeleted")!)).toMatchObject({
      owner: "u1",
      localRemoved: false,
      source: "sync",
    });
  } finally {
    db.close();
  }
});

test("a sync stopped because the account no longer exists is remembered", async () => {
  const { r, db } = setup();
  try {
    r.setSetting("cloudOwner", "u1");
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    jest.mocked(synchronize).mockResolvedValue({
      uploaded: 0,
      downloaded: 0,
      matched: 0,
      rejected: 0,
      failed: 0,
      held: { update: 0, active: 0 },
      conflicts: 0,
      pending: 2,
      errors: [],
      stopped: "deleted",
    });
    // Still there when sync starts; gone by the time it writes, and the
    // account service then says so.
    auth.getUser
      .mockResolvedValueOnce({
        data: { user: { id: "u1", email: "a@b.co" } },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError("User not found", 403, "user_not_found"),
      } as never);
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(view.getByText(/no longer exists, so sync stopped/)).toBeTruthy();
    expect(JSON.parse(r.setting("accountDeleted")!).source).toBe("sync");
    // Both questions were asked as this account's own sign-in.
    expect(auth.getUser.mock.calls).toEqual([[jwt("u1")], [jwt("u1")]]);
  } finally {
    db.close();
  }
});

test("a sync stop the account service doesn't confirm is never recorded as a deleted account", async () => {
  const { r, db } = setup();
  try {
    r.setSetting("cloudOwner", "u1");
    cloud({ user: { id: "u1", email: "a@b.co" } });
    jest.mocked(synchronize).mockResolvedValue({
      uploaded: 0,
      downloaded: 0,
      matched: 0,
      rejected: 0,
      failed: 0,
      held: { update: 0, active: 0 },
      conflicts: 0,
      pending: 2,
      errors: [],
      stopped: "deleted",
    });
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(synchronize).toHaveBeenCalledTimes(1);
    // The account service still knows the account: nothing is recorded, the
    // delete row stays, and nothing on this phone changes.
    expect(r.setting("accountDeleted")).toBeFalsy();
    expect(view.queryByTestId("account-deletion")).toBeNull();
    expect(view.getByLabelText("Delete Forge account")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("compact screens, large text and light mode", async () => {
  const { db } = setup();
  try {
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<Account />);
    await flush();
    const title = within(view.getByTestId("account-guest")).getByText(
      "Guest mode is active",
    );
    expect(StyleSheet.flatten(title.props.style).color).toBe(
      theme.palettes.light.text,
    );
    for (const label of [
      "Export backup",
      "Import backup",
      "Delete all local data",
    ])
      expect(
        Number(
          StyleSheet.flatten(
            view.getByRole("button", { name: label }).props.style,
          ).minHeight,
        ),
      ).toBeGreaterThanOrEqual(44);
    expect(view.getByText("Free plan")).toBeTruthy();
    expect(view.queryByText(/\$|subscribe|purchase|trial/i)).toBeNull();
  } finally {
    db.close();
  }
});

test("offline: still signed in, said plainly, never the old sign-in form (7.7C)", async () => {
  const { r, db } = setup();
  try {
    const auth = cloud(null);
    // Offline with an expired token, Supabase has no session to give.
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    } as never);
    const signOut = jest.fn(async () => {});
    const view = await render(
      <EntryContext.Provider
        value={{
          entry: {
            kind: "ready",
            user: { id: "u1", email: "a@example.com", methods: ["Google"] },
            offline: true,
          },
          client: mockCloud.client as never,
          finishRecovery: jest.fn(),
          signOut,
        }}
      >
        <Account />
      </EntryContext.Provider>,
    );
    // The signed-in account is there from the first frame.
    expect(view.getByTestId("account-signed-in")).toBeTruthy();
    await flush();
    const me = within(view.getByTestId("account-signed-in"));
    expect(me.getByText("Signed in · offline")).toBeTruthy();
    expect(me.getByText("a@example.com")).toBeTruthy();
    expect(me.getByText("Signs in with Google")).toBeTruthy();
    expect(me.getByText(/You're offline/)).toBeTruthy();
    expect(view.queryByTestId("account-sign-in")).toBeNull();
    expect(view.queryByTestId("account-status")).toBeNull();
    expect(view.queryByText(/Failed to fetch/)).toBeNull();
    // Signing out goes through the gate, which works offline too.
    await fireEvent.press(me.getByRole("button", { name: "Sign out" }));
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(r.profile().onboarded).toBe(true);
  } finally {
    db.close();
  }
});

// ---- Phase 7.8E, Stage 1 ---------------------------------------------------

const lastConfirm = () => {
  const [title, message, run, options] = jest
    .mocked(confirm)
    .mock.calls.at(-1)!;
  return { title, message, run, options };
};

test("Sign out of all devices asks first, ends every sign-in and keeps local data (E3)", async () => {
  const { r, db } = setup();
  try {
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    r.setSetting("cloudOwner", "u1");
    r.startWorkout("Unsynced session");
    const waiting = r.outbox().map((o) => o.id);
    const view = await render(<Account />);
    await flush();
    const me = within(view.getByTestId("account-signed-in"));
    expect(
      me.getByText(
        "Signing out affects only this phone and keeps everything on it.",
      ),
    ).toBeTruthy();
    await fireEvent.press(
      me.getByRole("button", { name: "Sign out of all devices" }),
    );
    const ask = lastConfirm();
    expect(ask.title).toBe("Sign out of all devices?");
    expect(ask.message).toMatch(/every phone and tablet, including this one/);
    expect(ask.message).toMatch(/changes not yet synchronized wait there/);
    expect(ask.options).toEqual({
      action: "Sign out everywhere",
      destructive: false,
    });
    // Nothing happens until it's confirmed.
    expect(auth.signOut).not.toHaveBeenCalled();
    await act(async () => ask.run());
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(
      view.getByText(
        "Signed out on all devices. Your local records remain on this device.",
      ),
    ).toBeTruthy();
    // The training, its owner and every waiting change are untouched.
    expect(r.outbox().map((o) => o.id)).toEqual(waiting);
    expect(r.setting("cloudOwner")).toBe("u1");
    expect(r.workouts()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("offline, Sign out of all devices changes nothing and says why (E3)", async () => {
  const { r, db } = setup();
  try {
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    auth.signOut.mockResolvedValueOnce({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    } as never);
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Sign out of all devices" }),
    );
    await act(async () => lastConfirm().run());
    expect(
      view.getByText(
        "Can't reach Forge's account service. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(view.getByTestId("account-signed-in")).toBeTruthy();
    expect(view.queryByText(/^Signed out/)).toBeNull();
    expect(r.profile().onboarded).toBe(true);
  } finally {
    db.close();
  }
});

test("through the entry gate, each sign-out says which kind it is (E3)", async () => {
  const { db } = setup();
  try {
    cloud(null);
    const signOut = jest.fn(async () => {});
    const view = await render(
      <EntryContext.Provider
        value={{
          entry: {
            kind: "ready",
            user: { id: "u1", email: "a@example.com" },
            offline: false,
          },
          client: mockCloud.client as never,
          finishRecovery: jest.fn(),
          signOut,
        }}
      >
        <Account />
      </EntryContext.Provider>,
    );
    await flush();
    await fireEvent.press(view.getByRole("button", { name: "Sign out" }));
    await flush();
    expect(signOut).toHaveBeenLastCalledWith();
    await fireEvent.press(
      view.getByRole("button", { name: "Sign out of all devices" }),
    );
    await act(async () => lastConfirm().run());
    expect(signOut).toHaveBeenLastCalledWith({ everywhere: true });
    expect(signOut).toHaveBeenCalledTimes(2);
    const auth = (mockCloud.client as { auth: { signOut: jest.Mock } }).auth;
    expect(auth.signOut).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("Delete all local data counts what was never synchronized, before anything is deleted (M6)", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    r.setSetting("cloudOwner", "u1");
    r.addJournal("measurement", { name: "Bodyweight", value: 80, unit: "kg" });
    expect(r.outbox()).toHaveLength(2);
    const view = await render(<Account />);
    await flush();
    const row = view.getByRole("button", { name: "Delete all local data" });
    expect(row.props.accessibilityHint).toMatch(
      /on this phone\. 2 changes haven't been synchronized and would be lost\.$/,
    );
    await fireEvent.press(row);
    const ask = lastConfirm();
    expect(ask.title).toBe("Delete all local data?");
    expect(ask.message).toMatch(
      /2 changes were never synchronized: they exist only on this phone and would be lost for good\./,
    );
    expect(ask.message).toMatch(
      /cloud records are not deleted; a later sync can restore what was synchronized\./,
    );
    // Asking deletes nothing.
    expect(r.outbox()).toHaveLength(2);
    expect(r.journal("measurement")).toHaveLength(1);

    // Once everything is synchronized, there's nothing extra to warn about.
    r.db.run("DELETE FROM outbox");
    await view.rerender(<Account />);
    await flush();
    const synced = view.getByRole("button", { name: "Delete all local data" });
    expect(synced.props.accessibilityHint).not.toMatch(/synchronized/);
    await fireEvent.press(synced);
    expect(lastConfirm().message).not.toMatch(/never synchronized/);
  } finally {
    db.close();
  }
});

test("a reset link that can't be used while signed in is explained plainly (L2)", async () => {
  const { db } = setup();
  try {
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    auth.setSession.mockResolvedValueOnce({
      error: new AuthApiError(
        "Invalid Refresh Token: Refresh Token Not Found",
        400,
        "refresh_token_not_found",
      ),
    } as never);
    mockURL = "forge:///account#access_token=at&refresh_token=rt&type=recovery";
    const view = await render(<Account />);
    await flush();
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(
      view.getByText(
        "That password reset link couldn't be used. It may have expired or already been used. To get a new one, sign out and choose Forgot password.",
      ),
    ).toBeTruthy();
    expect(view.queryByText(/Refresh Token/)).toBeNull();
    expect(view.queryByLabelText("New password")).toBeNull();
  } finally {
    db.close();
  }
});

test("a reset link that fails for want of a connection says so (L2)", async () => {
  const { db } = setup();
  try {
    const auth = cloud({ user: { id: "u1", email: "a@b.co" } });
    auth.setSession.mockResolvedValueOnce({
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    } as never);
    mockURL = "forge:///account#access_token=at&refresh_token=rt&type=recovery";
    const view = await render(<Account />);
    await flush();
    expect(
      view.getByText(
        "Forge couldn't reach its account service to finish the password reset. Check your connection, then sign out and request a new link with Forgot password.",
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});
