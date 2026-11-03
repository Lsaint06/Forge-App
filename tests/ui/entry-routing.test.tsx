import React from "react";
import { Text } from "react-native";
import { renderRouter, act, screen } from "expo-router/testing-library";
import { AppStack, TabsGuard } from "../../src/auth/AppStack";
import type { Entry } from "../../src/auth/entry";

// Phase 7.7B: the one entry decision point, with real Expo Router routing.
// Training screens exist only for "ready"; setup only for "setup"; the
// welcome and account screens only before that. Deep links can't skip it.

let mockEntry: Entry["kind"] = "signedOut";
const listeners = new Set<() => void>();
function Layout() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  return <AppStack entry={mockEntry} />;
}
const set = async (kind: Entry["kind"]) => {
  mockEntry = kind;
  await act(async () => listeners.forEach((fn) => fn()));
};
const page = (name: string) =>
  function Page() {
    return <Text>{`page:${name}`}</Text>;
  };
/** The workout: counts its mounts, and keeps what's typed in it. */
let mockWorkoutMounts = 0;
function Workout() {
  const [typed] = React.useState(() => `typed-${++mockWorkoutMounts}`);
  return <Text>{`page:workout ${typed}`}</Text>;
}
const routes = {
  _layout: Layout,
  // As the real tabs layout: wrapped in the same guard.
  "(tabs)/_layout": () => {
    const { Slot } = jest.requireActual("expo-router");
    return (
      <TabsGuard>
        <Slot />
      </TabsGuard>
    );
  },
  "(tabs)/index": page("home"),
  "(tabs)/profile": page("you"),
  history: page("history"),
  account: page("account"),
  workout: Workout,
  onboarding: page("onboarding"),
  welcome: page("welcome"),
  "sign-in": page("sign-in"),
  "create-account": page("create-account"),
  "account-check": page("account-check"),
};

beforeEach(() => {
  mockEntry = "signedOut";
  mockWorkoutMounts = 0;
  listeners.clear();
});

test("signed out: Welcome, never Home; training deep links lead to Welcome", async () => {
  const view = await renderRouter(routes, { initialUrl: "/" });
  expect(view.getPathname()).toBe("/welcome");
  expect(screen.queryByText("page:home")).toBeNull();
  await act(async () => {
    const { router } = jest.requireActual("expo-router");
    router.push("/history");
  });
  expect(view.getPathname()).toBe("/welcome");
  expect(screen.queryByText("page:history")).toBeNull();
});

test("a deep link into training while signed out shows Welcome instead", async () => {
  const view = await renderRouter(routes, { initialUrl: "/history" });
  expect(view.getPathname()).toBe("/welcome");
  expect(screen.queryByText("page:history")).toBeNull();
});

test("sign-in screens are reachable while signed out", async () => {
  const view = await renderRouter(routes, { initialUrl: "/welcome" });
  await act(async () => {
    const { router } = jest.requireActual("expo-router");
    router.push("/sign-in");
  });
  expect(view.getPathname()).toBe("/sign-in");
  expect(screen.getByText("page:sign-in")).toBeTruthy();
});

test("signing in moves to setup or Home; setup never flashes Home", async () => {
  const view = await renderRouter(routes, { initialUrl: "/welcome" });
  await set("setup");
  expect(view.getPathname()).toBe("/onboarding");
  expect(screen.queryByText("page:home")).toBeNull();
  await set("ready");
  expect(view.getPathname()).toBe("/");
  expect(screen.getByText("page:home")).toBeTruthy();
});

test("a returning, set-up athlete opens straight into Home", async () => {
  mockEntry = "ready";
  const view = await renderRouter(routes, { initialUrl: "/" });
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText("page:welcome")).toBeNull();
  expect(screen.queryByText("page:onboarding")).toBeNull();
});

test("signing out from inside the app returns to Welcome", async () => {
  mockEntry = "ready";
  const view = await renderRouter(routes, { initialUrl: "/account" });
  expect(view.getPathname()).toBe("/account");
  await set("signedOut");
  expect(view.getPathname()).toBe("/welcome");
  expect(screen.queryByText("page:account")).toBeNull();
});

test("account checks (unlinked, other account, unavailable) hold every other screen", async () => {
  for (const kind of [
    "unlinked",
    "otherAccount",
    "unconfigured",
    "misconfigured",
    "recovery",
  ] as const) {
    mockEntry = kind;
    const view = await renderRouter(routes, { initialUrl: "/history" });
    expect(view.getPathname()).toBe("/account-check");
    expect(screen.queryByText("page:history")).toBeNull();
    await view.unmount();
  }
});

test("a set-up athlete can't reopen onboarding; deleting local data returns to it", async () => {
  mockEntry = "ready";
  const view = await renderRouter(routes, { initialUrl: "/onboarding" });
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText("page:onboarding")).toBeNull();
  // Account & privacy → Delete all local data: still signed in, setup again.
  await set("setup");
  expect(view.getPathname()).toBe("/onboarding");
  expect(screen.queryByText("page:home")).toBeNull();
});

// ---- Phase 7.8E, Stage 4: signed out without asking, mid-workout ----------

const go = (path: string) =>
  act(async () => {
    const { router } = jest.requireActual("expo-router");
    router.push(path);
  });

test("signed out mid-workout: the workout stays open, the same screen, with nothing lost", async () => {
  mockEntry = "ready";
  const view = await renderRouter(routes, { initialUrl: "/" });
  await go("/workout");
  expect(screen.getByText("page:workout typed-1")).toBeTruthy();
  await set("continuing");
  expect(view.getPathname()).toBe("/workout");
  // Not remounted: what was on screen (an unsaved set, a rest timer) stays.
  expect(screen.getByText("page:workout typed-1")).toBeTruthy();
  expect(mockWorkoutMounts).toBe(1);
  // Back in with the same account: still the same workout screen.
  await set("ready");
  expect(view.getPathname()).toBe("/workout");
  expect(mockWorkoutMounts).toBe(1);
});

test("while continuing, everything but the workout and the way back in leads to Welcome", async () => {
  mockEntry = "continuing";
  const view = await renderRouter(routes, { initialUrl: "/" });
  expect(view.getPathname()).toBe("/welcome");
  for (const path of [
    "/history",
    "/account",
    "/(tabs)/profile",
    "/account-check",
    "/onboarding",
  ]) {
    await go(path);
    expect(view.getPathname()).toBe("/welcome");
  }
  expect(screen.queryByText("page:home")).toBeNull();
  expect(screen.queryByText("page:history")).toBeNull();
  expect(screen.queryByText("page:account")).toBeNull();
  await go("/sign-in");
  expect(view.getPathname()).toBe("/sign-in");
  await go("/workout");
  expect(view.getPathname()).toBe("/workout");
});

test("continuing ends: signed in as another account, the account check holds; signed out, Welcome", async () => {
  mockEntry = "continuing";
  const view = await renderRouter(routes, { initialUrl: "/workout" });
  expect(view.getPathname()).toBe("/workout");
  await set("otherAccount");
  expect(view.getPathname()).toBe("/account-check");
  expect(screen.queryByText(/page:workout/)).toBeNull();
  await set("signedOut");
  expect(view.getPathname()).toBe("/welcome");
  await go("/workout");
  expect(view.getPathname()).toBe("/welcome");
});

test("Back from the workout while continuing never shows Home: it leads to Welcome", async () => {
  mockEntry = "ready";
  const view = await renderRouter(routes, { initialUrl: "/" });
  await go("/workout");
  await set("continuing");
  await act(async () => {
    const { router } = jest.requireActual("expo-router");
    router.back();
  });
  expect(view.getPathname()).toBe("/welcome");
  expect(screen.queryByText("page:home")).toBeNull();
  // And the workout is still there to return to.
  await go("/workout");
  expect(view.getPathname()).toBe("/workout");
});
