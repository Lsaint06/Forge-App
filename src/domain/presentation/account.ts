// Account & privacy (Phase 7.5G.3): plain words for the account screen.
// Presentation only: sync, conflicts and records are unchanged.

const JOURNAL: Record<string, string> = {
  goal: "Goal",
  measurement: "Measurement",
  recovery: "Recovery check-in",
  nutrition: "Food log entry",
  food: "Saved food",
  hydration: "Water log entry",
  schedule: "Scheduled workout",
  program: "Program",
};

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * What a sync conflict is about, from the preserved cloud record, without
 * internal identifiers: "Workout · Push day", "Goal · Cut to 80",
 * "Your profile". Unreadable records are "A synced record".
 */
export function conflictTitle(remote: string) {
  let row: { kind?: unknown; payload?: unknown };
  try {
    row = JSON.parse(remote) as typeof row;
  } catch {
    return "A synced record";
  }
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  switch (row.kind) {
    case "profile":
      return "Your profile";
    case "workout": {
      const name = text((p.workout as { name?: unknown } | undefined)?.name);
      return name ? `Workout · ${name}` : "Workout";
    }
    case "template":
      return text(p.name) ? `Template · ${text(p.name)}` : "Template";
    case "exercise":
      return text(p.name)
        ? `Custom exercise · ${text(p.name)}`
        : "Custom exercise";
    case "journal": {
      const kind =
        typeof p.kind === "string"
          ? (JOURNAL[p.kind] ?? "Journal entry")
          : "Journal entry";
      const name = text(data.name);
      return name ? `${kind} · ${name}` : kind;
    }
    default:
      return "A synced record";
  }
}

/** "3 changes waiting to upload" / "No local changes waiting to upload". */
export function pendingText(pending: number) {
  return pending
    ? `${pending.toLocaleString()} ${pending === 1 ? "change" : "changes"} waiting to upload`
    : "No local changes waiting to upload";
}
