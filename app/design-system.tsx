import React, { useState } from "react";
import { Alert, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Txt,
  Button,
  TextButton,
  IconButton,
  Field,
  FilterChips,
  SegmentedControl,
  Choices,
  Stat,
  ProgressBar,
  Sheet,
  useColors,
} from "../src/components/ui";
import {
  ListRow,
  ListSection,
  OverflowMenu,
  InfoButton,
} from "../src/components/system";
import {
  theme,
  textRoles,
  textRoleFor,
  sizeClass,
  type TextVariant,
} from "../src/theme";

// Development builds only: a living reference for FORGE Design System 2.0.
export default function DesignSystem() {
  const c = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const [segment, setSegment] = useState("30D");
  const [chip, setChip] = useState("All");
  const [choice, setChoice] = useState("Intermediate");
  const [sheet, setSheet] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [last, setLast] = useState("—");
  const [menuRuns, setMenuRuns] = useState(0);
  const ran = (what: string) => {
    setMenuRuns((n) => n + 1);
    setLast(what);
  };
  if (!__DEV__)
    return (
      <Screen title="Unavailable">
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  const swatches: [string, string][] = [
    ["bg", c.bg],
    ["surface", c.surface],
    ["surfaceRaised", c.surfaceRaised],
    ["selected", c.selected],
    ["hairline", c.hairline],
    ["text", c.text],
    ["text2", c.text2],
    ["text3", c.text3],
    ["ember", c.ember],
    ["success", c.success],
    ["error", c.error],
  ];
  return (
    <Screen title="Design System" eyebrow="FORGE 2.0 · DEVELOPMENT">
      <Button title="Back" variant="secondary" onPress={() => router.back()} />

      <ListSection title="Typography">
        {(Object.keys(textRoles) as TextVariant[]).map((v) => (
          <View key={v} style={{ padding: theme.spacing.row, gap: 2 }}>
            <Txt variant="caption" tone="tertiary">
              {v} · {textRoleFor(v, width).size}/
              {textRoleFor(v, width).lineHeight}
            </Txt>
            <Txt variant={v}>
              {v.startsWith("metric") ? "142.5" : "Forge your strength"}
            </Txt>
          </View>
        ))}
      </ListSection>

      <ListSection title="Color">
        {swatches.map(([name, value]) => (
          <ListRow
            key={name}
            title={name}
            value={value}
            trailing={
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: value,
                  borderWidth: 1,
                  borderColor: c.hairline,
                }}
              />
            }
          />
        ))}
      </ListSection>

      <Txt variant="overline" tone="secondary">
        Actions
      </Txt>
      <Button
        title="Start session"
        icon="play"
        onPress={() => setLast("primary")}
      />
      <Button
        title="Secondary action"
        variant="secondary"
        onPress={() => setLast("secondary")}
      />
      <Button
        title="Delete workout"
        variant="destructive"
        onPress={() => setLast("destructive")}
      />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextButton
          title="Add set"
          icon="add"
          onPress={() => setLast("text")}
        />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="timer-outline"
          label="Rest timer"
          onPress={() => setLast("icon")}
        />
        <InfoButton
          title="How progression works"
          paragraphs={[
            "Information sheets keep education one tap away instead of on every screen.",
          ]}
        />
        <OverflowMenu
          title="Exercise"
          actions={[
            {
              label: "Substitute",
              icon: "swap-horizontal",
              onPress: () => setLast("substitute"),
            },
            {
              label: "Move up",
              icon: "arrow-up",
              onPress: () => setLast("move"),
            },
            {
              label: "Remove",
              icon: "trash-outline",
              destructive: true,
              onPress: () => setLast("remove"),
            },
          ]}
        />
      </View>
      <Txt variant="caption" tone="secondary">
        Last action: {last}
      </Txt>

      <Txt variant="overline" tone="secondary">
        Controls
      </Txt>
      <SegmentedControl
        label="Range"
        options={["7D", "30D", "90D", "1Y", "All"]}
        value={segment}
        onChange={setSegment}
      />
      <FilterChips
        values={[
          "All",
          "Beginner",
          "Intermediate",
          "Advanced",
          "Strength",
          "Muscle Building",
        ]}
        value={chip}
        onChange={setChip}
      />
      <Field label="Workout name" placeholder="Upper A" />
      <Choices
        label="Experience"
        options={[
          { value: "Beginner", detail: "New to structured training" },
          { value: "Intermediate", detail: "Consistent for a year or more" },
        ]}
        value={choice}
        onChange={setChoice}
      />

      <Txt variant="overline" tone="secondary">
        Surfaces
      </Txt>
      <Card>
        <Txt variant="overline" tone="secondary">
          Next session · Week 3
        </Txt>
        <Txt variant="title">Upper A</Txt>
        <Txt variant="caption" tone="secondary">
          Intermediate Strength · 6 exercises
        </Txt>
        <ProgressBar value={0.4} label="Program completion" />
        <View style={{ flexDirection: "row", gap: theme.spacing.group }}>
          <Stat value="12" label="Sessions" />
          <Stat value="18,450" label="kg volume" />
          <Stat value="96" label="Sets" />
        </View>
      </Card>
      <Card compact raised>
        <Txt variant="headline">Compact raised card</Txt>
        <Txt variant="caption" tone="secondary">
          For dense content inside other surfaces.
        </Txt>
      </Card>

      <ListSection
        title="Grouped rows"
        footer="Rows replace navigation buttons."
      >
        <ListRow
          title="Templates"
          value="4"
          icon="albums-outline"
          onPress={() => setLast("templates")}
        />
        <ListRow
          title="Forge Paths"
          subtitle="18 programs"
          icon="trail-sign-outline"
          onPress={() => setLast("paths")}
        />
        <ListRow
          title="Delete all local data"
          destructive
          onPress={() => setLast("delete")}
        />
      </ListSection>

      <ListSection
        title="Device QA"
        footer="Each menu action must run once, after the menu has closed. The input sheet ignores backdrop taps, and once you type, closing it asks before discarding."
      >
        <ListRow
          title="Viewport"
          value={`${Math.round(width)}×${Math.round(height)} · ${sizeClass(width)}`}
        />
        <ListRow title="Text size" value={`${fontScale.toFixed(2)}×`} />
        <ListRow title="Menu actions run" value={String(menuRuns)} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: theme.spacing.row,
            minHeight: theme.heights.row,
          }}
        >
          <Txt variant="headline" style={{ flex: 1 }}>
            Menu chaining
          </Txt>
          <OverflowMenu
            label="Menu chaining test"
            title="Each action opens something new"
            actions={[
              {
                label: "Open input sheet",
                icon: "create-outline",
                onPress: () => {
                  ran("sheet");
                  setSheet(true);
                },
              },
              {
                label: "Show confirmation",
                icon: "alert-circle-outline",
                onPress: () => {
                  ran("confirmation");
                  Alert.alert("Confirmation", "Opened from the menu.");
                },
              },
              {
                label: "Open a screen",
                icon: "open-outline",
                onPress: () => {
                  ran("navigation");
                  router.push("/templates");
                },
              },
            ]}
          />
        </View>
      </ListSection>

      <Button
        title="Open sheet"
        variant="secondary"
        onPress={() => setSheet(true)}
      />
      <Sheet
        visible={sheet}
        onClose={() => {
          setSheet(false);
          setDraftDate("");
        }}
        title="Reschedule session"
        unsaved={draftDate !== ""}
        footer={
          <Button
            title="Save"
            onPress={() => {
              setSheet(false);
              setDraftDate("");
            }}
          />
        }
      >
        <Field
          label="New session date (YYYY-MM-DD)"
          value={draftDate}
          onChangeText={setDraftDate}
        />
      </Sheet>
    </Screen>
  );
}
