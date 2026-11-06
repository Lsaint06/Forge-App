import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import type { Repository } from "../data/repository";
import { recordBackup, recordShare, folderLabel } from "../data/backup";
import { localDate } from "../domain/types";

/**
 * Writes a file to the cache and opens the share sheet for it. The write is
 * awaited: since Expo SDK 58 `File.write()` is asynchronous, and sharing
 * before it finishes can hand over an empty or partial file.
 */
export async function shareFile(
  name: string,
  content: string | Uint8Array,
  mimeType: string,
  dialogTitle: string,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("This device does not support the native share sheet.");
  const file = new FileSystem.File(FileSystem.Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

export async function downloadBackup(text: string) {
  await shareFile(
    `forge-backup-${Date.now()}.json`,
    text,
    "application/json",
    "Save your FORGE backup",
  );
}

/**
 * Hands a JSON backup of every record to the share sheet (email, Drive,
 * another app). The share sheet never reports whether the file was saved, so
 * this is recorded as an unconfirmed share, not as a backup.
 */
export async function shareBackup(r: Repository) {
  await downloadBackup(JSON.stringify(r.exportBackup(), null, 2));
  recordShare(r);
}

/**
 * Saving straight into a folder the lifter picks (the Storage Access
 * Framework). Android only for now: iOS offers a folder picker too, but it
 * has not been verified on an iPhone.
 */
export const canSaveToFolder = () => Platform.OS === "android";

const cancelled = (e: unknown) =>
  (e as { code?: string })?.code === "ERR_PICKER_CANCELLED" ||
  /cancel/i.test(e instanceof Error ? e.message : String(e));

export type FolderSave = { saved: true; folder: string } | { saved: false };

/**
 * Writes a JSON backup into a folder the lifter picks, reads it back, and
 * records a confirmed backup only if the saved file matches. Returns
 * `{ saved: false }` when the picker is cancelled.
 */
export async function saveBackupToFolder(r: Repository): Promise<FolderSave> {
  let folder: FileSystem.Directory;
  try {
    folder = await FileSystem.Directory.pickDirectoryAsync();
  } catch (e) {
    if (cancelled(e)) return { saved: false };
    throw e;
  }
  const backup = r.exportBackup();
  const text = JSON.stringify(backup, null, 2);
  const file = folder.createFile(
    `forge-backup-${localDate(backup.exportedAt)}-${backup.exportedAt}.json`,
    "application/json",
  );
  await file.write(text);
  if ((await file.text()) !== text)
    throw new Error(
      "The saved file didn't match your data. Try another folder.",
    );
  recordBackup(r, backup.exportedAt);
  return { saved: true, folder: folderLabel(folder.name) };
}

export async function pickBackup(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const file = new FileSystem.File(picked.assets[0].uri);
  if (file.size > 50_000_000) throw new Error("Backup exceeds 50 MB");
  return file.text();
}
