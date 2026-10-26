import React from "react";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import JournalScreen from "../../src/screens/Journal";
import { FoodEditorSheet } from "../../src/components/nutrition/FoodEditorSheet";
import { useRepo } from "../../src/state";
import {
  brandedByBarcode,
  searchBranded,
} from "../../src/data/branded-catalog";
import { brandedFood } from "../../src/domain/branded";
import {
  correctionDraft,
  correctionOf,
  labelDraftForBarcode,
  readLabelDraft,
} from "../../src/domain/personal-foods";
import { pathRepository } from "../path-fixture";

// Phase 7.3F.2 M2: personal barcode foods and corrections, through the real
// Add food sheet. expo-camera is replaced at its boundary (as in
// barcode-scanner.test.tsx); the network is cut, so every lookup here is
// offline. Physical scanning is verified on the founder's iPhone.

type CameraProps = {
  testID?: string;
  active?: boolean;
  onBarcodeScanned?: (r: { type: string; data: string }) => void;
};
const mockCamera: { props: CameraProps | null } = { props: null };
jest.mock("expo-camera", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  function CameraView(props: CameraProps) {
    mockCamera.props = props;
    React.useEffect(
      () => () => {
        mockCamera.props = null;
      },
      [],
    );
    return React.createElement(View, { testID: props.testID });
  }
  return {
    CameraView,
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: "granted" },
      jest.fn(),
    ],
  };
});
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  // Confirmations are accepted, as the lifter would.
  confirm: (_t: string, _m: string, fn: () => void) => fn(),
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

const DR_PEPPER = "00078000082401";
const COKE = brandedFood({
  id: 7,
  fdcId: 2412345,
  name: "Coca-Cola Can, 12 fl oz",
  brand: "Coca-Cola",
  basis: "ml",
  serving: 355,
  household: "1 can",
  servingLabel: "1 can",
  servingSource: "label",
  kcal: 39.4,
  protein: 0,
  carbs: 10.98,
  fat: 0,
  gtin: "00049000006346",
});

let fetchCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockCamera.props = null;
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
type Repo = ReturnType<typeof setup>["r"];
const entries = (r: Repo) => r.journal("nutrition");
const foods = (r: Repo) => r.journal("food");
async function openScanner(view: RenderResult, meal = "Lunch") {
  await fireEvent.press(view.getByLabelText(`Add to ${meal}`));
  await fireEvent.press(view.getByLabelText("Scan barcode"));
}
async function scan(data: string, type = "ean13") {
  await act(async () => {
    // The camera repeats a read every frame; only the first counts.
    mockCamera.props?.onBarcodeScanned?.({ type, data });
    mockCamera.props?.onBarcodeScanned?.({ type, data });
  });
}
async function type(view: RenderResult, label: string, text: string) {
  await fireEvent.changeText(view.getByLabelText(label), text);
}
async function fillDrPepper(view: RenderResult) {
  await type(view, "Food name", "Dr Pepper");
  await type(view, "Brand (optional)", "Dr Pepper");
  await type(view, "Serving name (optional)", "1 can");
  await fireEvent.press(view.getByRole("tab", { name: "Millilitres" }));
  await type(view, "Amount (ml)", "355");
  await type(view, "Calories (kcal)", "150");
  await type(view, "Protein (g)", "0");
  await type(view, "Carbs (g)", "41");
  await type(view, "Fat (g)", "0");
}

test("Test A: an unknown can becomes a personal food once, and is recognized on the next scan", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan("078000082401");
    expect(view.getByText("Product not found")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Create food from this barcode" }),
    );
    // The barcode is carried in: shown, never typed.
    expect(
      view.getByRole("header", { name: "New food from barcode" }),
    ).toBeTruthy();
    expect(
      view.getByLabelText("Barcode 078000082401, From your scan"),
    ).toBeTruthy();
    expect(view.queryByLabelText("Barcode numbers")).toBeNull();
    // Nothing is invented: an empty label can't be saved.
    await fireEvent.press(view.getByRole("button", { name: "Save food" }));
    expect(view.getByText("Enter the food's name")).toBeTruthy();
    expect(
      view.getAllByText("Enter a number (0 if none)").length,
    ).toBeGreaterThan(0);
    expect(foods(r)).toHaveLength(0);
    await fillDrPepper(view);
    expect(
      view.getByText("1 can (355 ml): 150 kcal · P 0 g · C 41 g · F 0 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Save food" }));
    // Saved, not logged.
    expect(foods(r)).toHaveLength(1);
    expect(foods(r)[0]!.data).toMatchObject({
      name: "Dr Pepper",
      calories: 150,
      protein: 0,
      carbs: 41,
      fat: 0,
      quantity: 1,
      serving: "1 can (355 ml)",
      personalKind: "food",
      servingName: "1 can",
      sourceBarcode: DR_PEPPER,
      sourceMl: 355,
    });
    expect(entries(r)).toHaveLength(0);
    expect(view.getByRole("header", { name: "Dr Pepper" })).toBeTruthy();
    expect(
      view.getByText("Saved. FORGE will recognize this barcode next time."),
    ).toBeTruthy();
    // Close and reopen the scanner; scan the same can.
    await fireEvent.press(view.getByLabelText("Back to scanner"));
    expect(view.getByTestId("barcode-camera")).toBeTruthy();
    await scan("078000082401");
    expect(view.getByRole("header", { name: "Dr Pepper" })).toBeTruthy();
    expect(
      view.getByText("Your food · values from your package label"),
    ).toBeTruthy();
    expect(view.getByText("1 serving = 1 can (355 ml)")).toBeTruthy();
    expect(
      view.getByLabelText("150 kcal, protein 0 g, carbs 41 g, fat 0 g"),
    ).toBeTruthy();
    expect(entries(r)).toHaveLength(0);
    // Smart Servings: ½ · 1 · 1½ · 2, with the millilitres shown.
    await fireEvent.press(view.getByRole("button", { name: "1½" }));
    expect(view.getByText("For 1½ × 1 can · 532.5 ml")).toBeTruthy();
    expect(
      view.getByLabelText("225 kcal, protein 0 g, carbs 62 g, fat 0 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "1" }));
    // Explicit confirmation, once, even if tapped twice.
    const add = view.getByLabelText("Add Dr Pepper to Lunch");
    await fireEvent.press(add);
    await fireEvent.press(add);
    expect(entries(r)).toHaveLength(1);
    expect(entries(r)[0]!.data).toMatchObject({
      name: "Dr Pepper",
      meal: "Lunch",
      calories: 150,
      carbs: 41,
      quantity: 1,
      serving: "1 can (355 ml)",
      sourceId: `personal:${DR_PEPPER}`,
      sourceCatalog: "personal",
      sourceBarcode: DR_PEPPER,
      sourceBrand: "Dr Pepper",
      sourceMl: 355,
    });
    // Undo from the top of Add food (its saved row offers Undo too).
    expect(view.getByText("Added Dr Pepper to Lunch")).toBeTruthy();
    await fireEvent.press(view.getAllByLabelText("Undo adding Dr Pepper")[0]!);
    expect(entries(r)).toHaveLength(0);
    expect(foods(r)).toHaveLength(1);
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("Test C: after the app restarts, the saved barcode still resolves locally", async () => {
  const { r, db } = setup();
  try {
    const made = readLabelDraft(
      {
        ...labelDraftForBarcode(DR_PEPPER),
        name: "Dr Pepper",
        household: "1 can",
        unit: "ml",
        amount: "355",
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "food" },
    );
    if (!("data" in made)) throw new Error("draft");
    r.addJournal("food", made.data);
    // A fresh mount reads everything from the repository again.
    const view = await render(<JournalScreen />);
    await openScanner(view, "Snacks");
    await scan("078000082401");
    expect(
      view.getByText("Your food · values from your package label"),
    ).toBeTruthy();
    // It also shows among saved foods, labelled as the lifter's own.
    await fireEvent.press(view.getByLabelText("Back to scanner"));
    await fireEvent.press(view.getByLabelText("Back to foods"));
    await fireEvent.changeText(view.getByLabelText("Search foods"), "dr pep");
    expect(
      view.getByLabelText("Dr Pepper, 1 can (355 ml), 150 kcal"),
    ).toBeTruthy();
    expect(view.getByText("Your label")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText("Dr Pepper, 1 can (355 ml), 150 kcal"),
    );
    expect(view.getByText("1 serving = 1 can (355 ml)")).toBeTruthy();
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("per-100 label values are converted once and previewed before saving", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan("078000082401");
    await fireEvent.press(
      view.getByRole("button", { name: "Create food from this barcode" }),
    );
    await type(view, "Food name", "Dr Pepper");
    await type(view, "Serving name (optional)", "1 can");
    await fireEvent.press(view.getByRole("tab", { name: "Millilitres" }));
    await fireEvent.press(view.getByRole("tab", { name: "Per 100 ml" }));
    await type(view, "Calories (kcal)", "42");
    await type(view, "Protein (g)", "0");
    await type(view, "Carbs (g)", "11.5");
    await type(view, "Fat (g)", "0");
    // Without the serving amount, per-100 values can't make a serving.
    await fireEvent.press(view.getByRole("button", { name: "Save food" }));
    expect(
      view.getByText(/Enter the serving size in ml from the label/),
    ).toBeTruthy();
    expect(foods(r)).toHaveLength(0);
    await type(view, "Amount (ml)", "355");
    expect(
      view.getByText("1 can (355 ml): 149 kcal · P 0 g · C 41 g · F 0 g"),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Save food" }));
    expect(foods(r)[0]!.data).toMatchObject({
      calories: 149.1,
      carbs: 40.825,
      labelBasis: "100",
      sourceMl: 355,
    });
  } finally {
    db.close();
  }
});

test("Test B: a correction is preferred on rescan and search, and removing it brings USDA back; history is unchanged", async () => {
  const { r, db } = setup();
  try {
    jest
      .mocked(searchBranded)
      .mockResolvedValue({ foods: [COKE], total: 1, broad: false });
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan("049000006346");
    expect(
      view.getByRole("header", { name: "Coca-Cola Can, 12 fl oz" }),
    ).toBeTruthy();
    // Log USDA's can first: history to protect.
    await fireEvent.press(
      view.getByLabelText("Add Coca-Cola Can, 12 fl oz to Lunch"),
    );
    const usdaEntry = JSON.stringify(entries(r));
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    await scan("049000006346");
    await fireEvent.press(
      view.getByRole("button", { name: "Correct nutrition" }),
    );
    expect(
      view.getByRole("header", { name: "Correct nutrition" }),
    ).toBeTruthy();
    expect(view.getByLabelText("Calories (kcal)").props.value).toBe("139.87");
    // Unchanged values aren't a correction.
    await fireEvent.press(
      view.getByRole("button", { name: "Save correction" }),
    );
    expect(view.getByText(/These are USDA's values/)).toBeTruthy();
    expect(foods(r)).toHaveLength(0);
    await type(view, "Calories (kcal)", "150");
    await fireEvent.press(
      view.getByRole("button", { name: "Save correction" }),
    );
    expect(foods(r)).toHaveLength(1);
    expect(foods(r)[0]!.data).toMatchObject({
      personalKind: "correction",
      sourceId: "usda-branded:2412345",
      sourceCatalog: "usda-branded-2026-04-30",
      sourceEdited: true,
      calories: 150,
    });
    expect(
      view.getByText("Your correction · used instead of USDA's values"),
    ).toBeTruthy();
    // Rescan: the correction is preferred, its origin plain.
    await fireEvent.press(view.getByLabelText("Back to scanner"));
    await scan("049000006346");
    expect(
      view.getByText("Your correction · used instead of USDA's values"),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText("Add Coca-Cola Can, 12 fl oz to Lunch"),
    );
    expect(entries(r)).toHaveLength(2);
    expect(entries(r)[0]!.data).toMatchObject({
      calories: 150,
      sourceEdited: true,
    });
    // Searching shows the correction once (no USDA duplicate) and opens it.
    await fireEvent.changeText(view.getByLabelText("Search foods"), "coca");
    const row = await view.findByLabelText(
      "Coca-Cola Can, 12 fl oz, 1 can (355 ml), 150 kcal",
    );
    expect(
      view.queryByLabelText(
        "Coca-Cola Can, 12 fl oz, Coca-Cola, 1 can (355 ml), 140 kcal",
      ),
    ).toBeNull();
    await fireEvent.press(row);
    expect(
      view.getByText("Your correction · used instead of USDA's values"),
    ).toBeTruthy();
    // USDA's own values stay one tap away (looked up offline by barcode).
    await fireEvent.press(
      view.getByRole("button", { name: "Use USDA values" }),
    );
    expect(
      await view.findByLabelText(
        "140 kcal, protein 0 g, carbs 39 g, fat 0 g, 355 ml",
      ),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to foods"));
    // Remove the correction from a scan: USDA's product returns.
    await fireEvent.press(view.getByLabelText("Scan barcode"));
    await scan("049000006346");
    await fireEvent.press(
      view.getByRole("button", { name: "Remove correction" }),
    );
    expect(foods(r)).toHaveLength(0);
    expect(
      view.getByLabelText("140 kcal, protein 0 g, carbs 39 g, fat 0 g, 355 ml"),
    ).toBeTruthy();
    expect(
      view.queryByText("Your correction · used instead of USDA's values"),
    ).toBeNull();
    await fireEvent.press(view.getByLabelText("Back to scanner"));
    await scan("049000006346");
    expect(
      view.getByRole("button", { name: "Correct nutrition" }),
    ).toBeTruthy();
    // Nothing logged before was rewritten.
    expect(JSON.stringify(entries(r).slice(-1))).toBe(usdaEntry);
    expect(entries(r)[0]!.data.calories).toBe(150);
    expect(fetchCalls).toBe(0);
  } finally {
    db.close();
  }
});

test("synced duplicates for one barcode resolve the same way and say so", async () => {
  const { r, db } = setup();
  try {
    const base = {
      ...labelDraftForBarcode(DR_PEPPER),
      household: "1 can",
      unit: "ml" as const,
      amount: "355",
      perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
    };
    for (const name of ["Dr Pepper (phone)", "Dr Pepper (tablet)"]) {
      const made = readLabelDraft({ ...base, name }, { kind: "food" });
      if (!("data" in made)) throw new Error("draft");
      // Arriving from sync, so the duplicate guard never ran.
      r.applyRemote(
        `id-${name}`,
        "journal",
        {
          id: `id-${name}`,
          kind: "food",
          date: "2026-10-26",
          data: made.data,
          createdAt: 1000,
          updatedAt: name.includes("tablet") ? 3000 : 2000,
        },
        1,
      );
    }
    const view = await render(<JournalScreen />);
    await openScanner(view);
    await scan("078000082401");
    expect(
      view.getByRole("header", { name: "Dr Pepper (tablet)" }),
    ).toBeTruthy();
    expect(
      view.getByText(
        "2 of your saved foods use this barcode. Showing the most recently updated.",
      ),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Saved foods: a personal food edits in its label form; plain saved foods keep the usual editor", async () => {
  const { r, db } = setup();
  try {
    const made = readLabelDraft(
      {
        ...labelDraftForBarcode(DR_PEPPER),
        name: "Dr Pepper",
        household: "1 can",
        unit: "ml",
        amount: "355",
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "food" },
    );
    if (!("data" in made)) throw new Error("draft");
    const food = r.addJournal("food", made.data);
    const logged = r.addJournal("nutrition", { ...made.data, meal: "Lunch" });
    const close = jest.fn();
    const view = await render(
      <FoodEditorSheet target={{ kind: "food", food }} onClose={close} />,
    );
    expect(view.getByRole("header", { name: "Edit food" })).toBeTruthy();
    expect(
      view.getByLabelText("Barcode 078000082401, Linked barcode"),
    ).toBeTruthy();
    expect(view.getByLabelText("Calories (kcal)").props.value).toBe("150");
    await type(view, "Calories (kcal)", "155");
    await fireEvent.press(view.getByRole("button", { name: "Save food" }));
    expect(close).toHaveBeenCalled();
    expect(r.journal("food")[0]!.data).toMatchObject({
      calories: 155,
      personalKind: "food",
      sourceBarcode: DR_PEPPER,
      sourceMl: 355,
    });
    // The entry logged before keeps its values.
    expect(
      r.journal("nutrition").find((e) => e.id === logged.id)!.data.calories,
    ).toBe(150);
  } finally {
    db.close();
  }
});

test("Saved foods: plain saved foods keep the usual editor", async () => {
  const { r, db } = setup();
  try {
    const plain = r.addJournal("food", {
      name: "Oats",
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      quantity: 1,
    });
    const other = await render(
      <FoodEditorSheet
        target={{ kind: "food", food: plain }}
        onClose={jest.fn()}
      />,
    );
    expect(other.getByRole("header", { name: "Edit saved food" })).toBeTruthy();
    expect(other.queryByText("Nutrition facts")).toBeNull();
  } finally {
    db.close();
  }
});

test("a correction made in the domain is what the scanner finds (scan and search agree)", async () => {
  const { r, db } = setup();
  try {
    const fixed = readLabelDraft(
      {
        ...correctionDraft(COKE),
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "correction", of: correctionOf(COKE, "usda-branded-2026-04-30") },
    );
    if (!("data" in fixed)) throw new Error("draft");
    r.addJournal("food", fixed.data);
    jest
      .mocked(searchBranded)
      .mockResolvedValue({ foods: [COKE], total: 1, broad: false });
    const view = await render(<JournalScreen />);
    await openScanner(view, "Dinner");
    await scan("049000006346");
    await fireEvent.press(view.getByRole("button", { name: "1½" }));
    await fireEvent.press(
      view.getByLabelText("Add Coca-Cola Can, 12 fl oz to Dinner"),
    );
    await fireEvent.changeText(view.getByLabelText("Search foods"), "coca");
    await fireEvent.press(
      await view.findByLabelText(
        "Coca-Cola Can, 12 fl oz, 1 can (355 ml), 150 kcal",
      ),
    );
    await fireEvent.press(view.getByRole("button", { name: "1½" }));
    await fireEvent.press(
      view.getByLabelText("Add Coca-Cola Can, 12 fl oz to Dinner"),
    );
    const [a, b] = entries(r);
    expect(a!.data).toEqual(b!.data);
    expect(a!.data).toMatchObject({
      calories: 150,
      quantity: 1.5,
      sourceEdited: true,
    });
  } finally {
    db.close();
  }
});

test("a USDA search row for a corrected product shows and logs the correction (its + too)", async () => {
  const { r, db } = setup();
  try {
    // Renamed, so only the USDA row matches the search below.
    const fixed = readLabelDraft(
      {
        ...correctionDraft(COKE),
        name: "My Coke",
        perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
      },
      { kind: "correction", of: correctionOf(COKE, "usda-branded-2026-04-30") },
    );
    if (!("data" in fixed)) throw new Error("draft");
    r.addJournal("food", fixed.data);
    jest
      .mocked(searchBranded)
      .mockResolvedValue({ foods: [COKE], total: 1, broad: false });
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText("Add to Lunch"));
    await fireEvent.changeText(
      view.getByLabelText("Search foods"),
      "can 12 fl",
    );
    expect(
      await view.findByLabelText("My Coke, 1 can (355 ml), 150 kcal"),
    ).toBeTruthy();
    expect(view.getByText("Your correction")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Add My Coke"));
    expect(entries(r)).toHaveLength(1);
    expect(entries(r)[0]!.data).toMatchObject({
      name: "My Coke",
      calories: 150,
      quantity: 1,
      sourceId: "usda-branded:2412345",
      sourceEdited: true,
    });
    await fireEvent.press(view.getAllByLabelText("Undo adding My Coke")[0]!);
    expect(entries(r)).toHaveLength(0);
  } finally {
    db.close();
  }
});
