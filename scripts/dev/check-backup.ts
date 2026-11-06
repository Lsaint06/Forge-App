// npm run backup:check -- <forge-backup.json>: checks a FORGE backup file
// without changing it (Phase 8.3B). It reads the file, and nothing else: it
// never writes the file, a phone or the cloud.
// - A fingerprint (SHA-256), so two copies can be compared.
// - Whether it's readable JSON in the backup format this Forge reads.
// - A trial restore into a throwaway in-memory database, with Forge's own
//   importBackup (the same checks a phone runs before replacing its data),
//   then an export, whose counts must match the file's.
// It prints counts, dates and the fingerprint only: no names, notes or
// values. Exit status: 0 restorable, 1 not, 2 no file given or readable.
// See docs/audits/PHASE_8_3A_DEVICE_VALIDATION.md (§4).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../../src/data/repository";
import { localDate } from "../../src/domain/types";
import { backupSchema } from "../../src/domain/validation";

export type BackupCheck = {
  /** Readable, in this Forge's format, and restorable. */
  ok: boolean;
  bytes: number;
  sha256: string;
  /** One line per finding, "✓ …" or "✗ …", then indented counts. */
  lines: string[];
};

/** A throwaway SQLite database in memory, with Forge's schema. */
function memoryRepository() {
  const db = new DatabaseSync(":memory:");
  const r = new Repository({
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  });
  r.migrate();
  return { r, close: () => db.close() };
}

/** A failure's first line, without the values a schema error may quote. */
function reason(e: unknown) {
  const issues = (e as { issues?: { path?: unknown[]; message?: string }[] })
    ?.issues;
  if (Array.isArray(issues) && issues[0])
    return `${(issues[0].path ?? []).join(".") || "file"}: ${issues[0].message ?? "invalid"}`.slice(
      0,
      160,
    );
  return (e instanceof Error ? e.message : String(e))
    .split("\n")[0]!
    .slice(0, 160);
}

export function checkBackup(content: Buffer | string): BackupCheck {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const text = bytes.toString("utf8");
  const result: BackupCheck = {
    ok: false,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    lines: [],
  };
  const say = (line: string) => result.lines.push(line);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
    say("✓ Readable JSON");
  } catch (e) {
    say(`✗ Not readable JSON (incomplete or damaged): ${reason(e)}`);
    return result;
  }
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > 1) {
    say(
      `✗ Made by a newer version of Forge (format ${version}): update Forge before restoring it`,
    );
    return result;
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    say(`✗ Not a FORGE backup this version can read: ${reason(parsed.error)}`);
    return result;
  }
  const b = parsed.data;
  const finished = b.workouts.filter((w) => w.status === "completed");
  const latest = Math.max(0, ...finished.map((w) => w.finishedAt ?? 0));
  const kinds: Record<string, number> = {};
  for (const j of b.journals) kinds[j.kind] = (kinds[j.kind] ?? 0) + 1;
  const counts = {
    workouts: b.workouts.length,
    sets: b.sets.length,
    templates: b.templates.length,
    journals: b.journals.length,
    customExercises: b.customExercises.length,
  };
  say(
    `✓ A FORGE backup (format ${b.version}), exported ${new Date(b.exportedAt).toISOString().replace("T", " ").slice(0, 16)} UTC`,
  );
  say(
    `    workouts: ${b.workouts.length} (finished ${finished.length}, in progress ${b.workouts.length - finished.length})`,
  );
  if (latest) say(`    latest finished workout: ${localDate(latest)}`);
  say(
    `    sets: ${b.sets.length} (completed ${b.sets.filter((s) => s.completed).length})`,
  );
  say(`    exercises in workouts: ${b.workoutExercises.length}`);
  say(`    templates: ${b.templates.length}`);
  say(
    `    journal entries: ${b.journals.length}${
      b.journals.length
        ? ` (${Object.entries(kinds)
            .sort(([a], [z]) => a.localeCompare(z))
            .map(([k, n]) => `${k} ${n}`)
            .join(", ")})`
        : ""
    }`,
  );
  say(`    custom exercises: ${b.customExercises.length}`);
  say(`    favorites: ${b.favorites.length}`);
  if (b.newerRecords?.length)
    say(`    records kept from a newer Forge: ${b.newerRecords.length}`);

  const { r, close } = memoryRepository();
  try {
    r.importBackup(text);
    say("✓ Restores into an empty database with Forge's own checks");
    const again = r.exportBackup();
    const same =
      again.workouts.length === counts.workouts &&
      again.sets.length === counts.sets &&
      again.templates.length === counts.templates &&
      again.journals.length === counts.journals &&
      again.customExercises.length === counts.customExercises;
    if (!same) {
      say("✗ Restored and exported again, its counts differ from the file's");
      return result;
    }
    say("✓ Restored and exported again, the counts match");
  } catch (e) {
    say(`✗ Forge would refuse to restore it: ${reason(e)}`);
    return result;
  } finally {
    close();
  }
  result.ok = true;
  return result;
}

function main(argv: string[]) {
  const file = argv[0];
  if (!file) {
    console.error(
      "Usage: npm run backup:check -- <path to forge-backup.json> (the file is only read)",
    );
    return 2;
  }
  let content: Buffer;
  try {
    content = readFileSync(file);
  } catch (e) {
    console.error(`Can't read that file: ${reason(e)}`);
    return 2;
  }
  const check = checkBackup(content);
  console.log(`File: ${(check.bytes / 1024).toFixed(1)} KB`);
  console.log(`SHA-256: ${check.sha256}`);
  for (const line of check.lines) console.log(line);
  console.log(
    check.ok
      ? "\nThis backup is complete and restorable. The file was only read."
      : "\nDon't rely on this backup: keep the original and export a new one. The file was only read.",
  );
  return check.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
