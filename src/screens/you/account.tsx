import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Alert } from "../../platform/alert";
import { pickBackup } from "../../platform/backup";
import { backupState, backupExportedAt, recordBackup } from "../../data/backup";
import { BackupSheet } from "../../components/Backup";
import { cancelAllNotifications } from "../../notifications";
import { InfoSheet } from "../../components/system";
import { useColors } from "../../components/ui";
import {
  FText,
  ForgeCard,
  ForgeListRow,
  SectionLabel,
} from "../../components/reforge";
import { useRepo, confirm } from "../../state";
import { cloudClient } from "../../cloud/client";
import { membership } from "../../domain/membership";
import { forge } from "../../theme";

// Account & privacy (Phase 7.5D; REFORGE since 7.5G.3): membership, data and
// privacy, About and the local-data deletion, with the same copy,
// confirmations and actions as when they were on the You tab.

const privacy = [
  "Backups contain your profile, workouts and sets, custom exercises, favorites, templates, schedules and journals. They do not contain passwords or authentication tokens. Keep exported health data private.",
  "Guest logs stay in the application SQLite database. This database is not encrypted by FORGE; use your device lock. Cloud sync is opt-in and uses the backend you configure. Other apps can read files you share. No advertising or analytics SDK is installed.",
  "Volume counts external load × reps for completed non-warmup sets. Subjective recovery and progression suggestions are transparent heuristics. They are not medical guidance. Exercise instructions are general coaching notes; consult a qualified coach for advanced movements.",
];

export const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** Whether a cloud backend is configured (otherwise guest mode). */
export function cloudConfigured() {
  try {
    return !!cloudClient();
  } catch {
    return false;
  }
}

/** The membership card, as it was on You: free plan, nothing to buy. */
export function MembershipCard() {
  const c = useColors();
  const member = membership();
  return (
    <ForgeCard testID="you-membership">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <FText variant="overline" tone="accent">
          Forge Premium
        </FText>
        <View
          style={{
            paddingHorizontal: 10,
            minHeight: 24,
            justifyContent: "center",
            borderRadius: forge.radii.pill,
            borderWidth: forge.border.card,
            borderColor: c.cardBorder,
            backgroundColor: c.cardRaised,
          }}
        >
          <FText variant="label" weight="600">
            {member.tier === "premium" ? "Premium" : "Free plan"}
          </FText>
        </View>
      </View>
      <FText variant="cardTitle" weight="700" header>
        Membership is on the way
      </FText>
      <FText variant="label" tone="secondary">
        {member.premiumAvailable
          ? "Premium membership options are available."
          : "Membership options will appear here when they're ready. There's nothing to buy yet."}
      </FText>
    </ForgeCard>
  );
}

/** Export, import and privacy guidance, unchanged. */
export function DataPrivacy() {
  const r = useRepo();
  const [info, setInfo] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const backup = backupState(r);
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
  return (
    <>
      <View style={{ gap: forge.spacing.tight }}>
        <SectionLabel title="Data & privacy" />
        <ForgeCard padding={0} gap={0} testID="account-data">
          <ForgeListRow
            icon="download-outline"
            title="Export backup"
            description={backup.text}
            accessibilityLabel="Export backup"
            onPress={() => setBackupOpen(true)}
          />
          <ForgeListRow
            icon="push-outline"
            title="Import backup"
            description="Replace this device's data from a backup"
            divider
            onPress={() => void importData()}
          />
          <ForgeListRow
            icon="shield-checkmark-outline"
            title="Privacy & training guidance"
            divider
            onPress={() => setInfo(true)}
          />
        </ForgeCard>
      </View>
      <InfoSheet
        visible={info}
        onClose={() => setInfo(false)}
        title="Privacy & training guidance"
        paragraphs={privacy}
      />
      <BackupSheet visible={backupOpen} onClose={() => setBackupOpen(false)} />
    </>
  );
}

/** The app version and local data state, as About showed it on You. */
export function AboutForge() {
  const r = useRepo();
  const cloud = cloudConfigured();
  const pending = r.outbox().length;
  const version = Constants.expoConfig?.version ?? "1.0.0";
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <SectionLabel title="About" />
      <ForgeCard gap={2}>
        <View
          accessible
          accessibilityLabel={
            cloud
              ? `FORGE version ${version}, local schema v1, ${pending} pending sync records`
              : `FORGE version ${version}, local schema v1`
          }
          style={{ gap: 2 }}
        >
          <FText variant="cardTitle" weight="700">
            {`FORGE ${version}`}
          </FText>
          {/* Guest mode never syncs, so a waiting count would only confuse;
              the outbox itself is unchanged. */}
          <FText variant="label" tone="secondary">
            {cloud
              ? `Local schema v1 · ${plural(pending, "pending sync record")}`
              : "Local schema v1 · guest mode"}
          </FText>
        </View>
      </ForgeCard>
    </View>
  );
}

/**
 * Deleting everything on this phone: the same confirmation and result as
 * before (cloud records are not deleted). Shown in Account & privacy's
 * Delete section, apart from everyday actions.
 */
export function DeleteLocalData() {
  const r = useRepo();
  return (
    <DangerRow
      title="Delete all local data"
      description="Removes every workout, template, preference and journal entry on this phone."
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
  );
}

/**
 * An irreversible action: a trash icon, "Delete …" in words, what it removes
 * and the error colour. It always asks first (the caller's confirmation).
 */
export function DangerRow({
  title,
  description,
  onPress,
  divider = false,
  disabled = false,
}: {
  title: string;
  description: string;
  onPress: () => void;
  divider?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: forge.spacing.group,
        opacity: disabled ? 0.4 : 1,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
        backgroundColor: pressed ? c.cardRaised : "transparent",
      })}
    >
      <Ionicons
        name="trash-outline"
        size={22}
        color={c.error}
        style={{ width: 26 }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <FText variant="cardTitle" weight="700" tone="error">
          {title}
        </FText>
        <FText variant="label" tone="secondary">
          {description}
        </FText>
      </View>
    </Pressable>
  );
}
