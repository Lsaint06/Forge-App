import React, { useState } from "react";
import { View } from "react-native";
import { Alert } from "../platform/alert";
import {
  canSaveToFolder,
  saveBackupToFolder,
  shareBackup,
} from "../platform/backup";
import { backupState } from "../data/backup";
import { useRepo, useApp } from "../state";
import { Txt, Sheet, useColors } from "./ui";
import { ListRow } from "./system";
import { theme } from "../theme";

// Backing up: a confirmed save into a folder (where available) or a share
// to another app, which Forge cannot confirm and records as unconfirmed.

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useBackupActions(
  onComplete?: (outcome: "saved" | "shared") => void,
) {
  const r = useRepo();
  const [busy, setBusy] = useState<"folder" | "share">();
  async function saveToFolder() {
    setBusy("folder");
    try {
      const result = await saveBackupToFolder(r);
      useApp.getState().touch();
      setBusy(undefined);
      if (!result.saved) return;
      Alert.alert(
        "Backup saved",
        `Saved to ${result.folder} and checked. To protect it from a lost phone, keep that folder in cloud storage or copy the file off this phone.`,
      );
      onComplete?.("saved");
    } catch (e) {
      setBusy(undefined);
      Alert.alert("Backup not saved", message(e));
    }
  }
  async function share() {
    setBusy("share");
    try {
      await shareBackup(r);
      useApp.getState().touch();
      setBusy(undefined);
      onComplete?.("shared");
    } catch (e) {
      setBusy(undefined);
      Alert.alert("Share failed", message(e));
    }
  }
  return { busy, folder: canSaveToFolder(), saveToFolder, share };
}

/** Backup choices as grouped rows. */
export function BackupChoices({
  actions,
}: {
  actions: ReturnType<typeof useBackupActions>;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.surfaceRaised,
        borderRadius: theme.radii.card,
        overflow: "hidden",
      }}
    >
      {actions.folder && (
        <ListRow
          icon="folder-outline"
          title={actions.busy === "folder" ? "Saving…" : "Save to a folder"}
          subtitle="Pick a folder, such as Downloads or Google Drive. Forge checks the saved file."
          accessibilityLabel="Save to a folder"
          disabled={!!actions.busy}
          onPress={() => void actions.saveToFolder()}
        />
      )}
      <ListRow
        icon="share-outline"
        title={actions.busy === "share" ? "Preparing…" : "Share a copy"}
        subtitle="Send to email, Drive or another app. Forge can't confirm it was saved."
        accessibilityLabel="Share a copy"
        disabled={!!actions.busy}
        onPress={() => void actions.share()}
      />
    </View>
  );
}

/** You → Export backup. */
export function BackupSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const r = useRepo();
  const actions = useBackupActions(onClose);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Back up your data"
      dismissOnBackdrop
    >
      <Txt tone="secondary">
        {backupState(r).text}. A backup holds your workouts, programs,
        templates, journals and profile in one file you can import later.
      </Txt>
      <BackupChoices actions={actions} />
    </Sheet>
  );
}
