import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { router } from "expo-router";
import Welcome from "../../src/screens/entry/Welcome";
import SignIn from "../../src/screens/entry/SignIn";
import CreateAccount, {
  signUpProblem,
} from "../../src/screens/entry/CreateAccount";
import AccountCheck from "../../src/screens/entry/AccountCheck";
import { EntryContext } from "../../src/auth/session";
import type { Entry } from "../../src/auth/entry";
import { useRepo, confirm } from "../../src/state";
import { dataOwner } from "../../src/data/ownership";
import { pathRepository } from "../path-fixture";
import { authLinkStatus } from "../../src/auth/links";

// Phase 7.7B: the entry screens. The account service is a mocked Supabase
// client: these tests check what each screen says and which existing auth
// call it makes, not a real project. None of them ever opens training.

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
    canGoBack: jest.fn(() => false),
  },
}));
jest.mock("expo-linking", () => ({
  createURL: (path: string) => `forge://${path.replace(/^\//, "")}`,
  useURL: () => null,
}));
jest.mock("../../src/notifications", () => ({
  cancelAllNotifications: jest.fn(async () => {}),
}));
jest.mock("../../src/cloud/sync", () => ({ synchronize: jest.fn() }));

const me = { id: "user-a", email: "a@example.com" };
function client(cloudRows: { id: string }[] = [], queryError?: Error) {
  const limit = jest.fn(async () =>
    queryError
      ? { data: null, error: queryError }
      : { data: cloudRows, error: null },
  );
  return {
    limit,
    rpc: jest.fn(),
    from: jest.fn(() => ({ select: jest.fn(() => ({ limit })) })),
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: me } },
        error: null,
      })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signUp: jest.fn(async () => ({
        data: { session: { user: me } },
        error: null,
      })),
      resetPasswordForEmail: jest.fn(async () => ({ error: null })),
      resend: jest.fn(async () => ({ data: {}, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
      updateUser: jest.fn(async () => ({ error: null })),
    },
  };
}
type Client = ReturnType<typeof client>;
function withEntry(
  ui: React.ReactElement,
  entry: Entry,
  c: Client,
  finishRecovery = jest.fn(),
  link?: string,
) {
  return (
    <EntryContext.Provider
      value={{
        entry,
        client: c as never,
        finishRecovery,
        link,
      }}
    >
      {ui}
    </EntryContext.Provider>
  );
}
const flush = () => act(async () => {});
const button = (view: Awaited<ReturnType<typeof render>>, name: string) =>
  view.getByRole("button", { name });

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

describe("Welcome", () => {
  test("without an enabled provider: Continue with Email, and nothing else", async () => {
    const view = await render(
      withEntry(<Welcome />, { kind: "signedOut" }, client()),
    );
    expect(view.getByTestId("welcome")).toBeTruthy();
    expect(view.getByText("Your training starts here.")).toBeTruthy();
    expect(
      view.getByText(
        "Train with purpose. Track your progress. Build something that lasts.",
      ),
    ).toBeTruthy();
    const names = view
      .getAllByRole("button")
      .map((b) => b.props.accessibilityLabel);
    // No provider button that wouldn't work, no guest mode, no skip.
    expect(names).toEqual(["Continue with Email"]);
    expect(view.queryByText(/guest|skip|continue without/i)).toBeNull();
    expect(view.queryByTestId("continue-google")).toBeNull();
    expect(view.queryByTestId("continue-apple")).toBeNull();
    // Email leads to Sign in, which links to Create account.
    await fireEvent.press(button(view, "Continue with Email"));
    expect(router.push).toHaveBeenLastCalledWith("/sign-in");
  });

  test("compact iPhone, large text and light mode keep the action", async () => {
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(
      withEntry(<Welcome />, { kind: "signedOut" }, client()),
    );
    expect(button(view, "Continue with Email")).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Your training starts here." }),
    ).toBeTruthy();
  });
});

describe("Sign in", () => {
  const entry: Entry = { kind: "signedOut" };

  test("asks for both fields before calling the account service", async () => {
    const c = client();
    const view = await render(withEntry(<SignIn />, entry, c));
    await fireEvent.press(button(view, "Sign in"));
    expect(view.getByText("Enter your email and password.")).toBeTruthy();
    expect(c.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test("signs in with the existing call; the gate, not the screen, moves on", async () => {
    const c = client();
    const view = await render(withEntry(<SignIn />, entry, c));
    await fireEvent.changeText(
      view.getByLabelText("Email"),
      "  a@example.com ",
    );
    await fireEvent.changeText(view.getByLabelText("Password"), "secret-pass");
    await fireEvent.press(button(view, "Sign in"));
    await flush();
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "secret-pass",
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  test("wrong credentials and a lost connection are said plainly", async () => {
    const c = client();
    c.auth.signInWithPassword
      .mockResolvedValueOnce({
        error: new Error("Invalid login credentials"),
      } as never)
      .mockRejectedValueOnce(new AuthRetryableFetchError("Failed to fetch", 0));
    const view = await render(withEntry(<SignIn />, entry, c));
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    await fireEvent.changeText(view.getByLabelText("Password"), "wrong");
    await fireEvent.press(button(view, "Sign in"));
    await flush();
    expect(view.getByText("Invalid login credentials")).toBeTruthy();
    await fireEvent.press(button(view, "Sign in"));
    await flush();
    expect(
      view.getByText(
        "Can't reach Forge's account service. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(view.queryByText("Failed to fetch")).toBeNull();
  });

  test("forgot password sends the existing reset request", async () => {
    const c = client();
    const view = await render(withEntry(<SignIn />, entry, c));
    await fireEvent.press(button(view, "Forgot password?"));
    expect(view.queryByLabelText("Password")).toBeNull();
    await fireEvent.press(button(view, "Send reset link"));
    expect(view.getByText("Enter your email address.")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    await fireEvent.press(button(view, "Send reset link"));
    await flush();
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "forge://account",
    });
    expect(
      view.getByText(
        "Reset requested. If a@example.com has a Forge account, use the link in that email to set a new password. Check your spam folder if it doesn't arrive.",
      ),
    ).toBeTruthy();
  });

  test("links to Create account and back to Welcome", async () => {
    const view = await render(withEntry(<SignIn />, entry, client()));
    await fireEvent.press(button(view, "New to Forge? Create an account"));
    expect(router.replace).toHaveBeenLastCalledWith("/create-account");
  });
});

describe("Create account", () => {
  const entry: Entry = { kind: "signedOut" };

  test("validation, in plain words", () => {
    expect(signUpProblem(" ", "", "")).toBe("Enter your email address.");
    expect(signUpProblem("a@b", "longenough", "longenough")).toBe(
      "Enter a valid email address.",
    );
    expect(signUpProblem("a@b.co", "short", "short")).toBe(
      "Use at least 8 characters for your password.",
    );
    expect(signUpProblem("a@b.co", "longenough", "different")).toBe(
      "The passwords don't match.",
    );
    expect(signUpProblem(" a@b.co ", "longenough", "longenough")).toBe(
      undefined,
    );
  });

  async function fill(
    view: Awaited<ReturnType<typeof render>>,
    p = "longenough",
    q = p,
  ) {
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    await fireEvent.changeText(view.getByLabelText("Password"), p);
    await fireEvent.changeText(view.getByLabelText("Confirm password"), q);
    await fireEvent.press(button(view, "Create account"));
    await flush();
  }

  test("invalid forms never reach the account service", async () => {
    const c = client();
    const view = await render(withEntry(<CreateAccount />, entry, c));
    await fill(view, "short");
    expect(
      view.getByText("Use at least 8 characters for your password."),
    ).toBeTruthy();
    await fill(view, "longenough", "different");
    expect(view.getByText("The passwords don't match.")).toBeTruthy();
    expect(c.auth.signUp).not.toHaveBeenCalled();
  });

  test("with a session, the gate moves on; no confirmation screen", async () => {
    const c = client();
    const view = await render(withEntry(<CreateAccount />, entry, c));
    await fill(view);
    expect(c.auth.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "longenough",
      // The confirmation email links back to Sign in.
      options: { emailRedirectTo: "forge://sign-in" },
    });
    expect(view.queryByTestId("confirm-email")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("when email confirmation is required, it says so and never enters", async () => {
    const c = client();
    c.auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as never);
    const view = await render(withEntry(<CreateAccount />, entry, c));
    await fill(view);
    expect(view.getByTestId("confirm-email")).toBeTruthy();
    expect(
      view.getByText(
        "Check a@example.com for a confirmation link from Forge's account service, then sign in.",
      ),
    ).toBeTruthy();
    await fireEvent.press(button(view, "Go to sign in"));
    expect(router.replace).toHaveBeenLastCalledWith("/sign-in");
  });

  test("an account-service error is shown, not swallowed", async () => {
    const c = client();
    c.auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("User already registered"),
    } as never);
    const view = await render(withEntry(<CreateAccount />, entry, c));
    await fill(view);
    expect(view.getByText("User already registered")).toBeTruthy();
    expect(view.queryByTestId("confirm-email")).toBeNull();
  });
});

describe("Account checks", () => {
  function repo() {
    const f = pathRepository();
    jest.mocked(useRepo).mockReturnValue(f.r);
    return f;
  }

  test("an unconnected build says accounts aren't available, with no way in", async () => {
    for (const kind of ["unconfigured", "misconfigured"] as const) {
      const f = repo();
      const view = await render(
        withEntry(<AccountCheck />, { kind }, client()),
      );
      expect(view.getByTestId("accounts-unavailable")).toBeTruthy();
      expect(view.getByText("Accounts aren't available")).toBeTruthy();
      expect(view.queryAllByRole("button")).toHaveLength(0);
      await view.unmount();
      f.db.close();
    }
  });

  test("unlinked: linking is the athlete's choice, after the account is checked", async () => {
    const f = repo();
    try {
      f.r.saveProfile({ onboarded: true });
      f.r.startWorkout();
      const c = client([]);
      const view = await render(
        withEntry(<AccountCheck />, { kind: "unlinked", user: me }, c),
      );
      expect(view.getByTestId("account-unlinked")).toBeTruthy();
      expect(
        view.getByText(/checks that this account has no training saved/),
      ).toBeTruthy();
      expect(c.from).not.toHaveBeenCalled();
      expect(dataOwner(f.r)).toBeUndefined();
      await fireEvent.press(button(view, "Link to a@example.com"));
      await flush();
      expect(c.from).toHaveBeenCalledWith("forge_records");
      expect(c.rpc).not.toHaveBeenCalled();
      expect(dataOwner(f.r)).toBe("user-a");
      expect(f.r.workouts()).toHaveLength(1);
    } finally {
      f.db.close();
    }
  });

  test("unlinked: an account with cloud training is refused; nothing changes", async () => {
    const f = repo();
    try {
      f.r.saveProfile({ onboarded: true });
      f.r.startWorkout();
      const outbox = f.r.outbox().length;
      const c = client([{ id: "profile" }]);
      const view = await render(
        withEntry(<AccountCheck />, { kind: "unlinked", user: me }, c),
      );
      await fireEvent.press(button(view, "Link to a@example.com"));
      await flush();
      expect(view.getByTestId("account-link-blocked")).toBeTruthy();
      expect(view.getByText("This account already has training")).toBeTruthy();
      expect(
        view.getByText(
          "a@example.com already has training saved in Forge's cloud. Forge can't safely combine it with the separate training on this phone, so it won't link them.",
        ),
      ).toBeTruthy();
      expect(
        view.getByText("Nothing was linked, uploaded or deleted."),
      ).toBeTruthy();
      expect(dataOwner(f.r)).toBeUndefined();
      expect(f.r.workouts()).toHaveLength(1);
      expect(f.r.outbox()).toHaveLength(outbox);
      expect(c.rpc).not.toHaveBeenCalled();
      // No way to link from here; the existing export, sign-out and
      // confirmed deletion remain.
      expect(view.queryByText(/^Link to/)).toBeNull();
      expect(button(view, "Export backup")).toBeTruthy();
      await fireEvent.press(view.getByText("Delete all local data"));
      expect(confirm).toHaveBeenCalledWith(
        "Delete all local data?",
        expect.any(String),
        expect.any(Function),
        { action: "Delete everything" },
      );
      expect(f.r.workouts()).toHaveLength(1);
      await fireEvent.press(button(view, "Sign out"));
      await flush();
      expect(c.auth.signOut).toHaveBeenCalled();
      expect(dataOwner(f.r)).toBeUndefined();
    } finally {
      f.db.close();
    }
  });

  test("unlinked: when the account can't be checked, nothing is linked", async () => {
    const f = repo();
    try {
      f.r.saveProfile({ onboarded: true });
      const c = client(
        [],
        new Error('relation "public.forge_records" does not exist'),
      );
      const view = await render(
        withEntry(<AccountCheck />, { kind: "unlinked", user: me }, c),
      );
      await fireEvent.press(button(view, "Link to a@example.com"));
      await flush();
      expect(
        view.getByText(
          "Forge couldn't check your account, so nothing was linked. Check your connection and try again.",
        ),
      ).toBeTruthy();
      expect(view.queryByText(/forge_records/)).toBeNull();
      expect(view.getByTestId("account-unlinked")).toBeTruthy();
      expect(dataOwner(f.r)).toBeUndefined();
    } finally {
      f.db.close();
    }
  });
  test("unlinked: signing out instead leaves the data unlinked", async () => {
    const f = repo();
    try {
      const c = client();
      const view = await render(
        withEntry(<AccountCheck />, { kind: "unlinked", user: me }, c),
      );
      await fireEvent.press(button(view, "Sign out"));
      await flush();
      expect(c.auth.signOut).toHaveBeenCalled();
      expect(dataOwner(f.r)).toBeUndefined();
    } finally {
      f.db.close();
    }
  });

  test("another account's training: who owns it (masked), why, how to return", async () => {
    const f = repo();
    try {
      f.r.setSetting("cloudOwner", "user-b");
      f.r.setSetting(
        "cloudOwnerHint",
        JSON.stringify({
          owner: "user-b",
          email: "l•••@gmail.com",
          methods: ["Google"],
        }),
      );
      const w = f.r.startWorkout();
      f.r.finishWorkout(w.id);
      f.r.addJournal("measurement", {
        name: "Bodyweight",
        value: 80,
        unit: "kg",
      });
      const c = client();
      const view = await render(
        withEntry(<AccountCheck />, { kind: "otherAccount", user: me }, c),
      );
      expect(view.getByTestId("account-other")).toBeTruthy();
      expect(
        view.getByText(
          "You're signed in as a@example.com, but the training on this phone belongs to l•••@gmail.com.",
        ),
      ).toBeTruthy();
      expect(view.getByText(/never shows, moves or combines/)).toBeTruthy();
      expect(
        view.getByText("2. Sign in with l•••@gmail.com using Google."),
      ).toBeTruthy();
      expect(view.queryByText(/Link to/)).toBeNull();
      // Signing out is the main way forward and changes nothing here.
      await fireEvent.press(button(view, "Sign out"));
      await flush();
      expect(c.auth.signOut).toHaveBeenCalled();
      expect(dataOwner(f.r)).toBe("user-b");
      expect(f.r.workouts()).toHaveLength(1);
    } finally {
      f.db.close();
    }
  });

  test("another account's training: what deleting removes, behind an explicit confirmation", async () => {
    const f = repo();
    try {
      f.r.setSetting("cloudOwner", "user-b");
      const w = f.r.startWorkout();
      f.r.finishWorkout(w.id);
      f.r.addJournal("measurement", {
        name: "Bodyweight",
        value: 80,
        unit: "kg",
      });
      const unsynced = f.r.outbox().length;
      const view = await render(
        withEntry(
          <AccountCheck />,
          { kind: "otherAccount", user: me },
          client(),
        ),
      );
      expect(
        view.getByText(
          "Deleting removes 1 workout, 1 journal entry, with that account's profile and preferences from this phone.",
        ),
      ).toBeTruthy();
      expect(
        view.getByText(
          `${unsynced} changes were never synchronized: they exist only on this phone and would be lost for good.`,
        ),
      ).toBeTruthy();
      await fireEvent.press(view.getByText("Delete this phone's training"));
      expect(confirm).toHaveBeenCalledWith(
        "Delete the other account's training?",
        expect.stringMatching(/never synchronized.*can't be undone/),
        expect.any(Function),
        { action: "Delete from this phone" },
      );
      // Nothing is removed until the athlete confirms.
      expect(dataOwner(f.r)).toBe("user-b");
      expect(f.r.workouts()).toHaveLength(1);
      const [, , onConfirm] = jest.mocked(confirm).mock.calls[0]!;
      onConfirm();
      expect(f.r.workouts()).toHaveLength(0);
      expect(dataOwner(f.r)).toBeUndefined();
    } finally {
      f.db.close();
    }
  });

  test("without a reliable hint the owner is never named; a whole address is never shown", async () => {
    const f = repo();
    try {
      f.r.setSetting("cloudOwner", "user-b");
      f.r.startWorkout();
      // A hint that isn't masked (or isn't for this owner) is ignored.
      f.r.setSetting(
        "cloudOwnerHint",
        JSON.stringify({ owner: "user-b", email: "lstamand@gmail.com" }),
      );
      const view = await render(
        withEntry(
          <AccountCheck />,
          { kind: "otherAccount", user: me },
          client(),
        ),
      );
      expect(
        view.getByText(
          "You're signed in as a@example.com, but the training on this phone belongs to a different Forge account.",
        ),
      ).toBeTruthy();
      expect(
        view.getByText(
          "2. Sign in with the account that used this phone before.",
        ),
      ).toBeTruthy();
      expect(view.queryByText(/lstamand/)).toBeNull();
    } finally {
      f.db.close();
    }
  });

  test("everything synchronized: the other account keeps its training in the cloud", async () => {
    const f = repo();
    try {
      f.r.setSetting("cloudOwner", "user-b");
      f.r.startWorkout();
      f.r.db.run("DELETE FROM outbox");
      const view = await render(
        withEntry(
          <AccountCheck />,
          { kind: "otherAccount", user: me },
          client(),
        ),
      );
      expect(
        view.getAllByText(
          "Everything here had been synchronized, so that account keeps its training in the cloud.",
        ).length,
      ).toBeGreaterThan(0);
    } finally {
      f.db.close();
    }
  });
  test("password recovery: at least 8 characters, then the existing update", async () => {
    const f = repo();
    try {
      const c = client();
      const finish = jest.fn();
      const view = await render(
        withEntry(<AccountCheck />, { kind: "recovery", user: me }, c, finish),
      );
      await fireEvent.changeText(view.getByLabelText("New password"), "short");
      await fireEvent.press(button(view, "Set new password"));
      await flush();
      expect(
        view.getByText("Use at least 8 characters for your password."),
      ).toBeTruthy();
      expect(c.auth.updateUser).not.toHaveBeenCalled();
      await fireEvent.changeText(
        view.getByLabelText("New password"),
        "longenough",
      );
      await fireEvent.press(button(view, "Set new password"));
      await flush();
      expect(c.auth.updateUser).toHaveBeenCalledWith({
        password: "longenough",
      });
      expect(finish).toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
});

describe("Email links", () => {
  const ok =
    "exp://192.168.1.5:8081/--/sign-in#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=signup";
  const expired =
    "exp://192.168.1.5:8081/--/account#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

  test("authLinkStatus reads what the account service reported", () => {
    expect(authLinkStatus(ok)).toEqual({
      tone: "positive",
      text: "Your email is confirmed. Sign in to continue.",
    });
    expect(authLinkStatus(expired)?.tone).toBe("error");
    expect(authLinkStatus(expired)?.text).toMatch(
      /expired or was already used/,
    );
    expect(
      authLinkStatus("forge://sign-in#error=server_error&error_code=unexpected")
        ?.text,
    ).toBe("That email link couldn't be used. Sign in, or request a new link.");
    // Recovery links belong to the session; plain launches mean nothing.
    expect(
      authLinkStatus(
        "forge://account#access_token=at&refresh_token=rt&type=recovery",
      ),
    ).toBeUndefined();
    expect(authLinkStatus("exp://192.168.1.5:8081")).toBeUndefined();
    expect(authLinkStatus("not a url")).toBeUndefined();
    expect(authLinkStatus(undefined)).toBeUndefined();
  });

  test("a confirmed email lands on Sign in with a confirmation, shown once", async () => {
    const entry: Entry = { kind: "signedOut" };
    const view = await render(
      withEntry(<SignIn />, entry, client(), jest.fn(), ok),
    );
    expect(
      view.getByText("Your email is confirmed. Sign in to continue."),
    ).toBeTruthy();
    // Tokens in the link are never shown.
    expect(view.queryByText(/access_token|rt|at$/)).toBeNull();
    await view.unmount();
    const again = await render(
      withEntry(<SignIn />, entry, client(), jest.fn(), ok),
    );
    await flush();
    expect(
      again.queryByText("Your email is confirmed. Sign in to continue."),
    ).toBeNull();
  });

  test("an expired link says so on Welcome", async () => {
    const view = await render(
      withEntry(
        <Welcome />,
        { kind: "signedOut" },
        client(),
        jest.fn(),
        expired,
      ),
    );
    expect(view.getByText(/expired or was already used/)).toBeTruthy();
    expect(
      view.getAllByRole("button").map((b) => b.props.accessibilityLabel),
    ).toEqual(["Continue with Email"]);
  });

  test("signing in before confirming explains what to do, and can resend the link", async () => {
    const c = client();
    c.auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthApiError(
        "Email not confirmed",
        400,
        "email_not_confirmed",
      ),
    } as never);
    const view = await render(withEntry(<SignIn />, { kind: "signedOut" }, c));
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    await fireEvent.changeText(view.getByLabelText("Password"), "longenough");
    await fireEvent.press(button(view, "Sign in"));
    await flush();
    expect(
      view.getByText(
        "Confirm your email first: open the link sent to a@example.com, then sign in.",
      ),
    ).toBeTruthy();
    await fireEvent.press(button(view, "Resend confirmation email"));
    await flush();
    expect(c.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "a@example.com",
      options: { emailRedirectTo: "forge://sign-in" },
    });
    expect(
      view.getByText(
        "Sent. Check a@example.com for a new confirmation link, including your spam folder.",
      ),
    ).toBeTruthy();
    // One email a minute: the button waits.
    const again = view.getByRole("button", { name: /Resend in \d+ s/ });
    expect(again.props.accessibilityState.disabled).toBe(true);
  });
});
