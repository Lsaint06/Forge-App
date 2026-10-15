import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

export async function downloadBackup(text: string) {
  const file = new FileSystem.File(
    FileSystem.Paths.cache,
    `forge-backup-${Date.now()}.json`,
  );
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("This device does not support the native share sheet.");
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: "Save your FORGE backup",
  });
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
