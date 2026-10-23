import React, { useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import {
  Button,
  TextButton,
  IconButton,
  Txt,
  Label,
  Card,
  Chips,
  FilterChips,
  SegmentedControl,
  Sheet,
  Screen,
  Stat,
} from "../../src/components/ui";
import {
  ListRow,
  ListSection,
  OverflowMenu,
  InfoButton,
} from "../../src/components/system";
import DesignSystem from "../../app/design-system";
import { theme, maxFontScale } from "../../src/theme";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const flat = (style: unknown) => StyleSheet.flatten(style as never) ?? {};

test("button variants share one API and expose labels and disabled state", async () => {
  const press = jest.fn();
  const view = await render(
    <>
      <Button title="Start session" onPress={press} />
      <Button title="Secondary" secondary onPress={press} />
      <Button title="Delete" danger onPress={press} />
      <Button title="Disabled" disabled onPress={press} />
      <TextButton title="Add set" onPress={press} />
    </>,
  );
  await fireEvent.press(view.getByLabelText("Start session"));
  await fireEvent.press(view.getByLabelText("Add set"));
  await fireEvent.press(view.getByLabelText("Disabled"));
  expect(press).toHaveBeenCalledTimes(2);
  expect(
    view.getByRole("button", { name: "Disabled", disabled: true }),
  ).toBeTruthy();
  // The primary button is the flat ember action; others are tonal.
  const primary = flat(view.getByLabelText("Start session").props.style) as {
    backgroundColor?: string;
    minHeight?: number;
  };
  expect(primary.backgroundColor).toBe(theme.colors.ember);
  expect(primary.minHeight).toBeGreaterThanOrEqual(44);
  const secondary = flat(view.getByLabelText("Secondary").props.style) as {
    backgroundColor?: string;
  };
  expect(secondary.backgroundColor).toBe(theme.colors.surfaceRaised);
});

test("icon buttons keep a 44 pt target and a spoken label", async () => {
  const press = jest.fn();
  const view = await render(
    <IconButton icon="close" label="Close" onPress={press} />,
  );
  const button = view.getByLabelText("Close");
  const style = flat(button.props.style) as {
    minWidth?: number;
    minHeight?: number;
  };
  expect(style.minWidth).toBeGreaterThanOrEqual(44);
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  await fireEvent.press(button);
  expect(press).toHaveBeenCalled();
});

test("text roles apply the scale, tabular numerals and uppercase overlines", async () => {
  const view = await render(
    <>
      <Txt variant="metric">142.5</Txt>
      <Txt variant="overline">this week</Txt>
      <Label size={23} bold>
        Legacy heading
      </Label>
    </>,
  );
  expect(flat(view.getByText("142.5").props.style)).toMatchObject({
    fontVariant: ["tabular-nums"],
    fontSize: 22,
  });
  expect(flat(view.getByText("this week").props.style)).toMatchObject({
    textTransform: "uppercase",
    fontSize: 11,
  });
  // Legacy sizes snap to the scale (23 → title 22).
  expect(flat(view.getByText("Legacy heading").props.style)).toMatchObject({
    fontSize: 22,
  });
});

test("segmented controls expose tabs with selection state", async () => {
  function Harness() {
    const [value, setValue] = useState("30D");
    return (
      <SegmentedControl
        label="Range"
        options={["7D", "30D", { value: "all", label: "All" }]}
        value={value}
        onChange={setValue}
      />
    );
  }
  const view = await render(<Harness />);
  expect(view.getByRole("tab", { name: "30D", selected: true })).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "All" }));
  expect(view.getByRole("tab", { name: "All", selected: true })).toBeTruthy();
  expect(view.getByRole("tab", { name: "30D", selected: false })).toBeTruthy();
});

test("filter chips select and bleed to the screen edge so they never look clipped", async () => {
  const change = jest.fn();
  const view = await render(
    <>
      <FilterChips values={["All", "Strength"]} value="All" onChange={change} />
      <Chips values={["Kg", "Lb"]} value="Kg" onChange={change} />
    </>,
  );
  await fireEvent.press(view.getByRole("button", { name: "Strength" }));
  expect(change).toHaveBeenCalledWith("Strength");
  expect(
    view.getByRole("button", { name: "All", selected: true }),
  ).toBeTruthy();
  // FilterChips run to the screen edge; plain Chips (inside cards) do not.
  type Node = { props?: Record<string, unknown>; children?: unknown[] };
  const nodes: Node[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    nodes.push(n as Node);
    (n as Node).children?.forEach(walk);
  };
  walk(view.toJSON());
  const bleeding = nodes.filter(
    (n) =>
      (flat(n.props?.style) as { marginHorizontal?: number })
        .marginHorizontal === -theme.spacing.screen,
  );
  expect(bleeding).toHaveLength(1);
  expect(flat(bleeding[0]!.props?.contentContainerStyle)).toMatchObject({
    paddingHorizontal: theme.spacing.screen,
  });
});

test("grouped list rows navigate, show values and mark destructive rows", async () => {
  const open = jest.fn();
  const remove = jest.fn();
  const view = await render(
    <ListSection title="Training" footer="Rows replace navigation buttons.">
      <ListRow title="Templates" value="4" onPress={open} />
      <ListRow title="Forge Paths" subtitle="18 programs" onPress={open} />
      <ListRow title="Version" value="2.0" />
      <ListRow title="Delete all local data" destructive onPress={remove} />
    </ListSection>,
  );
  expect(view.getByText("Training")).toBeTruthy();
  expect(view.getByText("Rows replace navigation buttons.")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Templates" }));
  await fireEvent.press(view.getByRole("button", { name: "Forge Paths" }));
  expect(open).toHaveBeenCalledTimes(2);
  expect(view.getByText("4")).toBeTruthy();
  // Informational rows are not buttons.
  expect(view.queryByRole("button", { name: "Version" })).toBeNull();
  await fireEvent.press(
    view.getByRole("button", { name: "Delete all local data" }),
  );
  expect(remove).toHaveBeenCalled();
  expect(
    flat(view.getByText("Delete all local data").props.style),
  ).toMatchObject({ color: theme.colors.error });
});

test("overflow menus list secondary actions, destructive last, and run them after closing", async () => {
  const substitute = jest.fn();
  const remove = jest.fn();
  const view = await render(
    <OverflowMenu
      title="Exercise"
      actions={[
        { label: "Remove", destructive: true, onPress: remove },
        { label: "Substitute", onPress: substitute },
        { label: "Unavailable", disabled: true, onPress: jest.fn() },
      ]}
    />,
  );
  expect(view.queryByRole("menuitem", { name: "Substitute" })).toBeNull();
  await fireEvent.press(view.getByLabelText("More options"));
  const items = view
    .getAllByRole("menuitem")
    .map((i) => i.props.accessibilityLabel);
  expect(items).toEqual(["Substitute", "Unavailable", "Remove"]);
  expect(
    view.getByRole("menuitem", { name: "Unavailable", disabled: true }),
  ).toBeTruthy();
  await fireEvent.press(view.getByRole("menuitem", { name: "Remove" }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1), {
    timeout: 2000,
  });
  expect(substitute).not.toHaveBeenCalled();
  // Cancel closes without running anything.
  await fireEvent.press(view.getByLabelText("More options"));
  await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
  await new Promise((r) => setTimeout(r, 500));
  expect(remove).toHaveBeenCalledTimes(1);
});

test("overflow actions run exactly once, after the menu has closed", async () => {
  const runs: string[] = [];
  let itemsVisibleAtRun: boolean | undefined;
  let probe = () => false;
  function Harness() {
    const [sheet, setSheet] = useState(false);
    return (
      <>
        <OverflowMenu
          actions={[
            {
              label: "Open sheet",
              onPress: () => {
                itemsVisibleAtRun = probe();
                runs.push("sheet");
                setSheet(true);
              },
            },
            { label: "Other", onPress: () => runs.push("other") },
          ]}
        />
        <Sheet
          visible={sheet}
          onClose={() => setSheet(false)}
          title="Chained sheet"
        >
          <Txt>Opened from the menu</Txt>
        </Sheet>
      </>
    );
  }
  const view = await render(<Harness />);
  probe = () => view.queryAllByRole("menuitem").length > 0;
  await fireEvent.press(view.getByLabelText("More options"));
  const open = view.getByRole("menuitem", { name: "Open sheet" });
  const other = view.getByRole("menuitem", { name: "Other" });
  // A double tap: all activations land before the menu re-renders. onClick is
  // the activation path React Native uses for accessibility presses.
  const activate = (el: { props: Record<string, unknown> }) =>
    (el.props.onClick as (e: unknown) => void)({
      nativeEvent: {},
      target: el,
      currentTarget: el,
      stopPropagation() {},
    });
  type HostNode = { props: Record<string, unknown>; parent: HostNode | null };
  let modal = open as unknown as HostNode | null;
  while (modal && !modal.props.onDismiss) modal = modal.parent;
  await act(async () => {
    activate(open);
    activate(other);
  });
  // Re-opening while the chosen action is still pending is ignored.
  await fireEvent.press(view.getByLabelText("More options"));
  expect(view.queryAllByRole("menuitem")).toHaveLength(0);
  // iOS reports the dismissal; the fallback timer must not run it again.
  await act(async () => (modal!.props.onDismiss as () => void)());
  await waitFor(
    () => expect(view.getByText("Opened from the menu")).toBeTruthy(),
    {
      timeout: 2000,
    },
  );
  expect(itemsVisibleAtRun).toBe(false);
  await new Promise((r) => setTimeout(r, 1000));
  expect(runs).toEqual(["sheet"]);
});

test("backdrop taps close informational sheets but never sheets holding input", async () => {
  const closeForm = jest.fn();
  const form = await render(
    <Sheet visible onClose={closeForm} title="New template">
      <Txt>Unsaved input</Txt>
    </Sheet>,
  );
  await fireEvent.press(form.getByTestId("sheet-backdrop"));
  expect(closeForm).not.toHaveBeenCalled();
  expect(form.getByText("Unsaved input")).toBeTruthy();
  await fireEvent.press(form.getByLabelText("Close"));
  expect(closeForm).toHaveBeenCalledTimes(1);
  await form.unmount();

  const info = await render(
    <InfoButton
      title="Rest"
      paragraphs={["Rest 3–5 minutes on heavy sets."]}
    />,
  );
  await fireEvent.press(info.getByLabelText("About Rest"));
  await fireEvent.press(info.getByTestId("sheet-backdrop"));
  expect(info.queryByText(/Rest 3–5 minutes/)).toBeNull();
});

test("unsaved input is never discarded silently by any close path", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    const close = jest.fn();
    const view = await render(
      <Sheet visible unsaved onClose={close} title="New template">
        <Txt>Draft</Txt>
      </Sheet>,
    );
    type HostNode = {
      props: Record<string, unknown>;
      parent: HostNode | null;
    };
    const ancestor = (prop: string) => {
      let n = view.getByText("Draft") as unknown as HostNode | null;
      while (n && !n.props[prop]) n = n.parent;
      return n!.props[prop] as () => void;
    };
    // The × button, Android back and the VoiceOver escape gesture all ask.
    await fireEvent.press(view.getByLabelText("Close"));
    await act(async () => ancestor("onRequestClose")());
    await act(async () => ancestor("onAccessibilityEscape")());
    // Backdrop taps do nothing on input sheets.
    await fireEvent.press(view.getByTestId("sheet-backdrop"));
    expect(alert).toHaveBeenCalledTimes(3);
    expect(close).not.toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Discard changes?");
    const options = buttons as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    expect(options.map((b) => [b.text, b.style])).toEqual([
      ["Keep editing", "cancel"],
      ["Discard", "destructive"],
    ]);
    options[0]!.onPress?.();
    expect(close).not.toHaveBeenCalled();
    options[1]!.onPress!();
    expect(close).toHaveBeenCalledTimes(1);

    // Without unsaved changes the sheet closes immediately.
    alert.mockClear();
    const clean = jest.fn();
    await view.rerender(
      <Sheet visible onClose={clean} title="New template">
        <Txt>Draft</Txt>
      </Sheet>,
    );
    await fireEvent.press(view.getByLabelText("Close"));
    expect(clean).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  } finally {
    alert.mockRestore();
  }
});

test("uppercase labels stay natural for screen readers", async () => {
  const view = await render(
    <>
      <Txt variant="overline">NEXT SESSION</Txt>
      <Txt variant="overline">This week · 3 of 4</Txt>
      <Label size={11}>Mon</Label>
      <Stat value={12} label="WORKING SETS" />
    </>,
  );
  expect(view.getByLabelText("Next session")).toBeTruthy();
  expect(view.getByLabelText("This week · 3 of 4")).toBeTruthy();
  expect(view.getByLabelText("Mon")).toBeTruthy();
  expect(view.getByLabelText("12 Working sets")).toBeTruthy();
  // Uppercase stays a visual treatment.
  expect(flat(view.getByText("Mon").props.style)).toMatchObject({
    textTransform: "uppercase",
  });
});

test("screen titles fit compact phones and cap Dynamic Type growth", async () => {
  const view = await render(
    <Screen title="Progress" eyebrow="This week">
      <Txt>Body copy</Txt>
    </Screen>,
  );
  const title = view.getByRole("header", { name: "Progress" });
  expect(title.props.numberOfLines).toBe(2);
  expect(title.props.adjustsFontSizeToFit).toBe(true);
  expect(title.props.maxFontSizeMultiplier).toBe(maxFontScale.display);
  // Body text scales with Dynamic Type without a cap.
  expect(
    view.getByText("Body copy").props.maxFontSizeMultiplier,
  ).toBeUndefined();
  expect(view.getByLabelText("This week")).toBeTruthy();
});

test("information sheets keep educational content one tap away", async () => {
  const view = await render(
    <InfoButton
      title="How progression works"
      paragraphs={["Add load only when every working set reaches the top."]}
    />,
  );
  expect(view.queryByText(/every working set/)).toBeNull();
  await fireEvent.press(view.getByLabelText("About How progression works"));
  expect(view.getByText("How progression works")).toBeTruthy();
  expect(view.getByText(/every working set/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Close"));
  expect(view.queryByText(/every working set/)).toBeNull();
});

test("sheets share one header with a labelled close control and an optional footer", async () => {
  const close = jest.fn();
  const view = await render(
    <Sheet
      visible
      onClose={close}
      title="Reschedule session"
      footer={<Button title="Save" onPress={jest.fn()} />}
    >
      <Card compact>
        <Txt>Content</Txt>
      </Card>
    </Sheet>,
  );
  expect(view.getByRole("header", { name: "Reschedule session" })).toBeTruthy();
  expect(view.getByLabelText("Save")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Close"));
  expect(close).toHaveBeenCalled();
});

test("the development design-system reference renders every component", async () => {
  const view = await render(<DesignSystem />);
  for (const text of [
    "Typography",
    "Color",
    "Actions",
    "Controls",
    "Surfaces",
    "Grouped rows",
    "Device QA",
  ])
    expect(view.getByText(text)).toBeTruthy();
  // The device QA menu opens the protected input sheet after closing.
  await fireEvent.press(view.getByLabelText("Menu chaining test"));
  await fireEvent.press(
    view.getByRole("menuitem", { name: "Open input sheet" }),
  );
  await waitFor(
    () =>
      expect(
        view.getByRole("header", { name: "Reschedule session" }),
      ).toBeTruthy(),
    { timeout: 2000 },
  );
  await fireEvent.press(view.getByLabelText("Close"));
  await fireEvent.press(view.getByRole("tab", { name: "7D" }));
  expect(view.getByRole("tab", { name: "7D", selected: true })).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Templates"));
  expect(view.getByText("Last action: templates")).toBeTruthy();
});
