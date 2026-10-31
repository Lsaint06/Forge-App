import React from "react";
import { render, act, waitFor } from "@testing-library/react-native";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { finishIntro } from "../../src/components/splash/session";
import { synchronize } from "../../src/cloud/sync";
import { pathRepository } from "../path-fixture";

// Phase 7.7B: the real root layout deciding the entry state from the
// (mocked) Supabase session and this phone's real SQLite data. The route
// stack is replaced by its entry kind; tests/ui/entry-routing.test.tsx
// covers what each kind may show.

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock("expo-router", () => ({}));
jest.mock("../../src/fonts", () => ({ loadBrandFonts: jest.fn() }));
// The route stack shows its entry kind and exposes what the entry screens
// receive (sign-out, notice).
const mockCtx: {
  current?: { signOut?: () => Promise<void>; notice?: string };
} = {};
jest.mock("../../src/auth/AppStack", () => {
  const ReactActual = jest.requireActual("react");
  const { Text: T } = jest.requireActual("react-native");
  const { EntryContext } = jest.requireActual("../../src/auth/session");
  return {
    AppStack: ({ entry }: { entry: string }) => {
      mockCtx.current = ReactActual.useContext(EntryContext);
      return <T testID="routes">{entry}</T>;
    },
  };
});
// The real app state, over a real SQLite repository.
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
let mockRepo: ReturnType<typeof pathRepository>;
jest.mock("../../src/data/native", () => ({
  initializeRepository: async () => {},
  repository: () => mockRepo.r,
}));
let mockClient: unknown = null;
jest.mock("../../src/cloud/client", () => ({
  cloudClient: () => mockClient,
}));
jest.mock("../../src/cloud/sync", () => ({ synchronize: jest.fn() }));
let mockURL: string | null = null;
jest.mock("expo-linking", () => ({
  useURL: () => mockURL,
  createURL: (p: string) => `forge://${p.replace(/^\//, "")}`,
}));
let mockStored: string | null = null;
jest.mock("../../src/platform/sessionStorage", () => ({
  sessionStorage: {
    getItem: jest.fn(async () => mockStored),
    removeItem: jest.fn(async () => {
      mockStored = null;
    }),
  },
}));

type Listener = (event: string, session: unknown) => void;
const me = { id: "user-a", email: "a@example.com" };
function cloud(
  getSession: () => Promise<unknown> = async () => ({
    data: { session: { user: me } },
    error: null,
  }),
) {
  let listener: Listener = () => {};
  const auth = {
    getSession: jest.fn(getSession),
    onAuthStateChange: jest.fn((fn: Listener) => {
      listener = fn;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    setSession: jest.fn(async () => ({
      data: { session: { user: me } },
      error: null,
    })),
    // Online, Supabase ends the session and announces it.
    signOut: jest.fn(async (): Promise<{ error: unknown }> => {
      listener("SIGNED_OUT", null);
      return { error: null };
    }),
  };
  mockClient = { auth };
  return {
    auth,
    emit: (event: string, session: unknown) =>
      act(async () => listener(event, session)),
  };
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://forgeproj.supabase.co";
  // The intro is covered by splash.test.tsx.
  finishIntro();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockRepo = pathRepository();
  mockClient = null;
  mockURL = null;
  mockStored = null;
});
afterEach(() => mockRepo.db.close());

async function root() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Root = require("../../app/_layout").default;
  const view = await render(<Root />);
  return view;
}
const kind = (view: Awaited<ReturnType<typeof render>>) =>
  waitFor(() => view.getByTestId("routes").props.children as string);
const owner = () => mockRepo.r.setting("cloudOwner") || undefined;
const touch = () =>
  act(async () =>
    jest.requireActual("../../src/state").useApp.getState().touch(),
  );

test("a build without an account service never opens training", async () => {
  const view = await root();
  expect(await kind(view)).toBe("unconfigured");
});

test("nothing is shown while the session is restored", async () => {
  cloud(() => new Promise(() => {}));
  const view = await root();
  await act(async () => {});
  expect(view.queryByTestId("routes")).toBeNull();
});

test("signed out: Welcome, and this phone's data is left alone", async () => {
  cloud(async () => ({ data: { session: null }, error: null }));
  mockRepo.r.saveProfile({ onboarded: true });
  const view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(owner()).toBeUndefined();
});

test("a new athlete on an empty phone: setup claims it, then Home", async () => {
  cloud();
  const view = await root();
  expect(await kind(view)).toBe("setup");
  await waitFor(() => expect(owner()).toBe("user-a"));
  // Finishing onboarding is the athlete's own profile, never "unlinked".
  mockRepo.r.saveProfile({ onboarded: true });
  await touch();
  expect(await kind(view)).toBe("ready");
  expect(synchronize).not.toHaveBeenCalled();
});

test("a returning athlete opens straight into training", async () => {
  cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
});

test("training from before accounts waits for an explicit link", async () => {
  cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout();
  const view = await root();
  expect(await kind(view)).toBe("unlinked");
  await act(async () => {});
  expect(owner()).toBeUndefined();
  expect(mockRepo.r.workouts()).toHaveLength(1);
});

test("another account's training is never shown", async () => {
  cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-b");
  const view = await root();
  expect(await kind(view)).toBe("otherAccount");
  expect(owner()).toBe("user-b");
});

test("offline with an expired token: the stored session keeps training open", async () => {
  cloud(async () => ({
    data: { session: null },
    error: new AuthRetryableFetchError("Failed to fetch", 0),
  }));
  mockStored = JSON.stringify({ user: me, access_token: "expired" });
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  const storage = jest.requireMock("../../src/platform/sessionStorage");
  expect(storage.sessionStorage.getItem).toHaveBeenCalledWith(
    "sb-forgeproj-auth-token",
  );
});

test("a rejected session is signed out, never offline", async () => {
  cloud(async () => ({
    data: { session: null },
    error: new Error("Invalid Refresh Token"),
  }));
  mockStored = JSON.stringify({ user: me });
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("signedOut");
});

test("sign-in, password recovery and sign-out follow the account service", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("signedOut");
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("ready");
  await c.emit("PASSWORD_RECOVERY", { user: me });
  expect(await kind(view)).toBe("recovery");
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  // Signing out never deletes or unlinks this phone's training.
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.profile().onboarded).toBe(true);
});

test("a reset link opened while signed out asks for a new password", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  mockURL = "forge://account#access_token=at&refresh_token=rt&type=recovery";
  const view = await root();
  await waitFor(() =>
    expect(c.auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    }),
  );
  expect(await kind(view)).toBe("recovery");
});

test("a reset link is handled once: signing out never replays it", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  // setSession announces SIGNED_IN before it resolves, as auth-js does.
  c.auth.setSession.mockImplementation(async () => {
    await c.emit("SIGNED_IN", { user: me });
    return { data: { session: { user: me } }, error: null };
  });
  mockURL = "forge://account#access_token=at2&refresh_token=rt2&type=recovery";
  const seen: string[] = [];
  const view = await root();
  await waitFor(() => {
    const k = view.getByTestId("routes").props.children as string;
    if (seen.at(-1) !== k) seen.push(k);
    expect(k).toBe("recovery");
  });
  // Never setup or Home on the way to a new password.
  expect(seen).not.toContain("setup");
  expect(seen).not.toContain("ready");
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  await act(async () => {});
  expect(c.auth.setSession).toHaveBeenCalledTimes(1);
  expect(await kind(view)).toBe("signedOut");
});

test("a reset link that arrives while signed in is left to the Account screen", async () => {
  const c = cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  mockURL = "forge://account#access_token=at3&refresh_token=rt3&type=recovery";
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  await act(async () => {});
  expect(c.auth.setSession).not.toHaveBeenCalled();
});

// Phase 7.7B.1 (D1): Supabase links a Google or Apple identity to the
// account with the same verified email. The session is that same account;
// Forge never merges, uploads, downloads or reassigns training because of it.
test("a provider linked by email opens the same account's training, unchanged", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  mockRepo.r.saveProfile({ onboarded: true });
  const w = mockRepo.r.startWorkout("Mine");
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const outbox = mockRepo.r.outbox().map((o) => o.id);
  const view = await root();
  expect(await kind(view)).toBe("signedOut");
  await c.emit("SIGNED_IN", {
    user: {
      ...me,
      app_metadata: { provider: "email", providers: ["email", "google"] },
    },
  });
  expect(await kind(view)).toBe("ready");
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.workouts().map((x) => x.id)).toEqual([w.id]);
  expect(mockRepo.r.outbox().map((o) => o.id)).toEqual(outbox);
  expect(synchronize).not.toHaveBeenCalled();
});

test("a provider account that isn't this phone's owner never sees its training", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  await c.emit("SIGNED_IN", {
    user: {
      id: "user-g",
      email: "private@privaterelay.appleid.com",
      app_metadata: { provider: "apple", providers: ["apple"] },
    },
  });
  expect(await kind(view)).toBe("otherAccount");
  expect(owner()).toBe("user-a");
  expect(synchronize).not.toHaveBeenCalled();
});

test("a new athlete through a provider, on an empty phone, goes to setup", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  const view = await root();
  await c.emit("SIGNED_IN", {
    user: { id: "user-n", email: "n@example.com" },
  });
  expect(await kind(view)).toBe("setup");
  await waitFor(() => expect(owner()).toBe("user-n"));
  expect(synchronize).not.toHaveBeenCalled();
});

// ---- Phase 7.7C ------------------------------------------------------------

const storage = () =>
  jest.requireMock("../../src/platform/sessionStorage").sessionStorage;
const offlineSession = async () => ({
  data: { session: null },
  error: new AuthRetryableFetchError("Failed to fetch", 0),
});

test("offline sign-out removes the stored session here, keeps the training, and says so (P5)", async () => {
  const c = cloud(offlineSession);
  mockStored = JSON.stringify({ user: me });
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout("Mine");
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  // Offline with an expired token, Supabase can't sign out and keeps it.
  c.auth.signOut.mockResolvedValueOnce({
    error: new AuthRetryableFetchError("Failed to fetch", 0),
  });
  await act(async () => mockCtx.current!.signOut!());
  expect(await kind(view)).toBe("signedOut");
  expect(storage().removeItem).toHaveBeenCalledWith("sb-forgeproj-auth-token");
  const { OFFLINE_SIGN_OUT_NOTICE } = jest.requireActual(
    "../../src/auth/session",
  );
  expect(mockCtx.current!.notice).toBe(OFFLINE_SIGN_OUT_NOTICE);
  // The training and its owner are exactly as they were.
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.workouts()).toHaveLength(1);
  expect(synchronize).not.toHaveBeenCalled();
  await view.unmount();

  // Restarting while still offline: the stored session is gone.
  cloud(offlineSession);
  const again = await root();
  expect(await kind(again)).toBe("signedOut");
  await again.unmount();
});

test("after an offline sign-out, the same account returns to its training; another is blocked", async () => {
  const c = cloud(offlineSession);
  mockStored = JSON.stringify({ user: me });
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout("Mine");
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  c.auth.signOut.mockResolvedValueOnce({
    error: new AuthRetryableFetchError("Failed to fetch", 0),
  });
  await act(async () => mockCtx.current!.signOut!());
  expect(await kind(view)).toBe("signedOut");
  // Ownership is checked again at the next sign-in.
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("ready");
  expect(mockCtx.current!.notice).toBeUndefined();
  await c.emit("SIGNED_OUT", null);
  await c.emit("SIGNED_IN", { user: { id: "user-b", email: "b@example.com" } });
  expect(await kind(view)).toBe("otherAccount");
  expect(owner()).toBe("user-a");
});

test("online sign-out ends the session normally, with no offline notice", async () => {
  cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await act(async () => mockCtx.current!.signOut!());
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.notice).toBeUndefined();
  expect(storage().removeItem).not.toHaveBeenCalled();
});

test("a sign-out the account service refuses is reported, and nothing changes", async () => {
  const c = cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  c.auth.signOut.mockResolvedValueOnce({
    error: new AuthApiError("Unexpected failure", 500, "unexpected_failure"),
  });
  await act(async () => {
    await expect(mockCtx.current!.signOut!()).rejects.toBeTruthy();
  });
  expect(await kind(view)).toBe("ready");
  expect(storage().removeItem).not.toHaveBeenCalled();
});

test("an accidental sign-in on an empty phone doesn't lock it to that account (P4)", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  const view = await root();
  await c.emit("SIGNED_IN", { user: { id: "user-x", email: "x@example.com" } });
  expect(await kind(view)).toBe("setup");
  await waitFor(() => expect(owner()).toBe("user-x"));
  // Not you? Sign out, before entering anything.
  await c.emit("SIGNED_OUT", null);
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("setup");
  await waitFor(() => expect(owner()).toBe("user-a"));
});

test("once anything was entered for that account, the phone stays protected", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  const view = await root();
  await c.emit("SIGNED_IN", { user: { id: "user-x", email: "x@example.com" } });
  await waitFor(() => expect(owner()).toBe("user-x"));
  mockRepo.r.saveProfile({ name: "Draft for x" });
  await touch();
  await c.emit("SIGNED_OUT", null);
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("otherAccount");
  expect(owner()).toBe("user-x");
  expect(mockRepo.r.profile().name).toBe("Draft for x");
});

test("the owner's sign-in is remembered, masked, for the conflict screen (P2)", async () => {
  cloud(async () => ({
    data: {
      session: {
        user: {
          ...me,
          app_metadata: { provider: "email", providers: ["email", "google"] },
        },
      },
    },
    error: null,
  }));
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await waitFor(() =>
    expect(JSON.parse(mockRepo.r.setting("cloudOwnerHint")!)).toEqual({
      owner: "user-a",
      email: "a•••@example.com",
      methods: ["Email", "Google"],
    }),
  );
  expect(mockRepo.r.setting("cloudOwnerHint")).not.toContain("a@example.com");
});
