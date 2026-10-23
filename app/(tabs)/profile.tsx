import React, { useState } from "react";
import { Alert } from "../../src/platform/alert";
import { router } from "expo-router";
import { downloadBackup, pickBackup } from "../../src/platform/backup";
import { cancelAllNotifications } from "../../src/notifications";
import {
  Screen,
  Card,
  Label,
  Button,
  Sheet,
  Row,
} from "../../src/components/ui";
import { ProfileForm } from "../../src/components/ProfileForm";
import { useRepo, confirm } from "../../src/state";
import { SectionHeader } from "../../src/components/design";
import { replayIntro } from "../../src/components/splash/session";
import {
  experienceLevel,
  missingTrainingProfile,
  restDayName,
  trainingGoal,
} from "../../src/domain/profile";
export default function Profile() {
  const r = useRepo();
  const p = r.profile();
  const [edit, setEdit] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const missing = missingTrainingProfile(p);
  const goal = trainingGoal(p);
  const experience = experienceLevel(p);
  const restDay = restDayName(p);
  async function exportData() {
    try {
      await downloadBackup(JSON.stringify(r.exportBackup(), null, 2));
    } catch (e) {
      Alert.alert("Export failed", String(e));
    }
  }
  async function importData() {
    try {
      const text = await pickBackup();
      if (text === null) return;
      confirm(
        "Replace local data from backup?",
        "All current records will be replaced atomically if the backup is valid. Export first. If cloud sync is enabled, this resets the local sync identity and may cause conflicts on your next sync.",
        () => r.importBackup(text),
      );
    } catch (e) {
      Alert.alert("Import failed", e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <Screen title="You" eyebrow={p.name}>
      <SectionHeader title="Personal" />
      {p.onboarded && missing.length > 0 && (
        <Card>
          <Label bold size={20}>
            Complete your training profile
          </Label>
          <Label muted>
            Choose your{" "}
            {missing
              .map((m) =>
                m === "experience"
                  ? "training experience"
                  : m === "goal"
                    ? "training goal"
                    : "preferred rest day",
              )
              .join(", ")}{" "}
            so Forge can recommend a program. Optional — you can browse every
            program either way.
          </Label>
          <Button
            title="Complete training profile"
            icon="create-outline"
            onPress={() => setEdit(true)}
          />
        </Card>
      )}
      <Card>
        <Label size={24} bold>
          {goal ?? "Training goal not set"}
        </Label>
        <Label muted>
          {experience ?? "Experience not set"} ·{" "}
          {restDay ? `Rests ${restDay}` : "No rest day chosen"} ·{" "}
          {p.units.toUpperCase()}
        </Label>
        <Button
          title="Edit profile & preferences"
          secondary
          onPress={() => setEdit(true)}
        />
        <Button
          title="Account & cloud sync"
          secondary
          onPress={() => router.push("/account")}
        />
      </Card>
      <SectionHeader title="Training & wellness" />
      <Row>
        <Button
          title="Body measurements"
          secondary
          onPress={() =>
            router.push({
              pathname: "/journal",
              params: { kind: "measurement" },
            })
          }
        />
        <Button
          title="Nutrition"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "nutrition" } })
          }
        />
        <Button
          title="Recovery"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "recovery" } })
          }
        />
        <Button
          title="Goals"
          secondary
          onPress={() =>
            router.push({ pathname: "/journal", params: { kind: "goal" } })
          }
        />
      </Row>
      <SectionHeader title="Milestones" />
      <Button
        title="Achievements & progress"
        secondary
        icon="ribbon-outline"
        onPress={() => router.push("/(tabs)/progress")}
      />
      <Button
        title="Training history"
        secondary
        icon="time-outline"
        onPress={() => router.push("/(tabs)/train")}
      />
      <SectionHeader title="Account & data" />
      <Card>
        <Label bold size={21}>
          Own your data
        </Label>
        <Label muted>
          Backups contain your profile, workouts and sets, custom exercises,
          favorites, templates, schedules and journals. They do not contain
          passwords or authentication tokens. Keep exported health data private.
        </Label>
        <Button
          title="Export JSON backup"
          secondary
          onPress={() => void exportData()}
        />
        <Button
          title="Import JSON backup"
          secondary
          onPress={() => void importData()}
        />
        <Button
          title="Delete all local data"
          danger
          onPress={() =>
            confirm(
              "Delete all local data?",
              "This removes every local workout, template, preference and journal entry. Cloud records and your account are not deleted. Export first. A later sync can restore cloud records.",
              () => {
                r.clearData();
                void cancelAllNotifications().catch((e) =>
                  Alert.alert("Reminder cleanup failed", String(e)),
                );
                router.replace("/onboarding");
              },
            )
          }
        />
      </Card>
      <Card>
        <Label bold>Privacy & training guidance</Label>
        <Label muted>
          Guest logs stay in the application SQLite database. This database is
          not encrypted by FORGE; use your device lock. Cloud sync is opt-in and
          uses the backend you configure. Other apps can read files you share.
          No advertising or analytics SDK is installed.
        </Label>
        <Label muted>
          Volume counts external load × reps for completed non-warmup sets.
          Subjective recovery and progression suggestions are transparent
          heuristics. They are not medical guidance. Exercise instructions are
          general coaching notes; consult a qualified coach for advanced
          movements.
        </Label>
        <Label muted size={12}>
          FORGE · Design 2 · Local schema v1 · {r.outbox().length} pending sync
          records
        </Label>
        {__DEV__ && (
          <Button
            title="Replay intro (development only)"
            secondary
            icon="flame-outline"
            onPress={replayIntro}
          />
        )}
        {__DEV__ && (
          <Button
            title="Design system (development only)"
            secondary
            icon="color-palette-outline"
            onPress={() => router.push("/design-system")}
          />
        )}
      </Card>
      <Sheet
        visible={edit}
        onClose={() => {
          setEdit(false);
          setPrefsDirty(false);
        }}
        title="Your preferences"
        unsaved={prefsDirty}
      >
        <ProfileForm
          onDirtyChange={setPrefsDirty}
          onDone={() => {
            setEdit(false);
            setPrefsDirty(false);
            Alert.alert("Saved", "Your preferences have been updated.");
          }}
        />
      </Sheet>
    </Screen>
  );
}
