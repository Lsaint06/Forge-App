import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import Account from "../../app/account";
import { useRepo, confirm } from "../../src/state";
import { synchronize } from "../../src/cloud/sync";
import { pathRepository } from "../path-fixture";
import { theme } from "../../src/theme";

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
        conflicts: 0,
        pending: 0,
        errors: [],
      }),
    );
    expect(
      view.getByText("3 uploaded · 1 downloaded · 0 pending · 0 conflicts"),
    ).toBeTruthy();
    // Log out keeps local data.
    await fireEvent.press(me.getByRole("button", { name: "Log out" }));
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

test("a failed sync says so, and pending changes are kept", async () => {
  const { r, db } = setup();
  try {
    cloud({ user: { id: "u1", email: "a@b.co" } });
    jest
      .mocked(synchronize)
      .mockRejectedValueOnce(new Error("Network request failed"));
    const pending = r.outbox().length;
    const view = await render(<Account />);
    await flush();
    await fireEvent.press(
      view.getByRole("button", { name: "Synchronize now" }),
    );
    await flush();
    expect(view.getByText("Network request failed")).toBeTruthy();
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
