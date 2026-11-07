import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { membershipOffer } from "../../src/billing/offer";
import type { StoreProduct } from "../../src/billing/plan";
import type { PaywallState } from "../../src/billing/paywall";
import { PaywallScreen } from "../../src/screens/membership/Paywall";

// Forge Premium's floating action with motion on, as most athletes have it
// (the other UI suites run with Reduce Motion): arriving from the reveal it
// waits, then fades in, and it can't be pressed until it has appeared. A
// second tap on the reveal's Continue must never land on an invisible
// "Not now" or "Start free trial" (Phase 9.5 review, F1).

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const { useRef } = jest.requireActual("react");
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => false,
    // Stable for the component's life, as Reanimated's shared values are.
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
    withDelay: (_ms: number, value: number) => value,
  };
});

const MEMBERSHIP: StoreProduct = {
  id: "forge.membership.monthly",
  title: "Forge Premium",
  priceString: "$6.99",
  price: 6.99,
  currency: "USD",
  period: { unit: "month", count: 1 },
  introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 1 },
};
const result = membershipOffer(MEMBERSHIP, "eligible");
if (!result.ok) throw new Error(result.problems.join("; "));
const ready: PaywallState = { kind: "ready", offer: result.offer };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function paywall(arrival: "continue" | "settle") {
  const actions = {
    onBack: jest.fn(),
    onPurchase: jest.fn(),
    onRestore: jest.fn(),
    onCheck: jest.fn(),
    onRetry: jest.fn(),
    onDecline: jest.fn(),
  };
  const view = await render(
    <PaywallScreen state={ready} legal={{}} arrival={arrival} {...actions} />,
  );
  const hidden = { includeHiddenElements: true };
  const layout = (testID: string, y: number, height = 0) =>
    act(async () =>
      fireEvent(view.getByTestId(testID, hidden), "layout", {
        nativeEvent: { layout: { x: 0, y, width: 390, height } },
      }),
    );
  // A phone where the decision is far below the first view.
  await layout("premium-scroll", 0, 700);
  await layout("premium-dock", 520, 180);
  await layout("premium-dock-action", 28);
  await layout("paywall-actions", 1500);
  await layout("paywall-action", 0);
  const pointerEvents = () =>
    view.getByTestId("premium-dock", hidden).props.pointerEvents as string;
  const after = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  const scrollTo = (y: number) =>
    act(async () =>
      fireEvent.scroll(view.getByTestId("premium-scroll"), {
        nativeEvent: { contentOffset: { x: 0, y } },
      }),
    );
  return { pointerEvents, after, scrollTo };
}

test("from the reveal, the floating action can't be pressed until it has appeared", async () => {
  const { pointerEvents, after } = await paywall("continue");
  // Measured and in place, but still waiting for the composition: invisible.
  expect(pointerEvents()).toBe("none");
  await after(640 + 260 - 1);
  expect(pointerEvents()).toBe("none");
  await after(1);
  expect(pointerEvents()).toBe("box-none");
});

test("stepping aside is at once; coming back, it can be pressed once it has faded in", async () => {
  const { pointerEvents, after, scrollTo } = await paywall("settle");
  expect(pointerEvents()).toBe("none");
  await after(260);
  expect(pointerEvents()).toBe("box-none");
  // The decision's own action reaches the floating one's place.
  await scrollTo(904);
  expect(pointerEvents()).toBe("none");
  // Back up: it fades in again before it can be pressed.
  await scrollTo(0);
  expect(pointerEvents()).toBe("none");
  await after(260);
  expect(pointerEvents()).toBe("box-none");
});
