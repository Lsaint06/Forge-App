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
  forgeText,
  type TextVariant,
  type ForgeVariant,
} from "../src/theme";
import {
  BadgePill,
  BrandHeader,
  CardHeader,
  CtaButton,
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeProgress,
  ForgeRing,
  HeroCard,
  InfoChip,
  Metric,
  OutlineButton,
  SectionLabel,
  SquareIconButton,
  StatStrip,
  Tile,
} from "../src/components/reforge";

// REFORGE primitives with illustrative values (development only; no screen
// shows these numbers).
function ReforgeReference({ onAction }: { onAction: (what: string) => void }) {
  const c = useColors();
  const swatches: [string, string][] = [
    ["cardBg", c.cardBg],
    ["cardBorder", c.cardBorder],
    ["cardRaised", c.cardRaised],
    ["emberHot", c.emberHot],
    ["emberTop", c.emberTop],
    ["emberBottom", c.emberBottom],
    ["emberMuted", c.emberMuted],
    ["emberTintStrong", c.emberTintStrong],
    ["positive", c.positive],
    ["tabBar", c.tabBar],
  ];
  return (
    <View style={{ gap: 12 }}>
      <SectionLabel title="REFORGE foundation" />
      <BrandHeader>
        <SquareIconButton
          icon="ellipsis-horizontal"
          label="Header action sample"
          onPress={() => onAction("header")}
        />
        <BadgePill
          icon="flame"
          value="3"
          accessibilityLabel="Badge sample, 3"
        />
      </BrandHeader>
      <ForgeCard>
        <CardHeader title="REFORGE type" />
        {(Object.keys(forgeText) as ForgeVariant[]).map((v) => (
          <View key={v} style={{ gap: 2 }}>
            <FText variant="label" tone="secondary">
              {v} · {forgeText[v].size}
            </FText>
            <FText variant={v}>
              {v.endsWith("Metric") ? "1,940" : "Push — chest & back"}
            </FText>
          </View>
        ))}
      </ForgeCard>
      <ForgeCard>
        <CardHeader title="REFORGE colour" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {swatches.map(([name, value]) => (
            <View key={name} style={{ width: 96, gap: 4 }}>
              <View
                style={{
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: value,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                }}
              />
              <FText variant="label" tone="secondary" numberOfLines={1}>
                {name}
              </FText>
            </View>
          ))}
        </View>
      </ForgeCard>
      <HeroCard tagline={["Stronger", "Disciplined", "Further"]}>
        <FText variant="overline" tone="accent">
          Hero card sample
        </FText>
        <FText variant="heroTitle" numberOfLines={3}>
          Push — chest & back
        </FText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <InfoChip icon="barbell-outline" label="6 exercises" />
          <InfoChip icon="stats-chart-outline" label="Intermediate" />
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <CtaButton
              title="Start workout"
              icon="play"
              onPress={() => onAction("cta")}
            />
          </View>
          <SquareIconButton
            icon="ellipsis-horizontal"
            label="More options sample"
            onPress={() => onAction("more")}
          />
        </View>
      </HeroCard>
      <ForgeCard>
        <CardHeader
          title="Card header"
          trailing="See all"
          onPress={() => onAction("card header")}
        />
        <StatStrip>
          <Metric value="82.4" unit="kg" label="Sample" size="stat" />
          <Metric value="7h 32m" label="Sample" size="stat" />
          <Metric value="12" label="Sample" size="stat" />
          <Metric
            value="+18%"
            label="Sample"
            size="stat"
            delta="Delta text"
            deltaTone="positive"
          />
        </StatStrip>
      </ForgeCard>
      <ForgeCard variant="active">
        <CardHeader title="Active card" tone="accent" />
        <Metric value="1,940" unit="of 2,400 kcal" size="hero" />
        <ForgeProgress value={0.81} label="Sample progress" />
        <ForgeProgress value={0.6} label="Sample neutral" tone="neutral" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <ForgeRing value={0.6} label="Sample ring" size={96}>
            <FText variant="statMetric">60%</FText>
          </ForgeRing>
          <View style={{ flex: 1, gap: 8 }}>
            <OutlineButton
              title="Pause"
              icon="pause"
              tone="ember"
              onPress={() => onAction("outline ember")}
            />
            <OutlineButton
              title="View goals"
              onPress={() => onAction("outline")}
            />
          </View>
        </View>
      </ForgeCard>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["Tile", "Selected"].map((t, i) => (
          <Tile
            key={t}
            selected={i === 1}
            accessibilityLabel={`${t} sample`}
            onPress={() => onAction(t)}
            style={{ flex: 1 }}
          >
            <FText variant="cardTitle">{t}</FText>
            <FText variant="label" tone="secondary">
              Tile sample
            </FText>
          </Tile>
        ))}
      </View>
      <ForgeCard padding={0} gap={0}>
        <ForgeListRow
          icon="compass-outline"
          title="List row"
          description="Tools & Settings sample"
          onPress={() => onAction("list row")}
        />
        <ForgeListRow
          divider
          icon="calendar-outline"
          title="With value"
          description="Description wraps below when space is short"
          value="12"
          onPress={() => onAction("list row value")}
        />
      </ForgeCard>
    </View>
  );
}

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
    ["successSubtle", c.successSubtle],
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

      <ReforgeReference onAction={setLast} />

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
