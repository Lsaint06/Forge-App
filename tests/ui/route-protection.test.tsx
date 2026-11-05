import React from "react";
import { Text } from "react-native";
import { renderRouter, screen } from "expo-router/testing-library";
import { AppStack, TabsGuard } from "../../src/auth/AppStack";
import { entryRoute, type Entry } from "../../src/auth/entry";

// Phase 9.2: every route, in every entry state, with real Expo Router
// routing. A route opens only in the states its group allows; anything else
// lands on the state's own screen, so deep links, old sessions and restarts
// can't reach training before setup (or after sign-out). Every route file is
// listed here: tests/route-inventory.test.ts checks that each is registered,
// protected, in the route stack.

let mockEntry: Entry["kind"] = "signedOut";
const page = (name: string) =>
  function Page() {
    return <Text>{`page:${name}`}</Text>;
  };
const routes = {
  _layout: () => <AppStack entry={mockEntry} />,
  "(tabs)/_layout": () => {
    const { Slot } = jest.requireActual("expo-router");
    return (
      <TabsGuard>
        <Slot />
      </TabsGuard>
    );
  },
  "(tabs)/index": page("home"),
  "(tabs)/train": page("train"),
  "(tabs)/nutrition": page("nutrition"),
  "(tabs)/progress": page("progress"),
  "(tabs)/profile": page("you"),
  workout: page("workout"),
  journal: page("journal"),
  templates: page("templates"),
  history: page("history"),
  records: page("records"),
  calendar: page("calendar"),
  explore: page("explore"),
  paths: page("paths"),
  "forge-paths/index": page("forge-paths"),
  "forge-paths/[programId]": page("program"),
  "forge-paths/current": page("current-program"),
  exercise: page("exercise"),
  account: page("account"),
  "delete-account": page("delete-account"),
  preferences: page("preferences"),
  "design-system": page("design-system"),
  "onboarding-preview": page("onboarding-preview"),
  onboarding: page("onboarding"),
  welcome: page("welcome"),
  "sign-in": page("sign-in"),
  "create-account": page("create-account"),
  "account-check": page("account-check"),
};

const TRAINING = [
  "/",
  "/train",
  "/nutrition",
  "/progress",
  "/profile",
  "/journal",
  "/templates",
  "/history",
  "/records",
  "/calendar",
  "/explore",
  "/paths",
  "/forge-paths",
  "/forge-paths/forge-strength-beginner-3-day",
  "/forge-paths/current",
  "/exercise",
  "/account",
  "/delete-account",
  "/preferences",
  "/design-system",
  "/onboarding-preview",
];
const SIGN_IN = ["/welcome", "/sign-in", "/create-account"];
const ALL = [
  ...TRAINING,
  "/workout",
  "/onboarding",
  ...SIGN_IN,
  "/account-check",
];

/** What each entry state may open; everything else leads to its screen. */
const OPENS: Record<Entry["kind"], string[]> = {
  initializing: ["/account-check"],
  unconfigured: ["/account-check"],
  misconfigured: ["/account-check"],
  recovery: ["/account-check"],
  otherAccount: ["/account-check"],
  unlinked: ["/account-check"],
  signedOut: SIGN_IN,
  // Stage 4: only the workout and the way back in; the tabs lead to Welcome.
  continuing: ["/workout", ...SIGN_IN],
  setup: ["/onboarding"],
  ready: [...TRAINING, "/workout"],
};

// About 300 real router renders (every entry state × every route): about
// 2.5 s on its own, so it gets room beyond Jest's 5 s default on a busy
// machine.
const SWEEP_MS = 30_000;

test(
  "each entry state opens exactly its own routes; every other route leads to its screen",
  async () => {
    for (const kind of Object.keys(OPENS) as Entry["kind"][]) {
      mockEntry = kind;
      for (const path of ALL) {
        const view = await renderRouter(routes, { initialUrl: path });
        const expected = OPENS[kind].includes(path) ? path : entryRoute(kind);
        expect(`${kind} ${path} → ${view.getPathname()}`).toBe(
          `${kind} ${path} → ${expected}`,
        );
        await view.unmount();
      }
    }
  },
  SWEEP_MS,
);

test(
  "before setup is done, no training screen is ever rendered",
  async () => {
    for (const kind of [
      "setup",
      "signedOut",
      "unlinked",
      "otherAccount",
    ] as const) {
      mockEntry = kind;
      for (const path of [...TRAINING, "/workout"]) {
        const view = await renderRouter(routes, { initialUrl: path });
        for (const name of [
          "home",
          "train",
          "workout",
          "forge-paths",
          "program",
          "onboarding-preview",
        ])
          expect(screen.queryByText(`page:${name}`)).toBeNull();
        await view.unmount();
      }
    }
  },
  SWEEP_MS,
);

test("setup's route and the sign-in screens close once setup is done", async () => {
  mockEntry = "ready";
  for (const path of ["/onboarding", ...SIGN_IN, "/account-check"]) {
    const view = await renderRouter(routes, { initialUrl: path });
    expect(view.getPathname()).toBe("/");
    expect(screen.getByText("page:home")).toBeTruthy();
    await view.unmount();
  }
});
