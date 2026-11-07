import React from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { pathRepository } from "../path-fixture";
import { billing, MEMBERSHIP as STORE_MEMBERSHIP } from "../billing-fixture";
import { SetupOnboarding } from "../../src/screens/onboarding/Flow";
import {
  ONBOARDING_KEY,
  readProgress,
  writeProgress,
} from "../../src/domain/onboarding/journey";
import {
  PASS_NOTE,
  PREMIUM_KEEPS,
  premiumPath,
  premiumStory,
} from "../../src/domain/onboarding/premium";
import { restDayNames } from "../../src/domain/profile";
import { membershipOffer } from "../../src/billing/offer";
import type { StoreProduct } from "../../src/billing/plan";
import { UNCONFIRMED_TEXT, type PaywallState } from "../../src/billing/paywall";
import type { BillingDeps, Verification } from "../../src/billing/service";
import { PaywallScreen } from "../../src/screens/membership/Paywall";
import { PathPass } from "../../src/screens/membership/Premium";
import MembershipPreview from "../../src/screens/membership/Preview";
import { usePaywall } from "../../src/screens/membership/usePaywall";
import { MembershipCard } from "../../src/screens/you/account";
import { programLibrary } from "../../src/programs";
import { publishedPrograms } from "../../src/domain/programs/model";
import { exercises } from "../../src/data/catalog";

// Phase 9.3: Forge Premium's paywall as the athlete sees it (Apple's
// disclosures, every state, the price as the most prominent price), the
// membership step after the reveal only when Setup hands one in, the
// development preview, and You → Account's card unchanged while membership
// is off.

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
let mockRepo: ReturnType<typeof pathRepository>;
jest.mock("../../src/data/native", () => ({
  initializeRepository: async () => {},
  repository: () => mockRepo.r,
}));
// You → Account's card while membership is on: the runtime, the session and
// the membership answers stand in, only while `mockCard.on`.
const mockCard = {
  on: false,
  asked: 0,
  answers: [] as Promise<Verification>[],
};
// usePaywall itself, against the Node tests' fake store and server: the
// runtime hands those in only while `mockHook.deps` is set.
const mockHook: { deps?: BillingDeps } = {};
jest.mock("../../src/billing/runtime", () => {
  const actual = jest.requireActual<typeof import("../../src/billing/runtime")>(
    "../../src/billing/runtime",
  );
  return {
    ...actual,
    membership: () =>
      mockHook.deps ? { mode: "development" } : actual.membership(),
    membershipEnabled: () => mockCard.on || actual.membershipEnabled(),
    membershipDeps: () =>
      mockHook.deps ?? (mockCard.on ? {} : actual.membershipDeps()),
    watchMembershipSession: () =>
      mockCard.on || mockHook.deps
        ? undefined
        : actual.watchMembershipSession(),
  };
});
jest.mock("expo-haptics", () => ({
  ...jest.requireActual("expo-haptics"),
  notificationAsync: jest.fn(async () => {}),
}));
jest.mock("../../src/billing/paywall", () => {
  const actual = jest.requireActual<typeof import("../../src/billing/paywall")>(
    "../../src/billing/paywall",
  );
  return {
    ...actual,
    membershipStatus: (
      ...args: Parameters<typeof actual.membershipStatus>
    ): Promise<Verification> => {
      if (!mockCard.on) return actual.membershipStatus(...args);
      if (args[2] === "held")
        return Promise.resolve({
          access: { kind: "unverified", reason: "missing" },
        });
      mockCard.asked += 1;
      return mockCard.answers.shift() ?? new Promise(() => {});
    },
  };
});
jest.mock("../../src/auth/session", () => {
  const actual = jest.requireActual<typeof import("../../src/auth/session")>(
    "../../src/auth/session",
  );
  return {
    ...actual,
    useEntry: () =>
      mockCard.on
        ? { entry: { kind: "ready", user: { id: "user-a" } } }
        : actual.useEntry(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  mockHook.deps = undefined;
  mockRepo = pathRepository();
  mockRepo.r.setSetting("cloudOwner", "user-a");
});
afterEach(() => mockRepo.db.close());

type View = Awaited<ReturnType<typeof render>>;
const press = (view: View, name: string | RegExp) =>
  act(async () => fireEvent.press(view.getByRole("button", { name })));
const sizeOf = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never)?.fontSize as number;
const fontSize = (view: View, text: string) => sizeOf(view.getByText(text));
const DECLINE = "Not now: continue without membership";

const MEMBERSHIP: StoreProduct = {
  id: "forge.membership.monthly",
  title: "Forge Premium",
  priceString: "$6.99",
  price: 6.99,
  currency: "USD",
  period: { unit: "month", count: 1 },
  introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 1 },
};
const offerFor = (eligibility: "eligible" | "ineligible") => {
  const r = membershipOffer(MEMBERSHIP, eligibility);
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.offer;
};

async function paywall(
  state: PaywallState,
  more: Partial<React.ComponentProps<typeof PaywallScreen>> = {},
  legal: { terms?: string; privacy?: string } = {},
) {
  const actions = {
    onPurchase: jest.fn(),
    onRestore: jest.fn(),
    onCheck: jest.fn(),
    onRetry: jest.fn(),
    onEnter: jest.fn(),
    onBack: jest.fn(),
    ...more,
  };
  const view = await render(
    <PaywallScreen
      state={state}
      legal={legal}
      formatDate={() => "December 4"}
      {...actions}
    />,
  );
  return { view: view as unknown as View, actions };
}

test("the store's price is the most prominent price; the free week a small mark and a timeline", async () => {
  const { view, actions } = await paywall({
    kind: "ready",
    offer: offerFor("eligible"),
  });
  expect(view.getByTestId("premium-plan")).toBeTruthy();
  expect(view.getByText("$6.99")).toBeTruthy();
  expect(view.getByText("per month")).toBeTruthy();
  // One line beside the price, or two on a compact phone or with large
  // text (the test renderer's text is large).
  expect(
    view.getByText(/^Renews monthly(?: · c| C)ancel anytime$/),
  ).toBeTruthy();
  // Apple: the billing amount is the most prominent pricing element, here
  // and in the floating action.
  const prices = view.getAllByText("$6.99", { includeHiddenElements: true });
  expect(prices).toHaveLength(2);
  const [plan, floating] = prices.map(sizeOf);
  expect(plan).toBeGreaterThan(floating!);
  expect(plan).toBeGreaterThan(2 * fontSize(view, "7 days free"));
  expect(floating).toBeGreaterThan(fontSize(view, "7 days free"));
  expect(
    view.getByLabelText(
      /^Your plan, selected: Forge Premium: \$6\.99 a month, after 7 days free\. 7 days free, then \$6\.99 a month\. Cancel anytime\.$/,
    ),
  ).toBeTruthy();
  // How the free week runs, before anything is bought.
  expect(
    view.getByLabelText(
      "Today: Your free week begins. After 7 days: $6.99, then monthly. Anytime: Cancel in Settings.",
    ),
  ).toBeTruthy();
  expect(
    view.getByText(/Forge Premium · auto-renewing, every month/),
  ).toBeTruthy();
  // Renewal and cancellation before anything is bought.
  expect(
    view.getByText(/Your Apple Account is charged when the free week ends/),
  ).toBeTruthy();
  expect(view.getByText(/at least 24 hours before a renewal/)).toBeTruthy();
  expect(
    view.getByText(/Canceling keeps Forge Premium until the end of the period/),
  ).toBeTruthy();
  // What it includes, in the founder-approved words (2026-11-07): only what
  // Forge does.
  for (const [title, sentence] of [
    [
      "Personalized Training",
      "Programs tailored to your goals, experience, and schedule.",
    ],
    [
      "Workout Tracking",
      "Log sets, monitor performance, and track every workout.",
    ],
    [
      "Performance Analytics",
      "Visualize strength progression, personal records, and training consistency.",
    ],
    [
      "Nutrition Tracking",
      "Track calories and macronutrients with an extensive food database.",
    ],
  ] as const) {
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(sentence)).toBeTruthy();
  }
  await press(view, "Start free trial");
  expect(actions.onPurchase).toHaveBeenCalledTimes(1);
  await press(view, "Restore purchases");
  expect(actions.onRestore).toHaveBeenCalledTimes(1);
});

test("without the free week, nothing mentions one", async () => {
  const { view } = await paywall({
    kind: "ready",
    offer: offerFor("ineligible"),
  });
  expect(view.getByRole("button", { name: "Subscribe" })).toBeTruthy();
  expect(view.queryByText(/free/i)).toBeNull();
  expect(view.queryByText(/free/i, { includeHiddenElements: true })).toBeNull();
  expect(view.queryByTestId("premium-timeline")).toBeNull();
  expect(
    view.getByText(/charged to your Apple Account when you confirm/),
  ).toBeTruthy();
});

test("while the App Store's offer loads, nothing can be bought and no price or free week is claimed", async () => {
  const onDecline = jest.fn();
  const { view, actions } = await paywall({ kind: "loading" }, { onDecline });
  const hidden = { includeHiddenElements: true };
  // The plan's place is held, said as what it is.
  expect(view.getByLabelText("Loading the App Store's price")).toBeTruthy();
  expect(view.queryByTestId("premium-plan")).toBeNull();
  // No price, and no free week, anywhere: not even in the floating copy.
  expect(view.queryByText(/\$\d/, hidden)).toBeNull();
  expect(view.queryByText(/free/i, hidden)).toBeNull();
  expect(view.queryByTestId("premium-timeline")).toBeNull();
  // The action waits.
  expect(
    view.getByRole("button", { name: "Loading the offer…" }).props
      .accessibilityState,
  ).toMatchObject({ disabled: true, busy: true });
  expect(view.queryByRole("button", { name: "Start free trial" })).toBeNull();
  // A slow store never traps the athlete in setup.
  await press(view, "Not now: continue without membership");
  expect(onDecline).toHaveBeenCalledTimes(1);
  expect(actions.onPurchase).not.toHaveBeenCalled();
});

test("Terms of Use and Privacy Policy open their addresses; without them the paywall says they're required", async () => {
  const offer = offerFor("eligible");
  const missing = await paywall({ kind: "ready", offer });
  expect(missing.view.getByTestId("paywall-legal-missing")).toBeTruthy();
  expect(missing.view.queryByRole("link")).toBeNull();
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const { view } = await paywall(
    { kind: "ready", offer },
    {},
    {
      terms: "https://forge.example/terms",
      privacy: "https://forge.example/privacy",
    },
  );
  expect(view.queryByTestId("paywall-legal-missing")).toBeNull();
  expect(view.getByText("Terms")).toBeTruthy();
  expect(view.getByText("Privacy")).toBeTruthy();
  await act(async () =>
    fireEvent.press(view.getByRole("link", { name: "Terms of Use" })),
  );
  await act(async () =>
    fireEvent.press(view.getByRole("link", { name: "Privacy Policy" })),
  );
  expect(open.mock.calls).toEqual([
    ["https://forge.example/terms"],
    ["https://forge.example/privacy"],
  ]);
  open.mockRestore();
});

test("while Apple or the server answers, nothing can be pressed twice", async () => {
  const offer = offerFor("eligible");
  for (const [step, title] of [
    ["purchasing", "Opening the App Store…"],
    ["restoring", "Restoring purchases…"],
    ["verifying", "Confirming your membership…"],
  ] as const) {
    const { view } = await paywall(
      { kind: "busy", offer, step },
      { onDecline: jest.fn() },
    );
    // Everything stays where it was, so nothing jumps, but waits.
    for (const name of [title, "Restore purchases", DECLINE])
      expect(
        view.getByRole("button", { name }).props.accessibilityState,
      ).toMatchObject({ disabled: true });
  }
});

test("two quick taps open Apple's sheet once: the purchase is under way from the first", async () => {
  const { deps, phone, store } = billing();
  mockHook.deps = {
    ...deps,
    provider: { ...deps.provider, membership: async () => STORE_MEMBERSHIP },
  };
  const { result } = await renderHook(() => usePaywall(phone.user));
  await waitFor(() => expect(result.current.state.kind).toBe("ready"));
  await act(async () => {
    void result.current.purchase();
    void result.current.purchase();
  });
  await waitFor(() => expect(result.current.state.kind).toBe("member"));
  expect(store.log.filter((line) => line.startsWith("purchase"))).toEqual([
    `purchase ${STORE_MEMBERSHIP.id}`,
  ]);
});

test("waiting for approval or the server: said plainly, with a way to check again", async () => {
  const offer = offerFor("eligible");
  const pending = await paywall({ kind: "pending", offer });
  expect(pending.view.getByText("Waiting for approval")).toBeTruthy();
  await press(pending.view, "Check again");
  expect(pending.actions.onCheck).toHaveBeenCalledTimes(1);
  const unconfirmed = await paywall({
    kind: "unconfirmed",
    offer,
    text: UNCONFIRMED_TEXT.unavailable,
  });
  expect(unconfirmed.view.getByText("Not confirmed yet")).toBeTruthy();
  expect(
    unconfirmed.view.getByRole("button", { name: "Restore purchases" }),
  ).toBeTruthy();
});

test("a failure is an error line above the button; a restore that found nothing is a note", async () => {
  const offer = offerFor("eligible");
  const failed = await paywall({
    kind: "ready",
    offer,
    notice: {
      tone: "error",
      text: "You're offline. Connect to the internet and try again.",
    },
  });
  expect(failed.view.getByRole("alert")).toBeTruthy();
  const none = await paywall({
    kind: "ready",
    offer,
    notice: {
      tone: "info",
      text: "No Forge Premium membership was found for this Apple Account.",
    },
  });
  expect(none.view.getByTestId("paywall-notice")).toBeTruthy();
  expect(none.view.queryByRole("alert")).toBeNull();
});

test("once the server confirms, Forge opens from here", async () => {
  const { view, actions } = await paywall({
    kind: "member",
    access: {
      kind: "granted",
      status: "trial",
      until: Date.now(),
      renews: true,
    },
    via: "purchase",
  });
  expect(view.getByText("Your free week has started")).toBeTruthy();
  expect(view.getByText(/Your free week ends on December 4/)).toBeTruthy();
  expect(view.queryByRole("button", { name: "Restore purchases" })).toBeNull();
  await press(view, "Enter Forge");
  expect(actions.onEnter).toHaveBeenCalledTimes(1);
});

test("a purchase or restore just confirmed is marked by one success haptic; a membership already held is simply shown", async () => {
  const access = {
    kind: "granted" as const,
    status: "active" as const,
    until: Date.now(),
    renews: true,
  };
  for (const [via, title, haptics] of [
    ["purchase", "Welcome to Forge Premium", 1],
    ["restore", "Your membership is restored", 2],
    ["held", "You're a Forge Premium member", 2],
  ] as const) {
    const { view } = await paywall({ kind: "member", access, via });
    expect(view.getByText(title)).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(haptics);
  }
});

test("Forge Premium presents the athlete's own Forge Path as its pass; without one it presents the membership", async () => {
  const offer = offerFor("eligible");
  const program = publishedPrograms(programLibrary).find(
    (p) => p.durationWeeks !== undefined,
  )!;
  const path = premiumPath(program, "Sam", 6);
  const { view: own } = await paywall({ kind: "ready", offer }, { path });
  expect(own.getByTestId("premium-pass")).toBeTruthy();
  for (const text of [path.builtFor, path.title, path.meta, PASS_NOTE])
    expect(own.getByText(text)).toBeTruthy();
  expect(
    own.getByRole("header", {
      name: `All ${program.durationWeeks} weeks. All of Forge`,
    }),
  ).toBeTruthy();
  expect(own.getByText(premiumStory(path).support)).toBeTruthy();
  // Each training day by its focus and size.
  for (const d of path.days)
    expect(
      own.getByLabelText(
        `${restDayNames[d.day]}: ${d.title}${d.focus ? `, ${d.focus}` : ""}. ${d.exercises} exercises.`,
      ),
    ).toBeTruthy();
  // Everything the membership includes, each tile read as its title and
  // its sentence, and the decision after it.
  for (const keep of Object.values(PREMIUM_KEEPS))
    expect(own.getByLabelText(`${keep.title}. ${keep.detail}`)).toBeTruthy();
  expect(own.getByRole("header", { name: "Your membership" })).toBeTruthy();
  const { view: generic } = await paywall({ kind: "ready", offer });
  expect(generic.queryByTestId("premium-pass")).toBeNull();
  expect(
    generic.getByRole("header", { name: "One membership. All of Forge" }),
  ).toBeTruthy();
  expect(generic.getByText(PREMIUM_KEEPS.plan.title)).toBeTruthy();
});

test("however the titles wrap, each row's sentences start on one line", async () => {
  // The test renderer's phone is wide enough for two tiles a row.
  const { view } = await paywall({
    kind: "ready",
    offer: offerFor("eligible"),
  });
  const level = (title: string) => {
    for (let n = view.getByText(title).parent; n; n = n.parent) {
      const style = StyleSheet.flatten(n.props.style);
      if (style && "minHeight" in style) return style.minHeight;
    }
  };
  const measure = (title: string, height: number) => {
    // Each title is measured by the view around it.
    let box = view.getByText(title).parent;
    while (box && !box.props.onLayout) box = box.parent;
    if (!box) throw new Error(`Nothing measures ${title}`);
    return act(async () =>
      fireEvent(box, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 140, height } },
      }),
    );
  };
  // One title wraps onto two lines; its neighbour fits on one.
  await measure("Personalized Training", 40);
  await measure("Workout Tracking", 20);
  expect(level("Personalized Training")).toBe(40);
  expect(level("Workout Tracking")).toBe(40);
  // The next row keeps its own.
  await measure("Performance Analytics", 20);
  await measure("Nutrition Tracking", 20);
  expect(level("Performance Analytics")).toBe(20);
  expect(level("Nutrition Tracking")).toBe(20);
});

test("the pass never shows an exercise, set or rep: only each day's focus and size (all 18)", async () => {
  const names = new Map(exercises.map((e) => [e.id, e.name.toLowerCase()]));
  const texts = (node: unknown): string[] => {
    if (typeof node === "string") return [node];
    if (Array.isArray(node)) return node.flatMap(texts);
    if (node && typeof node === "object" && "children" in node)
      return texts((node as { children: unknown }).children);
    return [];
  };
  for (const program of publishedPrograms(programLibrary)) {
    const view = (await render(
      <PathPass path={premiumPath(program, "Sam", 6)} arrival="settle" />,
    )) as unknown as View;
    const shown = texts(view.toJSON())
      .join(" ")
      .replace(PASS_NOTE, "")
      .toLowerCase();
    for (const item of program.phases.flatMap((p) =>
      p.sessions.flatMap((s) => s.exercises),
    ))
      expect(shown).not.toContain(names.get(item.exerciseId));
    expect(shown).not.toMatch(/×|\brir\b|\bsets?\b|\breps?\b|\d+\s*[x×]\s*\d+/);
    expect(view.getAllByText(/^exercises?$/).length).toBe(program.daysPerWeek);
    await view.unmount();
  }
});

test("setup's step offers the way on without a membership, but not to a member or outside setup", async () => {
  const offer = offerFor("eligible");
  for (const [state, name] of [
    [{ kind: "ready", offer }, DECLINE],
    [{ kind: "pending", offer }, DECLINE],
    [{ kind: "unconfirmed", offer, text: UNCONFIRMED_TEXT.offline }, DECLINE],
    // Nothing to buy: going on is the way, drawn as a button.
    [
      { kind: "unavailable", text: "Not in this build.", retry: false },
      "Continue without membership",
    ],
    [
      { kind: "unavailable", text: "Not in this build.", retry: true },
      "Continue without membership",
    ],
  ] as const) {
    const onDecline = jest.fn();
    const { view } = await paywall(state, { onDecline });
    expect(view.getAllByTestId("paywall-decline")).toHaveLength(1);
    await press(view, name);
    expect(onDecline).toHaveBeenCalledTimes(1);
  }
  const member = await paywall(
    {
      kind: "member",
      access: {
        kind: "granted",
        status: "trial",
        until: Date.now(),
        renews: true,
      },
      via: "purchase",
    },
    { onDecline: jest.fn() },
  );
  expect(member.view.queryByTestId("paywall-decline")).toBeNull();
  const standalone = await paywall({ kind: "ready", offer });
  expect(standalone.view.queryByTestId("paywall-decline")).toBeNull();
});

test("nothing to buy here: why, and a retry only when it can help", async () => {
  const retry = await paywall({
    kind: "unavailable",
    text: "The App Store has no Forge Premium membership to show yet.",
    retry: true,
  });
  expect(
    retry.view.getByText("Forge Premium isn't available here"),
  ).toBeTruthy();
  await press(retry.view, "Try again");
  expect(retry.actions.onRetry).toHaveBeenCalledTimes(1);
  const final = await paywall({
    kind: "unavailable",
    text: "Not in this build.",
    retry: false,
  });
  expect(final.view.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("the Test Store says before anything is tapped that its purchases unlock nothing", async () => {
  const { view } = await paywall(
    { kind: "ready", offer: offerFor("eligible") },
    { simulated: true },
  );
  expect(view.getByTestId("paywall-simulated")).toBeTruthy();
  expect(
    view.getByText(/purchases are simulated and never unlock Forge/),
  ).toBeTruthy();
});

test("one action on screen at a time: the floating copy steps aside where the decision's own action arrives", async () => {
  const { view, actions } = await paywall(
    { kind: "ready", offer: offerFor("eligible") },
    { onDecline: jest.fn() },
  );
  const hidden = { includeHiddenElements: true };
  // Screen readers meet each action once: the floating copy is hidden.
  expect(
    view.getAllByRole("button", { name: "Start free trial" }),
  ).toHaveLength(1);
  expect(
    view.getAllByRole("button", { name: "Start free trial", ...hidden }),
  ).toHaveLength(2);
  const dock = () => view.getByTestId("premium-dock", hidden).props;
  const layout = (testID: string, y: number, height = 0) =>
    act(async () =>
      fireEvent(view.getByTestId(testID, hidden), "layout", {
        nativeEvent: { layout: { x: 0, y, width: 390, height } },
      }),
    );
  const scrollTo = (y: number) =>
    act(async () =>
      fireEvent.scroll(view.getByTestId("premium-scroll"), {
        nativeEvent: { contentOffset: { x: 0, y } },
      }),
    );
  // Until everything is measured, the floating copy can't be pressed.
  expect(dock().pointerEvents).toBe("none");
  await layout("premium-scroll", 0, 700);
  await layout("premium-dock", 520, 180);
  // Measured in the dock's body, under its 48 pt fade.
  await layout("premium-dock-action", 28);
  await layout("paywall-actions", 1500);
  await layout("paywall-action", 0);
  // The decision is far below: the floating action is there to press.
  expect(dock().pointerEvents).toBe("box-none");
  await act(async () =>
    fireEvent.press(
      view.getAllByRole("button", { name: "Start free trial", ...hidden })[1]!,
    ),
  );
  expect(actions.onPurchase).toHaveBeenCalledTimes(1);
  // The decision's action reaches the floating one's place
  // (700 - 180 + 48 + 28 below the top of the scroll).
  await scrollTo(903);
  expect(dock().pointerEvents).toBe("box-none");
  await scrollTo(904);
  expect(dock().pointerEvents).toBe("none");
  // It returns only once the decision is well below again.
  await scrollTo(870);
  expect(dock().pointerEvents).toBe("none");
  await scrollTo(860);
  expect(dock().pointerEvents).toBe("box-none");
});

// ---- The membership step after the reveal ------------------------------------------

function atReveal() {
  const program = publishedPrograms(programLibrary)[0]!;
  mockRepo.r.saveProfile({
    name: "Sam",
    height: 180,
    weight: 80,
    experience: program.experience,
    goal: program.goal,
    frequency: program.daysPerWeek,
    restDay: 6,
  });
  mockRepo.r.setSetting(
    ONBOARDING_KEY,
    writeProgress({ stage: "reveal", days: program.daysPerWeek }),
  );
}
const account = { who: "a@example.com", onNotYou: jest.fn() };
const stage = () => readProgress(mockRepo.r.setting(ONBOARDING_KEY)).stage;

test("without a membership step the reveal still ends setup, exactly as approved", async () => {
  atReveal();
  const view = (await render(
    <SetupOnboarding account={account} />,
  )) as unknown as View;
  expect(view.getByRole("button", { name: "Enter Forge" })).toBeTruthy();
  expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
});

test("with one, the reveal continues to it, Back returns, and Forge opens when it says so", async () => {
  atReveal();
  const step = jest.fn(
    ({ onBack, onDone }: { onBack: () => void; onDone: () => void }) => (
      <>
        <Text>Membership step</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to reveal"
          onPress={onBack}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Membership verified"
          onPress={onDone}
        />
      </>
    ),
  );
  const view = (await render(
    <SetupOnboarding account={account} membership={step} />,
  )) as unknown as View;
  expect(view.queryByRole("button", { name: "Enter Forge" })).toBeNull();
  await press(view, "Continue");
  expect(view.getByText("Membership step")).toBeTruthy();
  // Kept, so a restart resumes at the membership.
  expect(stage()).toBe("membership");
  // Handed the Forge Path just revealed, arriving from it.
  expect(step.mock.calls.at(-1)![0]).toMatchObject({
    account,
    arrival: "continue",
    path: premiumPath(publishedPrograms(programLibrary)[0]!, "Sam", 6),
  });
  await press(view, "Back to reveal");
  expect(stage()).toBe("reveal");
  await press(view, "Continue");
  await press(view, "Membership verified");
  expect(mockRepo.r.profile().onboarded).toBe(true);
  expect(router.replace).toHaveBeenCalledWith("/(tabs)");
});

test("a membership stage kept by a build that had the step is the reveal without it", async () => {
  atReveal();
  mockRepo.r.setSetting(
    ONBOARDING_KEY,
    writeProgress({
      ...readProgress(mockRepo.r.setting(ONBOARDING_KEY)),
      stage: "membership",
    }),
  );
  const view = (await render(
    <SetupOnboarding account={account} />,
  )) as unknown as View;
  expect(view.getByRole("button", { name: "Enter Forge" })).toBeTruthy();
});

test("resumed at the membership, Forge Premium settles in rather than replaying the hand-off", async () => {
  atReveal();
  mockRepo.r.setSetting(
    ONBOARDING_KEY,
    writeProgress({
      ...readProgress(mockRepo.r.setting(ONBOARDING_KEY)),
      stage: "membership",
    }),
  );
  const step = jest.fn((_props: { arrival: string }) => (
    <Text>Membership step</Text>
  ));
  const view = (await render(
    <SetupOnboarding account={account} membership={step} />,
  )) as unknown as View;
  expect(view.getByText("Membership step")).toBeTruthy();
  expect(step.mock.calls.at(-1)![0]).toMatchObject({ arrival: "settle" });
});

// ---- The development preview and You → Account -------------------------------------

test("the development preview walks a purchase through to the member's screen, selling nothing", async () => {
  jest.useFakeTimers();
  try {
    const view = (await render(<MembershipPreview />)) as unknown as View;
    expect(view.getByTestId("onboarding-preview-banner")).toBeTruthy();
    expect(view.getByText("$6.99")).toBeTruthy();
    await press(view, "Start free trial");
    expect(
      view.getByRole("button", { name: "Opening the App Store…" }),
    ).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(1100));
    expect(
      view.getByRole("button", { name: "Confirming your membership…" }),
    ).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(1100));
    expect(view.getByText("Your free week has started")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test("the preview opens on a named state, and a link to another state starts it over", async () => {
  mockParams.current = { state: "pending" };
  const view = (await render(<MembershipPreview />)) as unknown as View;
  expect(view.getByText("Waiting for approval")).toBeTruthy();
  mockParams.current = { state: "member" };
  await view.rerender(<MembershipPreview />);
  expect(view.queryByText("Waiting for approval")).toBeNull();
  expect(view.getByText("Your free week has started")).toBeTruthy();
});

test("You → Account's card is the card it always was while membership is off", async () => {
  const view = (await render(<MembershipCard />)) as unknown as View;
  expect(view.getByText("Membership is on the way")).toBeTruthy();
  expect(view.getByText("Free plan")).toBeTruthy();
  expect(view.queryByText("View Forge Premium")).toBeNull();
});

test("while membership is on, the card waits for the server's answer and can ask again", async () => {
  let answer: (v: Verification) => void = () => {};
  mockCard.on = true;
  mockCard.asked = 0;
  mockCard.answers = [
    new Promise<Verification>((resolve) => (answer = resolve)),
    Promise.resolve({ access: { kind: "denied", reason: "never" } }),
  ];
  try {
    const view = (await render(<MembershipCard />)) as unknown as View;
    // Nothing verified on this phone yet: that isn't an answer to show.
    expect(view.getByText("Checking")).toBeTruthy();
    expect(view.queryByText("Not confirmed")).toBeNull();
    await act(async () =>
      answer({
        access: { kind: "unverified", reason: "missing" },
        problem: "unavailable",
      }),
    );
    expect(view.getByText("Not confirmed")).toBeTruthy();
    expect(view.getByText(UNCONFIRMED_TEXT.unavailable)).toBeTruthy();
    await press(view, "Check again");
    expect(mockCard.asked).toBe(2);
    expect(view.getByText("Not a member")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Check again" })).toBeNull();
  } finally {
    mockCard.on = false;
  }
});
