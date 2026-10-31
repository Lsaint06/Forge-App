import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import Account from "../../app/account";
import { useRepo, confirm } from "../../src/state";
import { synchronize } from "../../src/cloud/sync";
import { pathRepository } from "../path-fixture";
import { theme } from "../../src/theme";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
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

function cloud(session: Session) {
  const auth = {
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
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

test("signed out: the existing sign-in flow, password hidden, nothing uploaded", async () => {
  const { r, db } = setup();
  try {
    const auth = cloud(null);
    const view = await render(<Account />);
    await flush();
    const form = within(view.getByTestId("account-sign-in"));
    expect(form.getByText("Not signed in")).toBeTruthy();
    expect(form.getByRole("tab", { name: "Create account" })).toBeTruthy();
    expect(form.getByLabelText("Password").props.secureTextEntry).toBe(true);
    // Validation is the existing one.
    await fireEvent.press(form.getByRole("button", { name: "Sign in" }));
    await flush();
    expect(view.getByText("Enter your email and password")).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    await fireEvent.changeText(
      form.getByLabelText("Email"),
      "  alex@example.com ",
    );
    await fireEvent.changeText(form.getByLabelText("Password"), "secret-pass");
    await fireEvent.press(form.getByRole("button", { name: "Sign in" }));
    await flush();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "alex@example.com",
      password: "secret-pass",
    });
    expect(
      view.getByText("Signed in. Synchronization remains opt-in."),
    ).toBeTruthy();
    // Cloud sync explains that signing in comes first; local changes wait.
    const sync = within(view.getByTestId("account-sync"));
    expect(
      sync.getByLabelText(
        `On this phone: ${r.outbox().length} ${r.outbox().length === 1 ? "change" : "changes"} waiting to upload`,
      ),
    ).toBeTruthy();
    expect(sync.getByText(/Sign in above to synchronize/)).toBeTruthy();
    expect(view.queryByRole("button", { name: "Synchronize now" })).toBeNull();
    expect(synchronize).not.toHaveBeenCalled();
    // Reset password asks only for the email.
    await fireEvent.press(form.getByRole("tab", { name: "Reset password" }));
    expect(form.queryByLabelText("Password")).toBeNull();
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
    // Deleting the cloud account waits while sync runs.
    expect(
      view.getByRole("button", { name: "Delete cloud account" }).props
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
    // Signing out keeps local data.
    await fireEvent.press(me.getByRole("button", { name: "Sign out" }));
    await flush();
    expect(auth.signOut).toHaveBeenCalled();
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

test("deleting the cloud account asks first and is told apart from local data", async () => {
  const { db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    const view = await render(<Account />);
    await flush();
    const cloudDelete = view.getByRole("button", {
      name: "Delete cloud account",
    });
    expect(cloudDelete.props.accessibilityHint).toMatch(
      /Data on this phone stays/,
    );
    expect(
      view.getByRole("button", { name: "Delete all local data" }).props
        .accessibilityHint,
    ).toMatch(/on this phone/);
    await fireEvent.press(cloudDelete);
    expect(confirm).toHaveBeenLastCalledWith(
      "Delete account permanently?",
      expect.stringContaining("Records on this phone stay"),
      expect.any(Function),
      { action: "Delete account" },
    );
    expect((mockCloud.client as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
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
