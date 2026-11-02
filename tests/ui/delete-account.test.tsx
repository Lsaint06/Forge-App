import React from "react";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import { AuthApiError } from "@supabase/supabase-js";
import { router } from "expo-router";
import DeleteAccount from "../../src/screens/you/DeleteAccount";
import { useRepo, confirm } from "../../src/state";
import { EntryContext } from "../../src/auth/session";
import type { AuthUser } from "../../src/auth/entry";
import { ReauthError } from "../../src/auth/reauth";
import { noteAccountGone } from "../../src/auth/account-deletion";
import { reauthWithGoogle } from "../../src/auth/social";
import { saveBackupToFolder, shareBackup } from "../../src/platform/backup";
import { cancelAllNotifications } from "../../src/notifications";
import { Alert } from "../../src/platform/alert";
import { dataOwner, localSummary } from "../../src/data/ownership";
import { pathRepository } from "../path-fixture";

// Phase 7.8E, Stage 2: Delete Forge account. A real repository, the real
// deletion engine and a simulated account service: what each step says, and
// that nothing is removed before the account service confirms the deletion.
// The live Supabase project is never involved.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));
jest.mock("../../src/notifications", () => ({
  cancelAllNotifications: jest.fn(async () => {}),
}));
jest.mock("../../src/platform/backup", () => {
  const { recordBackup, recordShare } = jest.requireActual(
    "../../src/data/backup",
  );
  return {
    shareBackup: jest.fn(async (r: unknown) => recordShare(r)),
    saveBackupToFolder: jest.fn(async (r: unknown) => {
      recordBackup(r);
      return { saved: true, folder: "Downloads" };
    }),
    canSaveToFolder: jest.fn(() => true),
    pickBackup: jest.fn(async () => null),
  };
});
const mockSocial = { apple: false, google: false };
jest.mock("../../src/auth/social", () => ({
  ...jest.requireActual("../../src/auth/social"),
  useSocialOptions: () => mockSocial,
  reauthWithGoogle: jest.fn(),
}));
let mockClient: ReturnType<typeof service> | null = null;
jest.mock("../../src/cloud/client", () => ({
  cloudClient: () => mockClient,
  verifierClient: () => mockClient?.verifier,
  // Requests pinned to one sign-in's token (the deletion request).
  tokenClient: (token: string) => mockClient?.asToken(token),
}));

const ME = "user-a";
const me: AuthUser = { id: ME, email: "a@example.com", methods: ["Email"] };
const notFound = () =>
  new AuthApiError(
    "User from sub claim in JWT does not exist",
    403,
    "user_not_found",
  );
const noConnection = () => new TypeError("Network request failed");
/** A Supabase-shaped access token naming `sub` (never verified in tests). */
const jwt = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;

/** The account service: who each token is, and what the RPC answers. */
function service() {
  const state = {
    // This phone's stored sign-in.
    session: jwt(ME),
    // This phone's account as the service sees it now.
    current: (): Promise<unknown> =>
      Promise.resolve({ data: { user: { id: ME } }, error: null }),
    // Whose account a fresh confirmation sign-in turned out to be.
    tokenOwner: ME,
    rpc: (): Promise<unknown> => Promise.resolve({ error: null }),
  };
  const auth = {
    getUser: jest.fn(async (token?: string) =>
      token === "fresh"
        ? { data: { user: { id: state.tokenOwner } }, error: null }
        : state.current(),
    ),
    getSession: jest.fn(async () => ({
      data: { session: { access_token: state.session } },
      error: null,
    })),
    setSession: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    admin: { signOut: jest.fn(async () => ({ data: null, error: null })) },
  };
  const verifier = {
    auth: {
      getUser: jest.fn(async (token?: string) =>
        token === "fresh"
          ? { data: { user: { id: state.tokenOwner } }, error: null }
          : { data: { user: null }, error: new Error("unknown token") },
      ),
      admin: { signOut: jest.fn(async () => ({ data: null, error: null })) },
      signInWithPassword: jest.fn(async ({ password }: { password: string }) =>
        password === "right password"
          ? {
              data: {
                session: { access_token: "fresh", refresh_token: "fresh-r" },
              },
              error: null,
            }
          : {
              data: { session: null },
              error: new AuthApiError(
                "Invalid login credentials",
                400,
                "invalid_credentials",
              ),
            },
      ),
    },
  };
  // Only ever called through a client pinned to one token.
  const rpc = jest.fn((name: string, token: string) => {
    void name;
    void token;
    return state.rpc();
  });
  const asToken = (token: string) => ({
    rpc: (name: string) => rpc(name, token),
  });
  return { auth, rpc, asToken, verifier, state };
}

const endSession = jest.fn(async () => {});
function setup() {
  const f = pathRepository();
  f.r.setSetting("cloudOwner", ME);
  f.r.saveProfile({ onboarded: true });
  f.r.startWorkout("Push day");
  jest.mocked(useRepo).mockReturnValue(f.r);
  mockClient = service();
  return { ...f, cloud: mockClient };
}
async function open(
  user: AuthUser = me,
  { offline = false }: { offline?: boolean } = {},
) {
  const view = await render(
    <EntryContext.Provider
      value={{
        entry: { kind: "ready", user, offline },
        client: mockClient as never,
        finishRecovery: () => {},
        signOut: endSession,
      }}
    >
      <DeleteAccount />
    </EntryContext.Provider>,
  );
  await flush();
  return view;
}
type View = Awaited<ReturnType<typeof open>>;
const flush = () => act(async () => {});
const press = async (view: View, name: string | RegExp) => {
  await fireEvent.press(view.getByRole("button", { name }));
  await flush();
};
/** Explain → no backup → the right password: the final step. */
async function toFinal(view: View) {
  await press(view, "Continue");
  await press(view, "Continue without a backup");
  await fireEvent.changeText(view.getByLabelText("Password"), "right password");
  await press(view, "Confirm with password");
  expect(view.getByTestId("delete-final")).toBeTruthy();
}
/** "Delete my Forge account", then the final dialog's own button. */
async function deleteNow(view: View) {
  await press(view, "Delete my Forge account");
  const [, , run] = jest.mocked(confirm).mock.calls.at(-1)!;
  await act(async () => run());
  await flush();
}
const marker = (r: { setting: (k: string) => string | undefined }) =>
  JSON.parse(r.setting("accountDeletion") ?? "null") as {
    state: string;
  } | null;

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSocial, { apple: false, google: false });
});

test("explains the cloud, this phone, other devices and signing up again; leaving changes nothing", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    const inCloud = within(view.getByTestId("delete-cloud"));
    expect(
      inCloud.getByText(
        /a@example\.com and everything saved to it in Forge's cloud are deleted permanently/,
      ),
    ).toBeTruthy();
    expect(
      inCloud.getByText(/same email creates a new, empty account/),
    ).toBeTruthy();
    const phone = within(view.getByTestId("delete-phone"));
    expect(phone.getByText("This phone holds 1 workout.")).toBeTruthy();
    expect(
      phone.getByText(
        /never synchronized: .* only on this phone and would be lost for good/,
      ),
    ).toBeTruthy();
    expect(
      phone.getByText(
        /Nothing here is removed unless the deletion is confirmed/,
      ),
    ).toBeTruthy();
    expect(
      phone.getByText(/A backup is a file, not your account/),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("delete-devices")).getByText(
        /signed out when their sign-in next renews.*locked to the deleted account/,
      ),
    ).toBeTruthy();
    expect(view.getByText(/use Delete all local data/)).toBeTruthy();
    await press(view, "Keep my account");
    expect(router.back).toHaveBeenCalled();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(marker(r)).toBeNull();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("export: saved and checked, shared, cancelled or failed; none of them deletes anything", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    await press(view, "Continue");
    const backup = within(view.getByTestId("delete-backup"));
    expect(backup.getByText("Not backed up yet.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
    // Cancelled in the folder picker: nothing is claimed.
    jest.mocked(saveBackupToFolder).mockResolvedValueOnce({ saved: false });
    await press(view, "Save to a folder");
    expect(view.queryByText(/Backup saved/)).toBeNull();
    // Failed: said, and still nothing is claimed.
    jest
      .mocked(saveBackupToFolder)
      .mockRejectedValueOnce(new Error("Disk full"));
    await press(view, "Save to a folder");
    expect(alert).toHaveBeenCalledWith("Backup not saved", "Disk full");
    expect(view.queryByText(/Backup saved/)).toBeNull();
    expect(
      view.getByRole("button", { name: "Continue without a backup" }),
    ).toBeTruthy();
    // Shared: never called saved.
    await press(view, "Share a copy");
    expect(shareBackup).toHaveBeenCalledTimes(1);
    expect(
      view.getByText(/You shared a copy\. Forge can't confirm it was saved/),
    ).toBeTruthy();
    // Saved and read back.
    await press(view, "Save to a folder");
    expect(view.getByText("Backup saved and checked.")).toBeTruthy();
    await press(view, "Continue");
    expect(view.getByTestId("delete-identity")).toBeTruthy();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("confirming it's you: a wrong password, another account or no connection keep everything", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    await press(view, "Continue");
    await press(view, "Continue without a backup");
    expect(
      within(view.getByTestId("delete-identity")).getByText(
        "Sign in to a@example.com again to delete it.",
      ),
    ).toBeTruthy();
    await press(view, "Confirm with password");
    expect(view.getByText("Enter your password.")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Password"), "wrong");
    await press(view, "Confirm with password");
    expect(
      view.getByText("That password isn't right. Try again."),
    ).toBeTruthy();
    expect(cloud.verifier.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "wrong",
    });
    // The right password, but the account service says it's someone else's.
    cloud.state.tokenOwner = "user-b";
    await fireEvent.changeText(
      view.getByLabelText("Password"),
      "right password",
    );
    await press(view, "Confirm with password");
    expect(
      view.getByText(
        "That's a different account. Forge signed it out here and didn't change it or anything else. Confirm with a@example.com.",
      ),
    ).toBeTruthy();
    expect(cloud.verifier.auth.admin.signOut).toHaveBeenCalledWith(
      "fresh",
      "local",
    );
    // This phone's own sign-in was never ended or replaced.
    expect(cloud.auth.admin.signOut).not.toHaveBeenCalled();
    expect(cloud.auth.signOut).not.toHaveBeenCalled();
    // No connection.
    cloud.verifier.auth.signInWithPassword.mockRejectedValueOnce(
      noConnection(),
    );
    await press(view, "Confirm with password");
    expect(view.getByText(/Can't reach Forge's account service/)).toBeTruthy();
    expect(cloud.auth.setSession).not.toHaveBeenCalled();
    expect(view.queryByTestId("delete-final")).toBeNull();
    // Then the same account: its fresh sign-in replaces this phone's.
    cloud.state.tokenOwner = ME;
    await press(view, "Confirm with password");
    expect(cloud.auth.setSession).toHaveBeenCalledWith({
      access_token: "fresh",
      refresh_token: "fresh-r",
    });
    expect(view.getByTestId("delete-final")).toBeTruthy();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("Google: cancelling changes nothing, another Google account is refused, the same one continues", async () => {
  const { db, cloud } = setup();
  try {
    mockSocial.google = true;
    const view = await open({ ...me, methods: ["Google"] });
    await press(view, "Continue");
    await press(view, "Continue without a backup");
    expect(view.queryByLabelText("Password")).toBeNull();
    jest.mocked(reauthWithGoogle).mockResolvedValueOnce("cancelled");
    await press(view, "Continue with Google");
    expect(reauthWithGoogle).toHaveBeenLastCalledWith(
      cloud,
      { ...me, methods: ["Google"] },
      cloud.verifier.auth,
    );
    expect(
      view.getByText(
        "In Google's sheet, choose a@example.com. A different Google account can't confirm this deletion.",
      ),
    ).toBeTruthy();
    expect(view.getByTestId("delete-identity")).toBeTruthy();
    expect(view.queryByText(/different account/)).toBeNull();
    jest
      .mocked(reauthWithGoogle)
      .mockRejectedValueOnce(new ReauthError("wrong_account"));
    await press(view, "Continue with Google");
    expect(
      view.getByText(
        "That's a different Google account, so it can't confirm this deletion. Forge signed it out here and didn't change it or anything else. If it had no Forge account, choosing it may have created an empty one. Confirm with a@example.com.",
      ),
    ).toBeTruthy();
    jest.mocked(reauthWithGoogle).mockResolvedValueOnce("confirmed");
    await press(view, "Continue with Google");
    expect(view.getByTestId("delete-final")).toBeTruthy();
    expect(cloud.rpc).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("no way to confirm here (Google unavailable, Apple only): said plainly, nothing to press", async () => {
  const { db } = setup();
  try {
    for (const [methods, text] of [
      [["Google"], /Confirming with Google isn't available/],
      [["Apple"], /signs in a way Forge can't confirm here yet/],
    ] as const) {
      const view = await open({ ...me, methods: [...methods] });
      await press(view, "Continue");
      await press(view, "Continue without a backup");
      expect(view.getByText(text)).toBeTruthy();
      expect(view.queryByLabelText("Password")).toBeNull();
      expect(view.queryByTestId("continue-google")).toBeNull();
      await view.unmount();
    }
  } finally {
    db.close();
  }
});

test("final: asks once more, and cancelling that changes nothing", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    await toFinal(view);
    const final = within(view.getByTestId("delete-final"));
    expect(final.getByText("Delete a@example.com?")).toBeTruthy();
    expect(
      final.getByText(
        /Then everything on this phone is removed: 1 workout, with your profile and preferences/,
      ),
    ).toBeTruthy();
    expect(final.getByText(/never synchronized/)).toBeTruthy();
    expect(final.getByText("You haven't exported a backup.")).toBeTruthy();
    await press(view, "Delete my Forge account");
    expect(confirm).toHaveBeenCalledWith(
      "Delete your Forge account?",
      expect.stringContaining("can't be undone"),
      expect.any(Function),
      { action: "Delete account" },
    );
    // The dialog's Cancel: its action never runs.
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(marker(r)).toBeNull();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("deleted: one request however often it's pressed; then this phone's training is removed", async () => {
  const { r, db, cloud } = setup();
  try {
    let answer: (v: unknown) => void = () => {};
    cloud.state.rpc = () => new Promise((done) => (answer = done));
    const view = await open();
    await toFinal(view);
    await press(view, "Delete my Forge account");
    const [, , run] = jest.mocked(confirm).mock.calls.at(-1)!;
    await act(async () => {
      run();
      run();
    });
    expect(view.getByText("Deleting your account…")).toBeTruthy();
    expect(
      view.getByRole("button", { name: "Delete my Forge account" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    // Sent, not yet answered: nothing removed, and the phone knows.
    expect(marker(r)?.state).toBe("requested");
    expect(localSummary(r).workouts).toBe(1);
    await act(async () => answer({ error: null }));
    await flush();
    expect(cloud.rpc).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledWith({ deleted: true });
    expect(localSummary(r).workouts).toBe(0);
    expect(dataOwner(r)).toBeUndefined();
    expect(cancelAllNotifications).toHaveBeenCalled();
    expect(JSON.parse(r.setting("accountDeleted")!)).toMatchObject({
      owner: ME,
      localRemoved: true,
    });
    expect(view.getByText("Your Forge account was deleted.")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("reply lost: finished only once the account service says the account is gone", async () => {
  const { r, db, cloud } = setup();
  try {
    cloud.state.rpc = () => Promise.reject(noConnection());
    cloud.state.current = async () => ({
      data: { user: null },
      error: notFound(),
    });
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    expect(endSession).toHaveBeenCalledWith({ deleted: true });
    expect(localSummary(r).workouts).toBe(0);
    expect(view.getByText("Your Forge account was deleted.")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("no answer either way: nothing removed; Check again finishes it once the account service answers", async () => {
  const { r, db, cloud } = setup();
  try {
    cloud.state.rpc = () => Promise.reject(noConnection());
    cloud.state.current = () => Promise.reject(noConnection());
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    const uncertain = within(view.getByTestId("delete-uncertain"));
    expect(
      uncertain.getByText("Forge couldn't confirm the deletion"),
    ).toBeTruthy();
    expect(
      uncertain.getByText(/Nothing on this phone was removed/),
    ).toBeTruthy();
    expect(marker(r)?.state).toBe("requested");
    expect(endSession).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
    // Exporting is still possible here.
    expect(view.getByRole("button", { name: "Share a copy" })).toBeTruthy();
    await press(view, "Check again");
    expect(view.getByText(/still couldn't confirm the deletion/)).toBeTruthy();
    expect(localSummary(r).workouts).toBe(1);
    cloud.state.current = async () => ({
      data: { user: null },
      error: notFound(),
    });
    await press(view, "Check again");
    expect(localSummary(r).workouts).toBe(0);
    expect(view.getByText("Your Forge account was deleted.")).toBeTruthy();
    // The request itself was sent once.
    expect(cloud.rpc).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

test("the request never arrived: the account wasn't deleted, and Keep my account clears it", async () => {
  const { r, db, cloud } = setup();
  try {
    cloud.state.rpc = async () => ({
      error: { message: "Service unavailable", code: "503" },
    });
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    expect(
      within(view.getByTestId("delete-not-deleted")).getByText(
        /deletion didn't go through/,
      ),
    ).toBeTruthy();
    expect(marker(r)?.state).toBe("notDeleted");
    expect(localSummary(r).workouts).toBe(1);
    expect(endSession).not.toHaveBeenCalled();
    await press(view, "Keep my account");
    expect(marker(r)).toBeNull();
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("reopened after an interrupted request, the screen starts where it was left", async () => {
  const { r, db } = setup();
  try {
    const set = (owner: string, state: string) =>
      r.setSetting("accountDeletion", JSON.stringify({ owner, state, at: 1 }));
    set(ME, "requested");
    let view = await open();
    expect(view.getByTestId("delete-uncertain")).toBeTruthy();
    await view.unmount();
    set(ME, "notDeleted");
    view = await open();
    expect(view.getByTestId("delete-not-deleted")).toBeTruthy();
    await view.unmount();
    set("someone-else", "requested");
    view = await open();
    expect(view.getByTestId("delete-cloud")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a confirmation more than five minutes old is asked for again", async () => {
  const { r, db, cloud } = setup();
  const now = jest.spyOn(Date, "now");
  try {
    const t0 = Date.UTC(2026, 10, 1, 12);
    now.mockReturnValue(t0);
    const view = await open();
    await toFinal(view);
    now.mockReturnValue(t0 + 6 * 60_000);
    await deleteNow(view);
    expect(view.getByTestId("delete-identity")).toBeTruthy();
    expect(
      view.getByText(/It's been a few minutes since you confirmed it's you/),
    ).toBeTruthy();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(marker(r)).toBeNull();
  } finally {
    now.mockRestore();
    db.close();
  }
});

test("the account service asking for a fresh sign-in (Stage 3) returns to Confirm it's you", async () => {
  const { r, db, cloud } = setup();
  try {
    cloud.state.rpc = async () => ({
      error: {
        message: "Sign in again to delete your account",
        hint: "reauthentication_needed",
      },
    });
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    expect(view.getByTestId("delete-identity")).toBeTruthy();
    expect(view.getByText(/asks you to sign in again first/)).toBeTruthy();
    expect(marker(r)).toBeNull();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("offline: the final delete can't be pressed, and says why", async () => {
  const { db, cloud } = setup();
  try {
    const view = await open(me, { offline: true });
    expect(view.getByText(/You're offline/)).toBeTruthy();
    await toFinal(view);
    expect(
      view.getByRole("button", { name: "Delete my Forge account" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(cloud.rpc).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("another account's training on this phone: this account can't be deleted here", async () => {
  const { r, db, cloud } = setup();
  try {
    r.setSetting("cloudOwner", "someone-else");
    const view = await open();
    expect(view.getByTestId("delete-not-owner")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(cloud.rpc).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("a failure after the deletion was confirmed says only what's true, and the next launch finishes it", async () => {
  const { r, db } = setup();
  try {
    const clearData = r.clearData.bind(r);
    r.clearData = () => {
      throw new Error("disk I/O error");
    };
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    // The account is gone; this phone's part waits for the next launch.
    expect(view.getByText("Your Forge account was deleted.")).toBeTruthy();
    expect(view.queryByText(/Nothing on this phone was removed/)).toBeNull();
    expect(marker(r)?.state).toBe("deleted");
    expect(localSummary(r).workouts).toBe(1);
    r.clearData = clearData;
  } finally {
    db.close();
  }
});

test("a failure before anything was sent says nothing changed", async () => {
  const { r, db, cloud } = setup();
  try {
    const setSetting = r.setSetting.bind(r);
    r.setSetting = (key: string, value: string) => {
      if (key === "accountDeletion") throw new Error("disk I/O error");
      setSetting(key, value);
    };
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    expect(view.getByTestId("delete-final")).toBeTruthy();
    expect(
      view.getByText(
        "Forge couldn't send the request. Nothing changed. Try again.",
      ),
    ).toBeTruthy();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("Google: a different account is refused and named, may have been created, and nothing is deleted; repeated attempts too", async () => {
  const { r, db, cloud } = setup();
  try {
    mockSocial.google = true;
    const view = await open({ ...me, methods: ["Google"] });
    await press(view, "Continue");
    await press(view, "Continue without a backup");
    for (const chosen of ["b@gmail.com", "c@gmail.com"]) {
      jest
        .mocked(reauthWithGoogle)
        .mockRejectedValueOnce(
          new ReauthError("wrong_account", { email: chosen }),
        );
      await press(view, "Continue with Google");
      expect(
        view.getByText(
          `That's a different Google account (${chosen}), so it can't confirm this deletion. Forge signed it out here and didn't change it or anything else. If it had no Forge account, choosing it may have created an empty one. Confirm with a@example.com.`,
        ),
      ).toBeTruthy();
      // Still confirming: nothing sent, deleted, signed out or removed.
      expect(view.getByTestId("delete-identity")).toBeTruthy();
    }
    expect(reauthWithGoogle).toHaveBeenCalledTimes(2);
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(cloud.auth.signOut).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
    expect(marker(r)).toBeNull();
    expect(localSummary(r).workouts).toBe(1);
    expect(dataOwner(r)).toBe(ME);
  } finally {
    db.close();
  }
});

test("Google: a second tap while the sheet is open starts nothing more", async () => {
  const { db } = setup();
  try {
    mockSocial.google = true;
    let finish: (v: "cancelled") => void = () => {};
    jest
      .mocked(reauthWithGoogle)
      .mockImplementationOnce(() => new Promise((done) => (finish = done)));
    const view = await open({ ...me, methods: ["Google"] });
    await press(view, "Continue");
    await press(view, "Continue without a backup");
    await press(view, "Continue with Google");
    await press(view, "Continue with Google");
    expect(reauthWithGoogle).toHaveBeenCalledTimes(1);
    await act(async () => finish("cancelled"));
    expect(view.getByTestId("delete-identity")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the deletion request goes out as this account's own sign-in", async () => {
  const { db, cloud } = setup();
  try {
    const view = await open();
    await toFinal(view);
    await deleteNow(view);
    expect(cloud.rpc).toHaveBeenCalledTimes(1);
    expect(cloud.rpc).toHaveBeenCalledWith("forge_delete_account", jwt(ME));
  } finally {
    db.close();
  }
});

test("with another account's sign-in on this phone, nothing is sent and nothing changes", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    await toFinal(view);
    cloud.state.session = jwt("user-b");
    await deleteNow(view);
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(view.getByTestId("delete-identity")).toBeTruthy();
    expect(
      view.getByText(/couldn't use your sign-in to send the request/),
    ).toBeTruthy();
    expect(marker(r)).toBeNull();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("an account already known to be gone: export, then remove it yourself; no deletion steps", async () => {
  const { r, db, cloud } = setup();
  try {
    r.setSetting(
      "accountDeleted",
      JSON.stringify({
        owner: ME,
        at: 1,
        localRemoved: false,
        source: "this-phone",
      }),
    );
    const view = await open();
    const gone = within(view.getByTestId("delete-gone"));
    expect(
      gone.getByRole("header", { name: "This Forge account no longer exists" }),
    ).toBeTruthy();
    expect(gone.getByText(/can't be synchronized again/)).toBeTruthy();
    expect(gone.getByText(/never synchronized/)).toBeTruthy();
    expect(gone.getByText(/remove it with Delete all local data/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Share a copy" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
    await press(view, "Back to Account & privacy");
    expect(router.back).toHaveBeenCalled();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("waiting on an unconfirmed deletion, the never-synchronized count is shown before Check again", async () => {
  const { r, db } = setup();
  try {
    r.setSetting(
      "accountDeletion",
      JSON.stringify({ owner: ME, state: "requested", at: 1 }),
    );
    const view = await open();
    expect(
      within(view.getByTestId("delete-uncertain")).getByText(
        /never synchronized: .* would be lost for good/,
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("settled by the launch check while this screen is open: Check again shows where it stands", async () => {
  const { r, db, cloud } = setup();
  try {
    r.setSetting(
      "accountDeletion",
      JSON.stringify({ owner: ME, state: "requested", at: 1 }),
    );
    // The launch check found the account still there.
    let view = await open();
    expect(view.getByTestId("delete-uncertain")).toBeTruthy();
    r.setSetting(
      "accountDeletion",
      JSON.stringify({ owner: ME, state: "notDeleted", at: 2 }),
    );
    await press(view, "Check again");
    expect(view.getByTestId("delete-not-deleted")).toBeTruthy();
    await view.unmount();
    // The launch check found it gone: training kept, never the deletion steps.
    r.setSetting(
      "accountDeletion",
      JSON.stringify({ owner: ME, state: "requested", at: 1 }),
    );
    view = await open();
    noteAccountGone(r, ME, "this-phone");
    await press(view, "Check again");
    expect(view.getByTestId("delete-gone")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});

test("found gone mid-flow: the deletion steps give way to export and removal guidance", async () => {
  const { r, db, cloud } = setup();
  try {
    const view = await open();
    expect(view.getByTestId("delete-cloud")).toBeTruthy();
    noteAccountGone(r, ME);
    await press(view, "Continue");
    expect(view.getByTestId("delete-gone")).toBeTruthy();
    expect(view.queryByTestId("delete-backup")).toBeNull();
    expect(view.queryByLabelText("Password")).toBeNull();
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(localSummary(r).workouts).toBe(1);
  } finally {
    db.close();
  }
});
