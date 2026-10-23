import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { readForRescue, databaseFileUri } from "../data/native";
import { rescueData } from "../data/rescue";
import { downloadBackup, shareFile } from "./backup";

// Native steps for the recovery screen.

const title = "Save a copy of your FORGE data";

/** Every record as backup JSON, read without running migrations. */
function exportJson() {
  return readForRescue((r) => JSON.stringify(r.exportBackup(), null, 2));
}

/**
 * A byte copy of the database. Serializing through SQLite includes changes
 * still in the write-ahead log; if the database cannot even be opened, the
 * file on disk is copied as it is.
 */
async function shareDatabase() {
  const name = `forge-database-${Date.now()}.db`;
  let bytes: Uint8Array | undefined;
  try {
    bytes = readForRescue((_, serialize) => serialize());
  } catch {
    bytes = undefined;
  }
  if (bytes) {
    await shareFile(name, bytes, "application/octet-stream", title);
    return;
  }
  const source = new FileSystem.File(databaseFileUri());
  // Expo Go keeps databases outside the folders a project may read, so this
  // last resort only works in an installed FORGE build.
  if (!source.exists)
    throw new Error(
      "The database file couldn't be read. Keep FORGE installed and ask for help.",
    );
  const copy = new FileSystem.File(FileSystem.Paths.cache, name);
  await source.copy(copy);
  await Sharing.shareAsync(copy.uri, {
    mimeType: "application/octet-stream",
    dialogTitle: title,
  });
}

export function rescue() {
  return rescueData({ exportJson, shareJson: downloadBackup, shareDatabase });
}
