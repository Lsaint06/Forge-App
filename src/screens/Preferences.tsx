import React, { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { goBack } from "../navigation";
import { Sheet, useColors } from "../components/ui";
import {
  FText,
  ForgeCard,
  ForgeListRow,
  ForgeSegments,
  ForgeSubScreen,
  SectionLabel,
} from "../components/reforge";
import { toggleNotifications } from "../components/ProfileForm";
import { HydrationSettings } from "../components/nutrition/HydrationSheet";
import { replayIntro } from "../components/splash/session";
import { useRepo, useApp, mutate } from "../state";
import { experienceLevel, restDayName, trainingGoal } from "../domain/profile";
import { loadText } from "../domain/progress/format";
import { TARGETS_SAVED, targetsPersonalized } from "../domain/nutrition";
import { fluidUnitOf, unitLabel, volumeText } from "../domain/hydration";
import { forge } from "../theme";
import { EditorSheet, type Editor } from "./you/editors";

// Preferences (Phase 7.5D): the settings that were on the You tab, grouped
// on one screen. Every control keeps its editor, values, validation and
// side effects; only its place changed.

/** A titled group of rows in one hairline card. */
function Group({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <SectionLabel title={title} />
      <ForgeCard padding={0} gap={0}>
        {children}
      </ForgeCard>
      {footer && (
        <FText
          variant="label"
          tone="secondary"
          style={{ paddingHorizontal: 2 }}
        >
          {footer}
        </FText>
      )}
    </View>
  );
}

/** A labelled control (segments) inside a group. */
function ControlRow({
  title,
  divider = false,
  children,
}: {
  title: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 12,
        gap: 10,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <FText variant="cardTitle" weight="700">
        {title}
      </FText>
      {children}
    </View>
  );
}

export default function Preferences() {
  const r = useRepo();
  const c = useColors();
  // Re-read the profile whenever stored data changes.
  useApp((s) => s.revision);
  const p = r.profile();
  const [editor, setEditor] = useState<Editor>();
  const [hydration, setHydration] = useState(false);
  const experience = experienceLevel(p);
  const goal = trainingGoal(p);
  const restDay = restDayName(p);
  return (
    <ForgeSubScreen
      title="Preferences"
      eyebrow="You"
      onBack={() => goBack("/(tabs)/profile")}
    >
      <Group title="Training">
        <ForgeListRow
          icon="flag-outline"
          title="Training focus"
          description={[
            experience ?? "Experience not set",
            goal ?? "Goal not set",
            restDay ? `Rests ${restDay}` : "No rest day",
          ].join(" · ")}
          onPress={() => setEditor("focus")}
        />
        <ForgeListRow
          icon="options-outline"
          title="Training preferences"
          description={`${p.frequency}× a week · ${p.rest}s rest · ${p.repMin}–${p.repMax} reps · +${loadText(p.increment, p.units).replace(" ", "\u00a0")}`}
          divider
          onPress={() => setEditor("training")}
        />
      </Group>

      <Group title="Nutrition">
        <ForgeListRow
          icon="nutrition-outline"
          title="Nutrition targets"
          description={
            targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1")
              ? `${p.calories.toLocaleString()} kcal · ${p.protein} g protein`
              : "Not set"
          }
          onPress={() => setEditor("nutrition")}
        />
        <ForgeListRow
          icon="water-outline"
          title="Hydration"
          description={`${
            p.waterGoal === undefined
              ? "No daily goal"
              : `${volumeText(p.waterGoal, fluidUnitOf(p))} a day`
          } · ${unitLabel(fluidUnitOf(p))}`}
          divider
          onPress={() => setHydration(true)}
        />
      </Group>

      <Group title="Display & units">
        <ControlRow title="Units">
          <ForgeSegments
            accessibilityLabel="Units"
            options={[
              { value: "kg", label: "Kilograms" },
              { value: "lb", label: "Pounds" },
            ]}
            value={p.units}
            onChange={(units) =>
              mutate(() => r.saveProfile({ units: units as "kg" | "lb" }))
            }
          />
        </ControlRow>
        <ControlRow title="Appearance" divider>
          <ForgeSegments
            accessibilityLabel="Appearance"
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
            ]}
            value={p.theme}
            onChange={(t) =>
              mutate(() =>
                r.saveProfile({ theme: t as "dark" | "light" | "system" }),
              )
            }
          />
        </ControlRow>
      </Group>

      <Group
        title="Notifications"
        footer="Rest-timer alerts and scheduled workout reminders. Workouts and in-app timers work either way."
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Training reminders"
          accessibilityHint={p.notifications ? "On" : "Off"}
          onPress={() => toggleNotifications(r)}
          style={({ pressed }) => ({
            minHeight: 56,
            paddingHorizontal: forge.spacing.cardPadding,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: forge.spacing.group,
            backgroundColor: pressed ? c.cardRaised : "transparent",
          })}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={c.emberHot}
            style={{ width: 26 }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <FText variant="cardTitle" weight="700">
              Training reminders
            </FText>
            <FText variant="label" tone="secondary">
              {p.notifications ? "On" : "Off"}
            </FText>
          </View>
          <Switch
            accessibilityLabel="Training reminders switch"
            value={p.notifications}
            onValueChange={() => toggleNotifications(r)}
            trackColor={{ true: c.ember, false: c.surfaceRaised }}
            thumbColor={c.text}
          />
        </Pressable>
      </Group>

      {__DEV__ && (
        <Group title="Development">
          <ForgeListRow
            icon="flame-outline"
            title="Replay intro (development only)"
            onPress={replayIntro}
          />
          <ForgeListRow
            icon="color-palette-outline"
            title="Design system (development only)"
            divider
            onPress={() => router.push("/design-system")}
          />
        </Group>
      )}

      <EditorSheet editor={editor} onClose={() => setEditor(undefined)} />
      {/* The same goal and unit fields as the hydration sheet (7.3C, H8). */}
      <Sheet
        visible={hydration}
        onClose={() => setHydration(false)}
        title="Hydration"
      >
        <HydrationSettings />
      </Sheet>
    </ForgeSubScreen>
  );
}
