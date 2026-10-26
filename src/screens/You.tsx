import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, Switch } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Alert } from "../platform/alert";
import { pickBackup } from "../platform/backup";
import { backupState, backupExportedAt, recordBackup } from "../data/backup";
import { BackupSheet } from "../components/Backup";
import { cancelAllNotifications } from "../notifications";
import {
  Screen,
  Card,
  Txt,
  Sheet,
  SegmentedControl,
  useColors,
} from "../components/ui";
import { ListRow, ListSection, InfoSheet } from "../components/system";
import {
  ProfileForm,
  toggleNotifications,
  type ProfileField,
} from "../components/ProfileForm";
import { planStatus } from "../components/PlanRow";
import { libraryPrograms } from "../programs";
import { useRepo, useApp, confirm, mutate } from "../state";
import { replayIntro } from "../components/splash/session";
import {
  experienceLevel,
  missingTrainingProfile,
  restDayName,
  trainingGoal,
} from "../domain/profile";
import { elapsedSeconds } from "../domain/metrics";
import { isWorkingSet } from "../domain/progress/strength";
import { compactNumber, loadText } from "../domain/progress/format";
import { progressModel } from "../data/progress";
import { membership } from "../domain/membership";
import { TARGETS_SAVED, targetsPersonalized } from "../domain/nutrition";
import { fluidUnitOf, unitLabel, volumeText } from "../domain/hydration";
import { HydrationSettings } from "../components/nutrition/HydrationSheet";
import { cloudClient } from "../cloud/client";
import { theme } from "../theme";

// You (Design System 2.0, Phase 6): the lifter's profile, a lifetime training
// snapshot and every setting, grouped. Settings are edited through focused
// sheets built on the same ProfileForm as onboarding, so validation and
// storage are unchanged.

type Editor = "profile" | "focus" | "training" | "nutrition";
const editors: Record<
  Editor,
  { title: string; fields: ProfileField[]; save: string }
> = {
  profile: {
    title: "Edit profile",
    fields: ["name", "height", "weight", "bodyFat"],
    save: "Save profile",
  },
  focus: {
    title: "Training focus",
    fields: ["journey"],
    save: "Save training focus",
  },
  training: {
    title: "Training preferences",
    fields: ["frequency", "rest", "increment", "repMin", "repMax", "muscles"],
    save: "Save preferences",
  },
  nutrition: {
    title: "Nutrition targets",
    fields: ["calories", "protein", "carbs", "fat"],
    save: "Save targets",
  },
};

const privacy = [
  "Backups contain your profile, workouts and sets, custom exercises, favorites, templates, schedules and journals. They do not contain passwords or authentication tokens. Keep exported health data private.",
  "Guest logs stay in the application SQLite database. This database is not encrypted by FORGE; use your device lock. Cloud sync is opt-in and uses the backend you configure. Other apps can read files you share. No advertising or analytics SDK is installed.",
  "Volume counts external load × reps for completed non-warmup sets. Subjective recovery and progression suggestions are transparent heuristics. They are not medical guidance. Exercise instructions are general coaching notes; consult a qualified coach for advanced movements.",
];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "F";
const monthYear = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const listText = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function cloudConfigured() {
  try {
    return !!cloudClient();
  } catch {
    return false;
  }
}

function Avatar({ name }: { name: string }) {
  const c = useColors();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: c.surfaceRaised,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: c.ember,
      }}
    >
      <Txt variant="title" weight="800">
        {initials(name)}
      </Txt>
    </View>
  );
}

function Snapshot({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 18 }}>
      {stats.map((s) => (
        <View
          key={s.label}
          accessible
          accessibilityLabel={`${s.label}: ${s.value}`}
          style={{ width: "50%", gap: 2, paddingRight: 8 }}
        >
          <Txt variant="metric" numberOfLines={1}>
            {s.value}
          </Txt>
          <Txt variant="overline" tone="secondary" numberOfLines={1}>
            {s.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** A labelled control inside a grouped list. */
function ControlRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.row,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <Txt weight="600">{title}</Txt>
      {children}
    </View>
  );
}

export default function You() {
  const r = useRepo();
  const c = useColors();
  const revision = useApp((s) => s.revision);
  const params = useLocalSearchParams<{ edit?: string }>();
  const p = r.profile();
  const [editor, setEditor] = useState<Editor>();
  const [hydration, setHydration] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [info, setInfo] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  // Opens an editor requested by a link (e.g. Library's "Complete training
  // profile"), once per request.
  const [handled, setHandled] = useState<string>();
  if (params.edit !== handled) {
    setHandled(params.edit);
    if (params.edit && params.edit in editors) setEditor(params.edit as Editor);
  }
  useEffect(() => {
    if (params.edit) router.setParams({ edit: undefined });
  }, [params.edit]);
  // The repository is mutable; `revision` changes whenever stored data does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => progressModel(r), [r, revision]);
  const done = r.workouts().filter((w) => w.status === "completed");
  const first = done.reduce<number | undefined>(
    (t, w) => Math.min(t ?? Infinity, w.finishedAt ?? w.startedAt),
    undefined,
  );
  const hours =
    done.reduce(
      (n, w) =>
        n +
        elapsedSeconds(w.startedAt, w.finishedAt ?? w.startedAt, w.pausedMs),
      0,
    ) / 3600;
  const sets = model.log.reduce(
    (n, e) => n + e.sets.filter(isWorkingSet).length,
    0,
  );
  const goal = trainingGoal(p);
  const experience = experienceLevel(p);
  const restDay = restDayName(p);
  const missing = missingTrainingProfile(p);
  const plan = planStatus(r);
  const member = membership();
  const cloud = cloudConfigured();
  const pending = r.outbox().length;
  const backup = backupState(r);
  const version = Constants.expoConfig?.version ?? "1.0.0";

  function close() {
    setEditor(undefined);
    setDirty(false);
  }
  async function importData() {
    try {
      const text = await pickBackup();
      if (text === null) return;
      confirm(
        "Replace local data from backup?",
        "Every workout, template, preference and journal entry on this phone is replaced by the backup's contents, if the file is valid. This can't be undone, so export first. If cloud sync is enabled, the local sync identity resets and your next sync may report conflicts.",
        () => {
          try {
            r.importBackup(text);
          } catch (e) {
            // Unreadable or invalid files get one plain message; the details
            // stay in the developer log.
            if (
              e instanceof SyntaxError ||
              (!!e && typeof e === "object" && "issues" in e)
            ) {
              console.warn("[FORGE] Backup import rejected", e);
              throw new Error(
                "This file isn't a valid FORGE backup. Nothing was changed.",
              );
            }
            throw e;
          }
          // The data now matches that backup file, so it is protected up to
          // the moment it was exported.
          const at = backupExportedAt(text);
          if (at) recordBackup(r, at);
        },
        { action: "Replace data" },
      );
    } catch (e) {
      Alert.alert("Import failed", e instanceof Error ? e.message : String(e));
    }
  }
  const journal = (kind: string) =>
    router.push({ pathname: "/journal", params: { kind } });

  return (
    <Screen title="You">
      <Card style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Avatar name={p.name} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title" header numberOfLines={2}>
              {p.name}
            </Txt>
            <Txt tone="secondary" numberOfLines={2}>
              {[
                experience ?? "Experience not set",
                goal ?? "Goal not set",
              ].join(" · ")}
            </Txt>
            <Txt variant="caption" tone="secondary">
              {first ? `Training since ${monthYear(first)}` : "No workouts yet"}
            </Txt>
          </View>
        </View>
        <View
          style={{
            marginHorizontal: -20,
            borderTopWidth: 0.5,
            borderColor: c.hairline,
          }}
        >
          {plan ? (
            <ListRow
              icon="trail-sign-outline"
              title={plan.title}
              subtitle={plan.subtitle}
              accessibilityLabel={`${plan.kind === "program" ? "Your program" : "Your Path"}: ${plan.title}`}
              onPress={plan.open}
            />
          ) : (
            <ListRow
              icon="trail-sign-outline"
              title="No active plan"
              subtitle={`Browse ${libraryPrograms().length} Forge Paths programs`}
              onPress={() => router.push("/forge-paths")}
            />
          )}
          {p.onboarded && missing.length > 0 && (
            <ListRow
              icon="alert-circle-outline"
              title="Complete your training profile"
              subtitle={`Add your ${listText(
                missing.map((m) => (m === "restDay" ? "rest day" : m)),
              )} for program recommendations`}
              onPress={() => setEditor("focus")}
            />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          onPress={() => setEditor("profile")}
          style={({ pressed }) => ({
            minHeight: 44,
            borderRadius: theme.radii.control,
            backgroundColor: pressed ? c.selected : c.surfaceRaised,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          })}
        >
          <Ionicons name="create-outline" size={18} color={c.text} />
          <Txt weight="600">Edit profile</Txt>
        </Pressable>
      </Card>

      <ListSection title="Training snapshot">
        <View style={{ padding: theme.spacing.row }}>
          {done.length ? (
            <Snapshot
              stats={[
                { value: done.length.toLocaleString(), label: "Workouts" },
                { value: compactNumber(sets), label: "Working sets" },
                { value: String(model.events.length), label: "Records" },
                {
                  value:
                    hours < 1
                      ? `${Math.round(hours * 60)} min`
                      : hours < 10
                        ? `${hours.toFixed(1)} h`
                        : `${compactNumber(Math.round(hours))} h`,
                  label: "Time trained",
                },
              ]}
            />
          ) : (
            <Txt tone="secondary">
              Your lifetime totals appear here after your first workout.
            </Txt>
          )}
        </View>
        {/* Training history lives here (Phase 7.2B): with the lifetime
            totals it reviews, edits and repeats. */}
        <ListRow
          icon="time-outline"
          title="Training history"
          subtitle={
            done.length
              ? `${done.length.toLocaleString()} completed ${done.length === 1 ? "workout" : "workouts"} · review, edit or repeat`
              : "Finished workouts appear here"
          }
          onPress={() => router.push("/history")}
        />
        <ListRow
          icon="stats-chart-outline"
          title="View progress"
          onPress={() => router.navigate("/(tabs)/progress")}
        />
      </ListSection>

      <Card style={{ padding: 20, gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Txt variant="overline" tone="accent">
            Forge Premium
          </Txt>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.radii.pill,
              backgroundColor: c.surfaceRaised,
            }}
          >
            <Txt variant="caption" weight="600">
              {member.tier === "premium" ? "Premium" : "Free plan"}
            </Txt>
          </View>
        </View>
        <Txt variant="headline" header>
          Membership is on the way
        </Txt>
        <Txt variant="caption" tone="secondary">
          {member.premiumAvailable
            ? "Premium membership options are available."
            : "Membership options will appear here when they're ready. There's nothing to buy yet."}
        </Txt>
      </Card>

      <ListSection title="Training">
        <ListRow
          icon="flag-outline"
          title="Training focus"
          subtitle={[
            experience ?? "Experience not set",
            goal ?? "Goal not set",
            restDay ? `Rests ${restDay}` : "No rest day",
          ].join(" · ")}
          onPress={() => setEditor("focus")}
        />
        <ListRow
          icon="options-outline"
          title="Training preferences"
          subtitle={`${p.frequency}× a week · ${p.rest}s rest · ${p.repMin}–${p.repMax} reps · +${loadText(p.increment, p.units).replace(" ", "\u00a0")}`}
          onPress={() => setEditor("training")}
        />
        <ListRow
          icon="nutrition-outline"
          title="Nutrition targets"
          subtitle={
            targetsPersonalized(p, r.setting(TARGETS_SAVED) === "1")
              ? `${p.calories.toLocaleString()} kcal · ${p.protein} g protein`
              : "Not set"
          }
          onPress={() => setEditor("nutrition")}
        />
        <ListRow
          icon="water-outline"
          title="Hydration"
          subtitle={`${
            p.waterGoal === undefined
              ? "No daily goal"
              : `${volumeText(p.waterGoal, fluidUnitOf(p))} a day`
          } · ${unitLabel(fluidUnitOf(p))}`}
          onPress={() => setHydration(true)}
        />
      </ListSection>

      <ListSection title="Health & body">
        <ListRow
          icon="body-outline"
          title="Body measurements"
          onPress={() => journal("measurement")}
        />
        <ListRow
          icon="restaurant-outline"
          title="Nutrition log"
          onPress={() => router.navigate("/(tabs)/nutrition")}
        />
        <ListRow
          icon="pulse-outline"
          title="Recovery"
          onPress={() => journal("recovery")}
        />
        <ListRow
          icon="trophy-outline"
          title="Goals"
          onPress={() => journal("goal")}
        />
      </ListSection>

      <ListSection
        title="Notifications"
        footer="Rest-timer alerts and scheduled workout reminders. Workouts and in-app timers work either way."
      >
        <ListRow
          icon="notifications-outline"
          title="Training reminders"
          subtitle={p.notifications ? "On" : "Off"}
          accessibilityLabel="Training reminders"
          chevron={false}
          onPress={() => toggleNotifications(r)}
          trailing={
            <Switch
              accessibilityLabel="Training reminders switch"
              value={p.notifications}
              onValueChange={() => toggleNotifications(r)}
              trackColor={{ true: c.ember, false: c.surfaceRaised }}
              thumbColor={c.text}
            />
          }
        />
      </ListSection>

      <ListSection title="App">
        <ControlRow title="Units">
          <SegmentedControl
            label="Units"
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
        <ControlRow title="Appearance">
          <SegmentedControl
            label="Appearance"
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
      </ListSection>

      <ListSection title="Account & data">
        <ListRow
          icon="cloud-outline"
          title="Account & cloud sync"
          subtitle={
            cloud
              ? pending
                ? `${plural(pending, "change")} waiting to sync`
                : "Sign in to sync across devices"
              : "Guest mode · data stays on this device"
          }
          onPress={() => router.push("/account")}
        />
        <ListRow
          icon="download-outline"
          title="Export backup"
          subtitle={backup.text}
          accessibilityLabel="Export backup"
          onPress={() => setBackupOpen(true)}
        />
        <ListRow
          icon="push-outline"
          title="Import backup"
          subtitle="Replace this device's data from a backup"
          onPress={() => void importData()}
        />
        <ListRow
          icon="shield-checkmark-outline"
          title="Privacy & training guidance"
          onPress={() => setInfo(true)}
        />
        <ListRow
          icon="trash-outline"
          title="Delete all local data"
          destructive
          onPress={() =>
            confirm(
              "Delete all local data?",
              "Every workout, template, preference and journal entry on this phone is deleted, and FORGE starts again from setup. This can't be undone, so export a backup first. Your cloud account and cloud records are not deleted; a later sync can restore them.",
              () => {
                r.clearData();
                void cancelAllNotifications().catch((e) =>
                  Alert.alert("Reminder cleanup failed", String(e)),
                );
                router.replace("/onboarding");
              },
              { action: "Delete everything" },
            )
          }
        />
      </ListSection>

      <ListSection title="About">
        <ListRow
          title={`FORGE ${version}`}
          accessibilityLabel={
            cloud
              ? `FORGE version ${version}, local schema v1, ${pending} pending sync records`
              : `FORGE version ${version}, local schema v1`
          }
          // Guest mode never syncs, so a waiting count would only confuse;
          // the outbox itself is unchanged.
          subtitle={
            cloud
              ? `Local schema v1 · ${plural(pending, "pending sync record")}`
              : "Local schema v1 · guest mode"
          }
        />
        {__DEV__ && (
          <ListRow
            icon="flame-outline"
            title="Replay intro (development only)"
            onPress={replayIntro}
          />
        )}
        {__DEV__ && (
          <ListRow
            icon="color-palette-outline"
            title="Design system (development only)"
            onPress={() => router.push("/design-system")}
          />
        )}
      </ListSection>

      <InfoSheet
        visible={info}
        onClose={() => setInfo(false)}
        title="Privacy & training guidance"
        paragraphs={privacy}
      />
      <BackupSheet visible={backupOpen} onClose={() => setBackupOpen(false)} />
      <Sheet
        visible={!!editor}
        onClose={close}
        title={editor ? editors[editor].title : ""}
        unsaved={dirty}
      >
        {editor && (
          <ProfileForm
            key={editor}
            fields={editors[editor].fields}
            saveLabel={editors[editor].save}
            onDirtyChange={setDirty}
            onDone={() => {
              // Called only after a successful save: the targets are now the
              // lifter's own, even if they match the suggested defaults.
              if (editor === "nutrition")
                mutate(() => r.setSetting(TARGETS_SAVED, "1"));
              close();
            }}
          />
        )}
      </Sheet>
      {/* The same goal and unit fields as the hydration sheet (7.3C, H8). */}
      <Sheet
        visible={hydration}
        onClose={() => setHydration(false)}
        title="Hydration"
      >
        <HydrationSettings />
      </Sheet>
    </Screen>
  );
}
