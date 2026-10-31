import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import SignIn from "../../src/screens/entry/SignIn";
import CreateAccount from "../../src/screens/entry/CreateAccount";
import AccountCheck from "../../src/screens/entry/AccountCheck";
import Welcome from "../../src/screens/entry/Welcome";
import {
  EntryContext,
  OFFLINE_SIGN_OUT_NOTICE,
  authErrorText,
} from "../../src/auth/session";
import type { Entry } from "../../src/auth/entry";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";

// Phase 7.7C: account-experience polish. Plain words for every account
// service error, forms that move with the keyboard, visible passwords on
// request, specific progress words, and resending a confirmation email.

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
    replace: jest.fn(),
    back: jest.fn(),
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
jest.mock("../../src/auth/providers", () => ({
  ...jest.requireActual("../../src/auth/providers"),
  useAuthProviders: () => ({ apple: false, google: false }),
}));

const me = { id: "user-a", email: "a@example.com" };
function client() {
  return {
    auth: {
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
      resetPasswordForEmail: jest.fn(async () => ({ error: null })),
      resend: jest.fn(async () => ({ data: {}, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
      updateUser: jest.fn(async () => ({ error: null })),
    },
  };
}
type Client = ReturnType<typeof client>;
const ui = (
  node: React.ReactElement,
  c: Client,
  entry: Entry = { kind: "signedOut" },
  extra: Record<string, unknown> = {},
) => (
  <EntryContext.Provider
    value={{ entry, client: c as never, finishRecovery: jest.fn(), ...extra }}
  >
    {node}
  </EntryContext.Provider>
);
const flush = () => act(async () => {});
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("account service errors, in Forge's words", () => {
  test("each known code has plain wording; raw provider text never shows", () => {
    const say = (code: string, message = "raw provider text") =>
      authErrorText(new AuthApiError(message, 400, code), "fallback");
    expect(say("invalid_credentials")).toMatch(
      /don't match a Forge account.*Continue with Google/,
    );
    expect(say("over_email_send_rate_limit")).toMatch(/Wait a few minutes/);
    expect(say("over_request_rate_limit")).toMatch(/Wait a moment/);
    expect(say("weak_password")).toMatch(/stronger password/);
    expect(say("same_password")).toMatch(/different from your current one/);
    expect(say("user_already_exists")).toMatch(/Sign in instead/);
    expect(say("email_address_invalid")).toBe("Enter a valid email address.");
    expect(say("session_not_found")).toBe(
      "Your sign-in has ended. Sign in again.",
    );
    // An unknown code: the fallback, and only the code in the developer log.
    expect(say("something_new", "secret detail a@b.co")).toBe("fallback");
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|a@b\.co/);
    expect(
      authErrorText(new AuthRetryableFetchError("Failed to fetch", 0), "f"),
    ).toMatch(/Can't reach Forge's account service/);
    expect(authErrorText(new TypeError("Network request failed"), "f")).toMatch(
      /Can't reach/,
    );
    // Forge's own errors are already written for the athlete.
    expect(authErrorText(new Error("Use at least 8 characters."), "f")).toBe(
      "Use at least 8 characters.",
    );
  });
});

describe("Sign in", () => {
  test("Return moves on and submits; progress is named; wrong passwords explained", async () => {
    const c = client();
    let finish!: (v: unknown) => void;
    c.auth.signInWithPassword.mockImplementationOnce(
      () => new Promise((done) => (finish = done)) as never,
    );
    const view = await render(ui(<SignIn />, c));
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    expect(view.getByLabelText("Email").props.returnKeyType).toBe("next");
    await fireEvent.changeText(view.getByLabelText("Password"), "wrongpass");
    expect(view.getByLabelText("Password").props.returnKeyType).toBe("go");
    await fireEvent(view.getByLabelText("Password"), "submitEditing");
    expect(c.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(view.getByRole("button", { name: "Signing in…" })).toBeTruthy();
    await act(async () =>
      finish({
        error: new AuthApiError(
          "Invalid login credentials",
          400,
          "invalid_credentials",
        ),
      }),
    );
    expect(view.getByText(/don't match a Forge account/)).toBeTruthy();
    expect(view.queryByText("Invalid login credentials")).toBeNull();
  });

  test("the reset email is sent from the keyboard, then waits a minute", async () => {
    const c = client();
    const view = await render(ui(<SignIn />, c));
    await fireEvent.press(
      view.getByRole("button", { name: "Forgot password?" }),
    );
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    expect(view.getByLabelText("Email").props.returnKeyType).toBe("send");
    await fireEvent(view.getByLabelText("Email"), "submitEditing");
    await flush();
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    const again = view.getByRole("button", { name: /Send again in \d+ s/ });
    expect(again.props.accessibilityState.disabled).toBe(true);
  });

  test("a password can be shown and hidden", async () => {
    const view = await render(ui(<SignIn />, client()));
    expect(view.getByLabelText("Password").props.secureTextEntry).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "Show password" }));
    expect(view.getByLabelText("Password").props.secureTextEntry).toBe(false);
    expect(view.getByRole("button", { name: "Hide password" })).toBeTruthy();
    // The control sits inside the field, which leaves room for it.
    expect(
      StyleSheet.flatten(view.getByLabelText("Password").props.style)
        .paddingRight,
    ).toBeGreaterThan(40);
  });
});

describe("Create account", () => {
  test("Return walks the form and submits", async () => {
    const c = client();
    const view = await render(ui(<CreateAccount />, c));
    await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
    await fireEvent.changeText(view.getByLabelText("Password"), "longenough");
    await fireEvent.changeText(
      view.getByLabelText("Confirm password"),
      "longenough",
    );
    expect(view.getByLabelText("Password").props.returnKeyType).toBe("next");
    await fireEvent(view.getByLabelText("Confirm password"), "submitEditing");
    await flush();
    expect(c.auth.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "longenough",
      options: { emailRedirectTo: "forge://sign-in" },
    });
  });

  test("the confirmation email can be sent again after a minute", async () => {
    jest.useFakeTimers();
    try {
      const c = client();
      const view = await render(ui(<CreateAccount />, c));
      await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
      await fireEvent.changeText(view.getByLabelText("Password"), "longenough");
      await fireEvent.changeText(
        view.getByLabelText("Confirm password"),
        "longenough",
      );
      await fireEvent.press(
        view.getByRole("button", { name: "Create account" }),
      );
      await flush();
      expect(view.getByTestId("confirm-email")).toBeTruthy();
      // Supabase just sent one: the button waits.
      const waiting = view.getByRole("button", {
        name: /Resend email in \d+ s/,
      });
      expect(waiting.props.accessibilityState.disabled).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(61000);
      });
      await fireEvent.press(view.getByRole("button", { name: "Resend email" }));
      await flush();
      expect(c.auth.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "a@example.com",
        options: { emailRedirectTo: "forge://sign-in" },
      });
      expect(
        view.getByText(
          "Sent again. Check a@example.com, including your spam folder.",
        ),
      ).toBeTruthy();
      expect(
        view.getByText(/including with Continue with Google/),
      ).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a rate-limited resend is explained, not shown raw", async () => {
    jest.useFakeTimers();
    try {
      const c = client();
      c.auth.resend.mockResolvedValueOnce({
        data: {},
        error: new AuthApiError(
          "email rate limit exceeded",
          429,
          "over_email_send_rate_limit",
        ),
      } as never);
      const view = await render(ui(<CreateAccount />, c));
      await fireEvent.changeText(view.getByLabelText("Email"), "a@example.com");
      await fireEvent.changeText(view.getByLabelText("Password"), "longenough");
      await fireEvent.changeText(
        view.getByLabelText("Confirm password"),
        "longenough",
      );
      await fireEvent.press(
        view.getByRole("button", { name: "Create account" }),
      );
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(61000);
      });
      await fireEvent.press(view.getByRole("button", { name: "Resend email" }));
      await flush();
      expect(view.getByText(/Wait a few minutes/)).toBeTruthy();
      expect(view.queryByText(/rate limit exceeded/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Account checks", () => {
  test("recovery: the keyboard submits; a reused password is explained", async () => {
    jest.mocked(useRepo).mockReturnValue(pathRepository().r);
    const c = client();
    c.auth.updateUser.mockResolvedValueOnce({
      error: new AuthApiError(
        "New password should be different",
        422,
        "same_password",
      ),
    } as never);
    const view = await render(
      ui(<AccountCheck />, c, { kind: "recovery", user: me }),
    );
    await fireEvent.changeText(
      view.getByLabelText("New password"),
      "longenough",
    );
    await fireEvent(view.getByLabelText("New password"), "submitEditing");
    await flush();
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "longenough" });
    expect(view.getByText(/different from your current one/)).toBeTruthy();
  });

  test("sign out uses the gate's sign-out (which also works offline)", async () => {
    jest.mocked(useRepo).mockReturnValue(pathRepository().r);
    const c = client();
    const signOut = jest.fn(async () => {});
    const view = await render(
      ui(<AccountCheck />, c, { kind: "unlinked", user: me }, { signOut }),
    );
    await fireEvent.press(view.getByRole("button", { name: "Sign out" }));
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(c.auth.signOut).not.toHaveBeenCalled();
  });
});

test("Welcome says when a sign-out happened offline", async () => {
  const view = await render(
    ui(
      <Welcome />,
      client(),
      { kind: "signedOut" },
      {
        notice: OFFLINE_SIGN_OUT_NOTICE,
      },
    ),
  );
  expect(view.getByText(OFFLINE_SIGN_OUT_NOTICE)).toBeTruthy();
  // It never claims the account service ended the session.
  expect(OFFLINE_SIGN_OUT_NOTICE).toMatch(/wasn't ended there/);
});
