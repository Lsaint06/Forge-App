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
  current?: {
    signOut?: (options?: { everywhere?: boolean }) => Promise<void>;
    notice?: string;
    deletion?: string;
    continuation?: { text: string; canReturn: boolean };
  };
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

// ---- Phase 7.8E, Stage 1 (E3, L2) ------------------------------------------

const notices = () => jest.requireActual("../../src/auth/session");

test("an ordinary sign-out ends only this phone's sign-in and keeps everything here (E3)", async () => {
  const c = cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout("Not yet synchronized");
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const waiting = mockRepo.r.outbox().map((o) => o.id);
  expect(waiting.length).toBeGreaterThan(0);
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await act(async () => mockCtx.current!.signOut!());
  expect(c.auth.signOut).toHaveBeenCalledTimes(1);
  expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.notice).toBeUndefined();
  // The training, its owner and every waiting change stay.
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.outbox().map((o) => o.id)).toEqual(waiting);
  expect(mockRepo.r.workouts()).toHaveLength(1);
  expect(synchronize).not.toHaveBeenCalled();
});

test("signing out of all devices ends every sign-in and says what happens next (E3)", async () => {
  const c = cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout("Not yet synchronized");
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const waiting = mockRepo.r.outbox().map((o) => o.id);
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await act(async () => mockCtx.current!.signOut!({ everywhere: true }));
  expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.notice).toBe(notices().ALL_DEVICES_SIGN_OUT_NOTICE);
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.outbox().map((o) => o.id)).toEqual(waiting);
  expect(mockRepo.r.workouts()).toHaveLength(1);
  // Signing in again brings back the same training.
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("ready");
  expect(mockCtx.current!.notice).toBeUndefined();
});

test("offline, signing out of all devices changes nothing and is reported (E3)", async () => {
  const c = cloud(offlineSession);
  mockStored = JSON.stringify({ user: me });
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  c.auth.signOut.mockResolvedValueOnce({
    error: new AuthRetryableFetchError("Failed to fetch", 0),
  });
  await act(async () => {
    await expect(
      mockCtx.current!.signOut!({ everywhere: true }),
    ).rejects.toBeTruthy();
  });
  expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  // Other devices couldn't be signed out, so this one stays signed in too.
  expect(await kind(view)).toBe("ready");
  expect(storage().removeItem).not.toHaveBeenCalled();
  expect(mockCtx.current!.notice).toBeUndefined();
  expect(owner()).toBe("user-a");
});

test("a reset link whose sign-in can't start is explained on Welcome (L2)", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  c.auth.setSession.mockResolvedValueOnce({
    data: { session: null },
    error: new AuthApiError(
      "Invalid Refresh Token: Refresh Token Not Found",
      400,
      "refresh_token_not_found",
    ),
  } as never);
  mockURL = "forge://account#access_token=at4&refresh_token=rt4&type=recovery";
  const view = await root();
  await waitFor(() =>
    expect(mockCtx.current!.notice).toBe(notices().RESET_LINK_FAILED_NOTICE),
  );
  expect(c.auth.setSession).toHaveBeenCalledTimes(1);
  expect(await kind(view)).toBe("signedOut");
});

test("a reset link that fails for want of a connection says so on Welcome (L2)", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  c.auth.setSession.mockResolvedValueOnce({
    data: { session: null },
    error: new AuthRetryableFetchError("Failed to fetch", 0),
  } as never);
  mockURL = "forge://account#access_token=at5&refresh_token=rt5&type=recovery";
  const view = await root();
  await waitFor(() =>
    expect(mockCtx.current!.notice).toBe(notices().RESET_LINK_OFFLINE_NOTICE),
  );
  expect(await kind(view)).toBe("signedOut");
  // A real session clears the notice.
  await c.emit("SIGNED_IN", { user: me });
  expect(mockCtx.current!.notice).toBeUndefined();
});

// ---- Phase 7.8E, Stage 2: account deletion ----------------------------------

const text = () =>
  jest.requireActual("../../src/domain/presentation/account") as {
    DELETED_HERE_TEXT: string;
    DELETION_UNCONFIRMED_SIGNED_OUT: string;
  };
const routes = (view: Awaited<ReturnType<typeof render>>) =>
  view.getByTestId("routes").props.children as string;
function athleteWithTraining() {
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.startWorkout("Mine");
  mockRepo.r.setSetting("cloudOwner", "user-a");
}
const markDeletion = (state: string, owner = "user-a") =>
  mockRepo.r.setSetting(
    "accountDeletion",
    JSON.stringify({ owner, state, at: 1 }),
  );
const markerState = () =>
  JSON.parse(mockRepo.r.setting("accountDeletion") ?? "null")?.state;

test("a deletion confirmed before Forge closed is finished at launch, offline-safe; Welcome says so", async () => {
  const c = cloud();
  athleteWithTraining();
  markDeletion("deleted");
  const view = await root();
  await waitFor(() => expect(routes(view)).toBe("signedOut"));
  expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mockRepo.r.workouts()).toHaveLength(0);
  expect(owner()).toBeUndefined();
  expect(markerState()).toBeUndefined();
  expect(mockCtx.current!.deletion).toBe(text().DELETED_HERE_TEXT);
  expect(mockCtx.current!.notice).toBeUndefined();
  // Nothing is left here, so nothing is said about a saved workout.
  expect(mockCtx.current!.continuation).toBeUndefined();
});

/** A Supabase-shaped access token naming `sub` (never verified in tests). */
const jwt = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;
/** The owner's stored sign-in, with its token (as Supabase stores it). */
const ownSession = async () => ({
  data: { session: { user: me, access_token: jwt("user-a") } },
  error: null,
});

test("an unconfirmed deletion found gone at launch: nothing removed unseen; kept for export, still signed in", async () => {
  const c = cloud(ownSession);
  const getUser = jest.fn(async () => ({
    data: { user: null },
    error: new AuthApiError(
      "User from sub claim in JWT does not exist",
      403,
      "user_not_found",
    ),
  }));
  Object.assign(c.auth, { getUser });
  athleteWithTraining();
  markDeletion("requested");
  const view = await root();
  await waitFor(() =>
    expect(mockRepo.r.setting("accountDeleted")).toBeTruthy(),
  );
  // Asked as the owner's own sign-in, and only that.
  expect(getUser).toHaveBeenCalledWith(jwt("user-a"));
  expect(routes(view)).toBe("ready");
  expect(c.auth.signOut).not.toHaveBeenCalled();
  expect(mockRepo.r.workouts()).toHaveLength(1);
  expect(owner()).toBe("user-a");
  expect(markerState()).toBeUndefined();
  expect(JSON.parse(mockRepo.r.setting("accountDeleted")!)).toMatchObject({
    owner: "user-a",
    localRemoved: false,
  });
});

test("an unconfirmed deletion, checked at launch: the account still exists, nothing removed", async () => {
  const c = cloud(ownSession);
  const getUser = jest.fn(async () => ({ data: { user: me }, error: null }));
  Object.assign(c.auth, { getUser });
  athleteWithTraining();
  markDeletion("requested");
  const view = await root();
  await waitFor(() => expect(markerState()).toBe("notDeleted"));
  expect(routes(view)).toBe("ready");
  expect(mockRepo.r.workouts()).toHaveLength(1);
  expect(c.auth.signOut).not.toHaveBeenCalled();
});

test("another account signed in, then signed out: an unconfirmed deletion is left alone, and said plainly", async () => {
  const c = cloud(async () => ({
    data: { session: { user: { id: "user-b", email: "b@example.com" } } },
    error: null,
  }));
  const getUser = jest.fn();
  Object.assign(c.auth, { getUser });
  athleteWithTraining();
  markDeletion("requested");
  const view = await root();
  expect(await kind(view)).toBe("otherAccount");
  await act(async () => {});
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.deletion).toBe(
    text().DELETION_UNCONFIRMED_SIGNED_OUT,
  );
  expect(getUser).not.toHaveBeenCalled();
  expect(markerState()).toBe("requested");
  expect(mockRepo.r.workouts()).toHaveLength(1);
  expect(owner()).toBe("user-a");
});

test("after a deletion, a new sign-in (even the same email) starts setup on the empty phone; the notice ends", async () => {
  const c = cloud(async () => ({ data: { session: null }, error: null }));
  mockRepo.r.setSetting(
    "accountDeleted",
    JSON.stringify({
      owner: "user-a",
      at: 1,
      localRemoved: true,
      source: "this-phone",
    }),
  );
  const view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.deletion).toBe(text().DELETED_HERE_TEXT);
  await c.emit("SIGNED_IN", {
    user: { id: "user-new", email: "a@example.com" },
  });
  expect(await kind(view)).toBe("setup");
  await waitFor(() => expect(owner()).toBe("user-new"));
  expect(mockRepo.r.setting("accountDeleted")).toBeFalsy();
});

// ---- Phase 7.8E, Stage 4: signed out without asking, mid-workout ----------

const stage4 = () =>
  jest.requireActual("../../src/domain/presentation/account") as {
    WORKOUT_CONTINUES_TEXT: string;
    WORKOUT_FINISHED_SIGNED_OUT_TEXT: string;
  };
const { SESSION_ENDED_NOTICE } = jest.requireActual("../../src/auth/session");
const endedMarker = () =>
  JSON.parse(mockRepo.r.setting("sessionEnded") ?? "null") as {
    owner: string;
    workout: string;
  } | null;
/** A's phone, set up, with A's workout in progress. */
function midWorkout(owner = "user-a") {
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", owner);
  return mockRepo.r.startWorkout("Push day");
}

test("the sign-in ends without asking mid-workout: the workout continues, said plainly, nothing syncs", async () => {
  const c = cloud();
  const w = midWorkout();
  const view = await root();
  expect(await kind(view)).toBe("ready");
  // The account service ends it (a refresh that failed for good).
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("continuing");
  await waitFor(() =>
    expect(endedMarker()).toMatchObject({ owner: "user-a", workout: w.id }),
  );
  expect(mockCtx.current!.notice).toBe(SESSION_ENDED_NOTICE);
  expect(mockCtx.current!.continuation).toEqual({
    text: stage4().WORKOUT_CONTINUES_TEXT,
    canReturn: true,
  });
  expect(mockRepo.r.active()?.id).toBe(w.id);
  expect(owner()).toBe("user-a");
  expect(synchronize).not.toHaveBeenCalled();
  // Finished while signed out: its summary stays open, then Welcome says so.
  await act(async () => {
    mockRepo.r.finishWorkout(w.id);
  });
  await touch();
  expect(await kind(view)).toBe("continuing");
  expect(mockCtx.current!.continuation).toEqual({
    text: stage4().WORKOUT_FINISHED_SIGNED_OUT_TEXT,
    canReturn: false,
  });
  // Back with the same account: everything as it was, the marker gone.
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("ready");
  await waitFor(() => expect(endedMarker()).toBeNull());
  expect(mockRepo.r.workouts()).toHaveLength(1);
});

test("a sign-out the athlete asks for never continues the workout", async () => {
  cloud();
  midWorkout();
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await act(async () => mockCtx.current!.signOut!());
  expect(await kind(view)).toBe("signedOut");
  expect(endedMarker()).toBeNull();
  expect(mockCtx.current!.notice).toBeUndefined();
  expect(mockCtx.current!.continuation).toBeUndefined();
  // The workout is kept for the next sign-in.
  expect(mockRepo.r.active()).toBeTruthy();
});

test("ended without asking but nothing in progress: Welcome says so, nothing continues", async () => {
  const c = cloud();
  mockRepo.r.saveProfile({ onboarded: true });
  mockRepo.r.setSetting("cloudOwner", "user-a");
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.notice).toBe(SESSION_ENDED_NOTICE);
  expect(endedMarker()).toBeNull();
});

test("another account's workout never continues for the account whose sign-in ended", async () => {
  const c = cloud();
  midWorkout("user-b");
  const view = await root();
  expect(await kind(view)).toBe("otherAccount");
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  expect(endedMarker()).toBeNull();
  expect(owner()).toBe("user-b");
});

test("after a restart: the same workout continues within 12 hours, and only that one", async () => {
  const signedOut = async () => ({ data: { session: null }, error: null });
  const w = midWorkout();
  const mark = (workout: string, at: number) =>
    mockRepo.r.setSetting(
      "sessionEnded",
      JSON.stringify({ owner: "user-a", workout, at }),
    );
  mark(w.id, Date.now() - 60_000);
  cloud(signedOut);
  let view = await root();
  expect(await kind(view)).toBe("continuing");
  expect(mockCtx.current!.continuation?.canReturn).toBe(true);
  await view.unmount();
  // Too long ago, or another workout: signed out like any other time.
  for (const [workout, at] of [
    [w.id, Date.now() - 13 * 3600_000],
    ["another-workout", Date.now() - 60_000],
  ] as const) {
    mark(workout, at);
    cloud(signedOut);
    view = await root();
    expect(await kind(view)).toBe("signedOut");
    await view.unmount();
  }
});

test("repeated changes of account keep the workout its owner's: another sign-in ends the continuation", async () => {
  const c = cloud();
  const w = midWorkout();
  const view = await root();
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("continuing");
  await waitFor(() => expect(endedMarker()).not.toBeNull());
  // Someone else signs in: A's training stays locked, and the marker ends.
  await c.emit("SIGNED_IN", { user: { id: "user-b", email: "b@example.com" } });
  expect(await kind(view)).toBe("otherAccount");
  await waitFor(() => expect(endedMarker()).toBeNull());
  // And their sign-in ending never reopens A's workout.
  await c.emit("SIGNED_OUT", null);
  expect(await kind(view)).toBe("signedOut");
  expect(owner()).toBe("user-a");
  expect(mockRepo.r.active()?.id).toBe(w.id);
  // A again: everything as it was.
  await c.emit("SIGNED_IN", { user: me });
  expect(await kind(view)).toBe("ready");
});

test("Welcome mentions a saved workout only when there is one: not on a new phone, unowned training, or once it's discarded", async () => {
  const signedOut = async () => ({ data: { session: null }, error: null });
  // A new phone: no owner, no marker.
  cloud(signedOut);
  let view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.continuation).toBeUndefined();
  await view.unmount();
  // Training from before accounts, owned by nobody.
  mockRepo.r.saveProfile({ onboarded: true });
  const unowned = mockRepo.r.startWorkout("Unowned");
  cloud(signedOut);
  view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.continuation).toBeUndefined();
  await view.unmount();
  mockRepo.r.deleteWorkout(unowned.id);
  // A's continued workout, its 12 hours over: still saved here, and said so.
  const w = midWorkout();
  mockRepo.r.setSetting(
    "sessionEnded",
    JSON.stringify({
      owner: "user-a",
      workout: w.id,
      at: Date.now() - 13 * 3600_000,
    }),
  );
  cloud(signedOut);
  view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.continuation).toEqual({
    text: stage4().WORKOUT_FINISHED_SIGNED_OUT_TEXT,
    canReturn: false,
  });
  await view.unmount();
  // A marker naming another account says nothing about A's workout.
  mockRepo.r.setSetting(
    "sessionEnded",
    JSON.stringify({ owner: "user-b", workout: w.id, at: Date.now() }),
  );
  cloud(signedOut);
  view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.continuation).toBeUndefined();
  await view.unmount();
  // Discarded: nothing is saved, so nothing is said.
  mockRepo.r.setSetting(
    "sessionEnded",
    JSON.stringify({ owner: "user-a", workout: w.id, at: Date.now() }),
  );
  mockRepo.r.deleteWorkout(w.id);
  cloud(signedOut);
  view = await root();
  expect(await kind(view)).toBe("signedOut");
  expect(mockCtx.current!.continuation).toBeUndefined();
  await view.unmount();
});

test("signing out of all devices from this phone, mid-workout, never continues it here", async () => {
  const c = cloud();
  const w = midWorkout();
  const view = await root();
  expect(await kind(view)).toBe("ready");
  await act(async () => mockCtx.current!.signOut!({ everywhere: true }));
  expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(await kind(view)).toBe("signedOut");
  expect(endedMarker()).toBeNull();
  expect(mockCtx.current!.notice).not.toBe(SESSION_ENDED_NOTICE);
  expect(mockCtx.current!.continuation).toBeUndefined();
  // Kept for the next sign-in, as with any sign-out.
  expect(mockRepo.r.active()?.id).toBe(w.id);
  expect(owner()).toBe("user-a");
});
