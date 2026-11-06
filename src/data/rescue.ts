// Rescuing data when Forge cannot start. The readable JSON backup comes first
// (it can be imported again); if the records cannot be read, a raw copy of
// the database file is shared instead so nothing is lost.

export type RescueResult =
  | { kind: "backup" }
  | { kind: "database"; reason: string }
  | { kind: "failed"; message: string };

const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e ?? "Unknown error");

export async function rescueData(steps: {
  /** Reads every record as backup JSON (throws when the data is unreadable). */
  exportJson: () => string;
  shareJson: (text: string) => Promise<void>;
  /** Shares a copy of the database file itself. */
  shareDatabase: () => Promise<void>;
}): Promise<RescueResult> {
  let text: string;
  try {
    text = steps.exportJson();
  } catch (e) {
    try {
      await steps.shareDatabase();
      return { kind: "database", reason: message(e) };
    } catch (raw) {
      return { kind: "failed", message: message(raw) };
    }
  }
  try {
    await steps.shareJson(text);
    return { kind: "backup" };
  } catch (e) {
    return { kind: "failed", message: message(e) };
  }
}
