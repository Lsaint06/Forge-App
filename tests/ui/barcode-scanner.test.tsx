import React from "react";
import { Linking, StyleSheet, type ViewStyle } from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { brandedByBarcode } from "../../src/data/branded-catalog";
import { brandedFood } from "../../src/domain/branded";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";

// Phase 7.3F: the barcode scanner in Add food. expo-camera is replaced at its
// boundary (the camera view and its permission hook), so these tests can
// deliver scans exactly as the native module does. Physical camera reading
// is verified on the founder's iPhone, not here.

type CameraProps = {
  testID?: string;
  active?: boolean;
  enableTorch?: boolean;
  barcodeScannerSettings?: { barcodeTypes: string[] };
  onBarcodeScanned?: (r: { type: string; data: string }) => void;
  onMountError?: (e: { message: string }) => void;
};
type Permission = { granted: boolean; canAskAgain: boolean; status: string };
const mockCamera: {
  props: CameraProps | null;
  mounts: number;
  permission: Permission | null;
  request: jest.Mock;
} = {
  props: null,
  mounts: 0,
  permission: null,
  request: jest.fn(),
};
jest.mock("expo-camera", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  function CameraView(props: CameraProps) {
    mockCamera.props = props;
    React.useEffect(() => {
      mockCamera.mounts++;
      return () => {
        mockCamera.props = null;
      };
    }, []);
    return React.createElement(View, { testID: props.testID });
  }
  return {
    CameraView,
    useCameraPermissions: () => [mockCamera.permission, mockCamera.request],
  };
});
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ kind: "nutrition" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

const today = localDate();
const COKE = brandedFood({
  id: 7,
  fdcId: 2412345,
  name: "Coca-Cola Can, 12 fl oz",
  brand: "Coca-Cola",
  basis: "ml",
  serving: 355,
  household: "1 can",
  kcal: 39.4,
  protein: 0,
  carbs: 10.98,
  fat: 0,
  gtin: "00049000006346",
});
const GRANTED: Permission = {
  granted: true,
  canAskAgain: true,
  status: "granted",
};

let fetchCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockCamera, { props: null, mounts: 0, permission: GRANTED });
  mockCamera.request = jest.fn(async () => GRANTED);
  fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error("offline");
  }) as typeof fetch;
  jest
    .mocked(brandedByBarcode)
    .mockImplementation(async (code) =>
      code.replace(/^0+/, "") === "49000006346" ? COKE : null,
    );
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function setup() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const entries = (r: ReturnType<typeof setup>["r"]) => r.journal("nutrition");
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle;
async function openScanner(view: RenderResult, meal = "Breakfast") {
  await fireEvent.press(view.getByLabelText(`Add to ${meal}`));
  await fireEvent.press(view.getByLabelText("Scan barcode"));
}
/** Delivers camera reads as the native module does (several per frame). */
async function scan(...reads: { type: string; data: string }[]) {
  await act(async () => {
    for (const r of reads) mockCamera.props?.onBarcodeScanned?.(r);
  });
}

test("Add food has a scan button; the scanner opens the back camera for food barcodes only", async () => {
  const { db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    // No camera before scanning is chosen.
    expect(mockCamera.props).toBeNull();
    const button = flat(view.getByLabelText("Scan barcode"));
    expect(Number(button.width)).toBeGreaterThanOrEqual(44);
    expect(Number(button.minHeight)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    expect(view.getByRole("header", { name: "Scan barcode" })).toBeTruthy();
    expect(view.getByTestId("barcode-camera")).toBeTruthy();
    expect(mockCamera.props?.barcodeScannerSettings?.barcodeTypes).toEqual([
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
    ]);
    expect(mockCamera.props?.active).toBe(true);
    expect(mockCamera.request).not.toHaveBeenCalled();
    // Closing the scanner releases the camera.
    await fireEvent.press(view.getByLabelText("Back to foods"));
    expect(mockCamera.props).toBeNull();
    expect(view.getByLabelText("Search foods")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a scanned can opens its product once; nothing is logged until Add, then Undo works", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    // iOS reports a UPC-A can as EAN-13; the camera repeats it every frame.
    await scan(
      { type: "ean13", data: "049000006346" },
      { type: "ean13", data: "049000006346" },
      { type: "ean13", data: "049000006346" },
    );
    expect(brandedByBarcode).toHaveBeenCalledTimes(1);
    expect(brandedByBarcode).toHaveBeenCalledWith("049000006346", undefined);
    // The product step, with the camera released.
    expect(
      view.getByRole("header", { name: "Coca-Cola Can, 12 fl oz" }),
    ).toBeTruthy();
    expect(view.getByText("Coca-Cola")).toBeTruthy();
    expect(mockCamera.props).toBeNull();
    expect(view.getByRole("button", { name: "1 can · 355 ml" })).toBeTruthy();
    expect(
      view.getByLabelText("140 kcal, protein 0 g, carbs 39 g, fat 0 g, 355 ml"),
    ).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
    // Two cans, at lunch.
    for (let i = 0; i < 4; i++)
      await fireEvent.press(view.getByLabelText("Increase Portions by 0.25"));
    await fireEvent.press(view.getByRole("tab", { name: "Lunch" }));
    expect(view.getByText(/Logs to Lunch · Today/)).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
    await fireEvent.press(
      view.getByLabelText("Add Coca-Cola Can, 12 fl oz to Lunch"),
    );
    const [entry] = entries(r);
    expect(entry!.date).toBe(today);
    expect(entry!.data).toMatchObject({
      name: "Coca-Cola Can, 12 fl oz",
      meal: "Lunch",
      quantity: 2,
      serving: "1 can (355 ml)",
      sourceId: "usda-branded:2412345",
      sourceMl: 355,
      sourceBrand: "Coca-Cola",
      sourceBarcode: "00049000006346",
    });
    expect(Number(entry!.data.calories)).toBeCloseTo(139.87, 2);
    // Back in Add food: the scanned add can be undone from the top.
    expect(
      view.getByText("Added Coca-Cola Can, 12 fl oz to Lunch"),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText("Undo adding Coca-Cola Can, 12 fl oz"),
    );
    expect(entries(r)).toHaveLength(0);
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("a second product can be scanned without leaving; Back from a product returns to the camera", async () => {
  const { db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan({ type: "ean13", data: "049000006346" });
    await fireEvent.press(view.getByLabelText("Back to scanner"));
    expect(view.getByTestId("barcode-camera")).toBeTruthy();
    expect(mockCamera.mounts).toBe(2);
    await scan({ type: "upc_e", data: "04252614" });
    // UPC-E is expanded only because the scanner said UPC-E.
    expect(brandedByBarcode).toHaveBeenLastCalledWith("04252614", "upc_e");
    expect(view.getByText("Product not found")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("an unknown barcode is a normal result: scan again, search or create", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan({ type: "ean13", data: "4006381333931" });
    expect(view.getByText("Product not found")).toBeTruthy();
    expect(
      view.getByText(/Barcode 4006381333931 isn’t|Barcode 4006381333931 isn't/),
    ).toBeTruthy();
    // Reading stops until the lifter chooses.
    expect(mockCamera.props?.onBarcodeScanned).toBeUndefined();
    expect(mockCamera.props?.active).toBe(false);
    await fireEvent.press(view.getByRole("button", { name: "Scan again" }));
    expect(mockCamera.props?.onBarcodeScanned).toBeDefined();
    await scan({ type: "ean13", data: "4006381333931" });
    await fireEvent.press(view.getByRole("button", { name: "Search foods" }));
    expect(view.getByLabelText("Search foods")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    await scan({ type: "ean13", data: "4006381333931" });
    await fireEvent.press(view.getByRole("button", { name: "Create food" }));
    expect(view.getByRole("header", { name: "New food" })).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("an unreadable code is refused before any lookup, with retry guidance", async () => {
  const { db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan({ type: "ean13", data: "049000006347" });
    expect(brandedByBarcode).not.toHaveBeenCalled();
    expect(view.getByText("That barcode couldn’t be read")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Scan again" }));
    await scan({ type: "upc_e", data: "425261" });
    expect(brandedByBarcode).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("camera permission: asked once when scanning opens; denied leads to Settings and typing", async () => {
  const { db } = setup();
  try {
    mockCamera.permission = {
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    };
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Breakfast"));
    expect(mockCamera.request).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    expect(mockCamera.request).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("barcode-camera")).toBeNull();
    expect(view.getByText("Camera access is off")).toBeTruthy();
    expect(view.getByLabelText("Allow camera access")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to foods"));

    mockCamera.permission = {
      granted: false,
      canAskAgain: false,
      status: "denied",
    };
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    expect(mockCamera.request).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      view.getByLabelText("Open Settings to allow camera access"),
    );
    expect(settings).toHaveBeenCalled();
    // Typing the numbers uses the same offline lookup.
    await fireEvent.changeText(
      view.getByLabelText("Barcode numbers"),
      "0 49000 00634 6",
    );
    await fireEvent.press(view.getByLabelText("Look up typed barcode"));
    expect(brandedByBarcode).toHaveBeenCalledWith("049000006346", undefined);
    expect(
      view.getByRole("header", { name: "Coca-Cola Can, 12 fl oz" }),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("an unavailable camera, a failing catalogue and the light are handled", async () => {
  const { db } = setup();
  try {
    mockCamera.permission = null;
    const view = await render(<JournalScreen />);
    await openScanner(view);
    expect(view.getByText("Starting the camera…")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to foods"));
    mockCamera.permission = GRANTED;
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    // The light.
    await fireEvent.press(view.getByLabelText("Turn the light on"));
    expect(mockCamera.props?.enableTorch).toBe(true);
    await fireEvent.press(view.getByLabelText("Turn the light off"));
    expect(mockCamera.props?.enableTorch).toBe(false);
    // The catalogue can't be opened: said plainly, and retried.
    jest
      .mocked(brandedByBarcode)
      .mockRejectedValueOnce(
        new Error(
          "Branded foods couldn't be opened. Your logs are safe; try again.",
        ),
      );
    await scan({ type: "ean13", data: "049000006346" });
    expect(view.getByText(/Branded foods couldn't be opened/)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Scan again" }));
    // The camera fails to start.
    await act(async () =>
      mockCamera.props?.onMountError?.({ message: "no camera" }),
    );
    expect(view.getByText("Camera unavailable")).toBeTruthy();
    expect(view.queryByTestId("barcode-camera")).toBeNull();
  } finally {
    db.close();
  }
});

test("closing the sheet while a lookup is running logs nothing and opens nothing", async () => {
  const { r, db } = setup();
  try {
    let answer!: (v: typeof COKE) => void;
    jest
      .mocked(brandedByBarcode)
      .mockImplementationOnce(() => new Promise((res) => (answer = res)));
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan({ type: "ean13", data: "049000006346" });
    expect(view.getByText("Looking up 049000006346…")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to foods"));
    await act(async () => answer(COKE));
    expect(
      view.queryByRole("header", { name: "Coca-Cola Can, 12 fl oz" }),
    ).toBeNull();
    expect(view.getByLabelText("Search foods")).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
  } finally {
    db.close();
  }
});
