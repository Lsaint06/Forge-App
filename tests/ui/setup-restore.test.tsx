import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import Setup from "../../src/screens/entry/Setup";
import { EntryContext } from "../../src/auth/session";
import type { Entry } from "../../src/auth/entry";
import { confirm, useRepo } from "../../src/state";
import { accountHasCloudRecords } from "../../src/cloud/link";
import {
  synchronize,
  type SyncProgress,
  type SyncResult,
} from "../../src/cloud/sync";
import { transport } from "../../src/cloud/client";
import { pathRepository } from "../path-fixture";

// Phase 7.7C, P1 and P4: first-time setup. A returning athlete on a phone
// with nothing of its own is offered their saved training (a read-only
// check, then the existing manual synchronization, only when they choose
// it); everyone else sets up as before; the wrong account can sign out.

const mockTouch = jest.fn();
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: mockTouch }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock("expo-linking", () => ({
  createURL: (path: string) => `forge://${path.replace(/^\//, "")}`,
  useURL: () => null,
}));
jest.mock("../../src/cloud/link", () => ({
  accountHasCloudRecords: jest.fn(),
}));
jest.mock("../../src/cloud/sync", () => ({ synchronize: jest.fn() }));
jest.mock("../../src/cloud/client", () => ({
  transport: jest.fn(() => "the-account-transport"),
  cloudClient: () => null,
}));
jest.mock("../../src/components/ProfileForm", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { ProfileForm: () => <T>profile-form</T> };
});

const me = { id: "user-a", email: "a@example.com" };
const client = { auth: { signOut: jest.fn(async () => ({ error: null })) } };
const check = jest.mocked(accountHasCloudRecords);
const sync = jest.mocked(synchronize);
let f: ReturnType<typeof pathRepository>;
const flush = () => act(async () => {});
async function setup(
  entry: Entry = { kind: "setup", user: me, offline: false },
  signOut?: () => Promise<void>,
) {
  const view = await render(
    <EntryContext.Provider
      value={{
        entry,
        client: client as never,
        finishRecovery: jest.fn(),
        signOut,
      }}
    >
      <Setup />
    </EntryContext.Provider>,
  );
  await flush();
  return view;
}
const result = (
  downloaded: number,
  extra: Partial<SyncResult> = {},
): SyncResult => ({
  uploaded: 0,
  downloaded,
  matched: 0,
  rejected: 0,
  failed: 0,
  held: { update: 0, active: 0 },
  conflicts: 0,
  pending: 0,
  errors: [],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  f = pathRepository();
  f.r.setSetting("cloudOwner", me.id);
  jest.mocked(useRepo).mockReturnValue(f.r);
});
afterEach(() => f.db.close());

test("a returning athlete on an empty phone is offered their saved training", async () => {
  let answer!: (has: boolean) => void;
  check.mockImplementationOnce(() => new Promise((done) => (answer = done)));
  const view = await setup();
  expect(view.getByLabelText("Checking your account…")).toBeTruthy();
  expect(view.getByText("Setting up Forge for a@example.com")).toBeTruthy();
  await act(async () => answer(true));
  expect(check).toHaveBeenCalledWith(client, "user-a");
  expect(view.getByTestId("setup-restore")).toBeTruthy();
  expect(
    view.getByText(
      "a@example.com has training saved in Forge's cloud. Restore it to this phone to pick up where you left off.",
    ),
  ).toBeTruthy();
  expect(view.queryByText("profile-form")).toBeNull();
  // Nothing has synchronized yet: only an explicit choice does that.
  expect(sync).not.toHaveBeenCalled();
});

test("restoring runs the existing synchronization once, step by step, then says it's complete", async () => {
  check.mockResolvedValueOnce(true);
  let finish!: (v: ReturnType<typeof result>) => void;
  let progress!: (p: SyncProgress) => void;
  sync.mockImplementationOnce((_r, _t, _u, options) => {
    progress = options!.onProgress!;
    return new Promise((done) => (finish = done));
  });
  const view = await setup();
  await fireEvent.press(
    view.getByRole("button", { name: "Restore my training" }),
  );
  // A second tap while it runs starts nothing.
  await fireEvent.press(
    view.getByRole("button", { name: "Restoring your training…" }),
  );
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledWith(f.r, "the-account-transport", "user-a", {
    onProgress: expect.any(Function),
  });
  expect(transport).toHaveBeenCalledWith(client, "user-a");
  // Phase 7.8C: the steps, with counts only once the cloud gave them.
  expect(
    view.getByLabelText("Connecting to your account: in progress"),
  ).toBeTruthy();
  await act(async () => progress({ step: "downloading", received: 500 }));
  expect(
    view.getByLabelText("Downloading your training: in progress, 500 records"),
  ).toBeTruthy();
  await act(async () =>
    progress({ step: "downloading", received: 1200, total: 3400 }),
  );
  expect(view.getByLabelText("Connecting to your account: done")).toBeTruthy();
  expect(
    view.getByLabelText(
      "Downloading your training: in progress, 1,200 of 3,400 records",
    ),
  ).toBeTruthy();
  expect(view.getByLabelText("Restoring to this phone: next")).toBeTruthy();
  await act(async () => progress({ step: "applying", total: 3400 }));
  expect(
    view.getByLabelText("Restoring to this phone: in progress, 3,400 records"),
  ).toBeTruthy();
  expect(view.queryByText(/%/)).toBeNull();
  await act(async () => finish(result(3400)));
  // Complete, said so; Home opens when the athlete continues.
  expect(view.getByText("Restore complete")).toBeTruthy();
  expect(
    view.getByText(
      "Restored 3,400 records to this phone. Nothing was held back.",
    ),
  ).toBeTruthy();
  expect(mockTouch).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "Continue" }));
  expect(mockTouch).toHaveBeenCalled();
});

test("a failed restore changes nothing and says so", async () => {
  check.mockResolvedValueOnce(true);
  sync.mockResolvedValueOnce(
    result(0, { stopped: "offline", errors: ["Network request failed"] }),
  );
  const view = await setup();
  await fireEvent.press(
    view.getByRole("button", { name: "Restore my training" }),
  );
  await flush();
  expect(
    view.getByText(
      "Forge couldn't restore your training: nothing on this phone changed. Check your connection and try again.",
    ),
  ).toBeTruthy();
  expect(view.queryByText(/Network request failed/)).toBeNull();
  expect(mockTouch).not.toHaveBeenCalled();
  expect(
    view.getByRole("button", { name: "Restore my training" }),
  ).toBeTruthy();
});

test("a partial restore can continue or try again", async () => {
  check.mockResolvedValueOnce(true);
  sync.mockResolvedValueOnce(
    result(2, { failed: 1, errors: ["Remote identity mismatch"] }),
  );
  const view = await setup();
  await fireEvent.press(
    view.getByRole("button", { name: "Restore my training" }),
  );
  await flush();
  expect(view.getByText("Restore incomplete")).toBeTruthy();
  expect(
    view.getByText(
      "Restored 2 records, but 1 record couldn't be restored. Try again, or continue and synchronize later in Account & privacy.",
    ),
  ).toBeTruthy();
  sync.mockResolvedValueOnce(result(1));
  await fireEvent.press(view.getByRole("button", { name: "Try again" }));
  await flush();
  expect(sync).toHaveBeenCalledTimes(2);
  // Counted over both tries, then complete.
  expect(
    view.getByText("Restored 3 records to this phone. Nothing was held back."),
  ).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Continue" }));
  expect(mockTouch).toHaveBeenCalled();
});

test("records from a newer Forge are named, and setup can continue (Phase 7.8B)", async () => {
  check.mockResolvedValueOnce(true);
  sync.mockResolvedValueOnce(result(4, { held: { update: 1, active: 0 } }));
  const view = await setup();
  await fireEvent.press(
    view.getByRole("button", { name: "Restore my training" }),
  );
  await flush();
  expect(
    view.getByText(
      "Restored 4 records. 1 record needs a newer version of Forge: update Forge, then synchronize in Account & privacy.",
    ),
  ).toBeTruthy();
  expect(mockTouch).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "Continue" }));
  expect(mockTouch).toHaveBeenCalled();
});

test("a new athlete goes straight to setup", async () => {
  check.mockResolvedValueOnce(false);
  const view = await setup();
  expect(view.getByText("profile-form")).toBeTruthy();
  expect(view.getByText("Setting up Forge for a@example.com")).toBeTruthy();
  expect(sync).not.toHaveBeenCalled();
});

test("once anything is entered, setup continues without a restore check", async () => {
  f.r.saveProfile({ name: "Typed in setup" });
  const view = await setup();
  expect(check).not.toHaveBeenCalled();
  expect(view.getByText("profile-form")).toBeTruthy();
});

test("offline: it says it can't check, then tries again or sets up now", async () => {
  const view = await setup({ kind: "setup", user: me, offline: true });
  expect(check).not.toHaveBeenCalled();
  expect(view.getByTestId("setup-check-failed")).toBeTruthy();
  expect(
    view.getByText(
      "You're offline, so Forge can't look for training saved to a@example.com.",
    ),
  ).toBeTruthy();
  check.mockRejectedValueOnce(new TypeError("Network request failed"));
  await fireEvent.press(view.getByRole("button", { name: "Try again" }));
  await flush();
  expect(check).toHaveBeenCalledTimes(1);
  expect(view.getByTestId("setup-check-failed")).toBeTruthy();
  await fireEvent.press(
    view.getByRole("button", { name: "Set up this phone now" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    "Set up without checking?",
    expect.stringMatching(/stays there/),
    expect.any(Function),
    { action: "Set up this phone", destructive: false },
  );
  await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
  expect(view.getByText("profile-form")).toBeTruthy();
  expect(sync).not.toHaveBeenCalled();
});

test("setting up without restoring is a confirmed choice", async () => {
  check.mockResolvedValueOnce(true);
  const view = await setup();
  await fireEvent.press(
    view.getByRole("button", { name: "Set up without restoring" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    "Set up without restoring?",
    expect.any(String),
    expect.any(Function),
    { action: "Set up this phone", destructive: false },
  );
  await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
  expect(view.getByText("profile-form")).toBeTruthy();
  expect(sync).not.toHaveBeenCalled();
});

test("Not you? signs out at once when nothing has been entered (P4)", async () => {
  check.mockResolvedValueOnce(false);
  const signOut = jest.fn(async () => {});
  const view = await setup(undefined, signOut);
  await fireEvent.press(
    view.getByRole("button", { name: "Not you? Sign out" }),
  );
  await flush();
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

test("Not you? asks first when something was entered, and keeps it", async () => {
  f.r.saveProfile({ name: "Typed in setup" });
  const signOut = jest.fn(async () => {});
  const view = await setup(undefined, signOut);
  await fireEvent.press(
    view.getByRole("button", { name: "Not you? Sign out" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    "Sign out?",
    "What you've entered so far stays on this phone with a@example.com. Another account can't use this phone until it's removed.",
    expect.any(Function),
    { action: "Sign out", destructive: false },
  );
  expect(signOut).not.toHaveBeenCalled();
  await act(async () => jest.mocked(confirm).mock.calls[0]![2]());
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(f.r.profile().name).toBe("Typed in setup");
});
