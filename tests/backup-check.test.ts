import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkBackup } from "../scripts/dev/check-backup";
import { pathRepository } from "./path-fixture";

// Phase 8.3B: the backup checker. It reads a FORGE backup file and tells
// whether Forge could restore it, using Forge's own import in a throwaway
// in-memory database; it never changes the file. All data here is synthetic.

const PRIVATE = [
  "Synthetic Tester",
  "Secret note",
  "Push day",
  "Upper plan",
] as const;

/** A synthetic backup: finished and in-progress workouts, sets, a template, a journal entry and a favorite. */
function syntheticBackup() {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ name: PRIVATE[0] });
    for (let i = 0; i < 3; i++) {
      const w = r.startWorkout(PRIVATE[2]);
      const e = r.addExercise(w.id, "barbell-bench-press");
      r.addSet(e.id, { weight: 60, reps: 8, completed: true });
      r.addSet(e.id, {
        weight: 60,
        reps: 7,
        completed: true,
        notes: PRIVATE[1],
      });
      r.finishWorkout(w.id);
    }
    const live = r.startWorkout("Now");
    r.addSet(r.addExercise(live.id, "push-up").id, {
      reps: 12,
      completed: true,
    });
    r.saveTemplate(PRIVATE[3], [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 8,
        weight: 40,
        rest: 90,
      },
    ]);
    r.addJournal("measurement", {
      name: "Bodyweight",
      value: 82.5,
      unit: "kg",
    });
    r.toggleFavorite("back-squat");
    return JSON.stringify(r.exportBackup(), null, 2);
  } finally {
    db.close();
  }
}

test("a complete backup is restorable, with its counts and nothing personal", () => {
  const text = syntheticBackup();
  const check = checkBackup(text);
  const report = check.lines.join("\n");
  assert.equal(check.ok, true, report);
  assert.equal(check.bytes, Buffer.byteLength(text));
  assert.match(check.sha256, /^[0-9a-f]{64}$/);
  for (const line of [
    "✓ Readable JSON",
    "    workouts: 4 (finished 3, in progress 1)",
    "    sets: 7 (completed 7)",
    "    templates: 1",
    "    journal entries: 2 (favorite 1, measurement 1)",
    "✓ Restores into an empty database with Forge's own checks",
    "✓ Restored and exported again, the counts match",
  ])
    assert.ok(check.lines.includes(line), `${line}\n${report}`);
  for (const secret of PRIVATE) assert.ok(!report.includes(secret), secret);
  // The same bytes always give the same fingerprint; any change, another.
  assert.equal(checkBackup(text).sha256, check.sha256);
  assert.notEqual(checkBackup(`${text} `).sha256, check.sha256);
});

test("damaged, foreign, duplicated or newer backups are never called restorable", () => {
  const text = syntheticBackup();
  const backup = JSON.parse(text) as {
    version: number;
    workouts: { status: string }[];
  };
  const cases: [string, string, RegExp][] = [
    // An interrupted share or a cut-off download.
    [
      "truncated",
      text.slice(0, Math.floor(text.length * 0.6)),
      /Not readable JSON/,
    ],
    ["empty", "", /Not readable JSON/],
    ["not a backup", JSON.stringify({ hello: "world" }), /Not a FORGE backup/],
    [
      "duplicated workout",
      JSON.stringify({
        ...backup,
        workouts: [...backup.workouts, backup.workouts[0]],
      }),
      /refuse to restore it: Duplicate record identifiers/,
    ],
    [
      "two workouts in progress",
      JSON.stringify({
        ...backup,
        workouts: backup.workouts.map((w) => ({ ...w, status: "active" })),
      }),
      /refuse to restore it: Backup has multiple active workouts/,
    ],
    [
      "from a newer Forge",
      JSON.stringify({ ...backup, version: 2 }),
      /newer version of Forge \(format 2\)/,
    ],
  ];
  for (const [name, content, expected] of cases) {
    const check = checkBackup(content);
    assert.equal(check.ok, false, name);
    assert.match(check.lines.join("\n"), expected, name);
    assert.ok(
      !check.lines.some((l) => l.startsWith("✓ Restores")),
      `${name}: never reported as restorable`,
    );
  }
});

test("npm run backup:check only reads the file, and says so by its exit status", () => {
  const script = path.resolve("scripts/dev/check-backup.ts");
  const tsx = require.resolve("tsx/cli");
  const dir = mkdtempSync(path.join(tmpdir(), "forge-backup-check-"));
  try {
    const good = path.join(dir, "forge-backup.json");
    const bad = path.join(dir, "forge-backup-cut.json");
    const text = syntheticBackup();
    writeFileSync(good, text);
    writeFileSync(bad, text.slice(0, 500));
    const before = [good, bad].map((f) => ({
      bytes: readFileSync(f),
      mtime: statSync(f).mtimeMs,
    }));
    const run = (args: string[]) =>
      spawnSync(process.execPath, [tsx, script, ...args], {
        encoding: "utf8",
        timeout: 60000,
      });
    const ok = run([good]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(
      ok.stdout,
      /complete and restorable\. The file was only read\./,
    );
    assert.match(ok.stdout, /SHA-256: [0-9a-f]{64}/);
    for (const secret of PRIVATE)
      assert.ok(!ok.stdout.includes(secret), secret);
    const cut = run([bad]);
    assert.equal(cut.status, 1);
    assert.match(cut.stdout, /Don't rely on this backup/);
    assert.equal(run([]).status, 2);
    assert.equal(run([path.join(dir, "missing.json")]).status, 2);
    [good, bad].forEach((f, i) => {
      assert.ok(readFileSync(f).equals(before[i]!.bytes), `${f} unchanged`);
      assert.equal(statSync(f).mtimeMs, before[i]!.mtime, `${f} not rewritten`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the checker can't reach a phone, the cloud or any file but the one it reads", () => {
  const source = readFileSync("scripts/dev/check-backup.ts", "utf8");
  for (const forbidden of [
    "supabase",
    "fetch(",
    "src/cloud",
    "src/platform",
    "writeFile",
    "appendFile",
    "rmSync",
    "unlink",
    "rename",
    "copyFile",
  ])
    assert.ok(!source.includes(forbidden), forbidden);
  assert.ok(source.includes('new DatabaseSync(":memory:")'));
});
