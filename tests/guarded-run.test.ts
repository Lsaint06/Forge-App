import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGuarded } from "../scripts/dev/guarded-run";

// Phase 8.1: `npm run dev:ios` runs Expo's steps through runGuarded. A failed
// or cancelled step stops the rest, and app.json and package.json are always
// put back if a step changed them, including after Ctrl+C through tsx.

const node = (code: string) => ({
  command: process.execPath,
  args: ["-e", code],
});

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-guarded-"));
  const file = path.join(dir, "app.json");
  writeFileSync(file, "as committed");
  return { dir, file };
}

test("steps run in order; a failing step stops the rest", async () => {
  const { dir, file } = workspace();
  try {
    const mark = (name: string) =>
      `require("node:fs").writeFileSync(${JSON.stringify(path.join(dir, name))}, "")`;
    const ok = await runGuarded([node(mark("one")), node(mark("two"))], [file]);
    assert.deepEqual(ok, { status: 0, cancelled: false, restored: [] });
    assert.ok(existsSync(path.join(dir, "two")));
    const failed = await runGuarded(
      [node("process.exit(65)"), node(mark("three"))],
      [file],
    );
    assert.deepEqual(failed, { status: 65, cancelled: false, restored: [] });
    assert.ok(!existsSync(path.join(dir, "three")));
    // A command that can't start counts as a failure.
    const missing = await runGuarded(
      [{ command: path.join(dir, "no-such-command"), args: [] }],
      [file],
    );
    assert.equal(missing.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file a step changed or deleted is put back exactly", async () => {
  const { dir, file } = workspace();
  try {
    const other = path.join(dir, "package.json");
    writeFileSync(other, "untouched");
    const changed = await runGuarded(
      [
        node(
          `require("node:fs").writeFileSync(${JSON.stringify(file)}, '{"ios":{"appleTeamId":"ABCDE12345"}}')`,
        ),
      ],
      [file, other],
    );
    assert.deepEqual(changed.restored, [file]);
    assert.equal(readFileSync(file, "utf8"), "as committed");
    assert.equal(readFileSync(other, "utf8"), "untouched");
    unlinkSync(other);
    writeFileSync(other, "untouched");
    const deleted = await runGuarded(
      [node(`require("node:fs").unlinkSync(${JSON.stringify(other)})`)],
      [file, other],
    );
    assert.deepEqual(deleted.restored, [other]);
    assert.equal(readFileSync(other, "utf8"), "untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function waitFor(check: () => boolean, ms: number) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test(
  "Ctrl+C through tsx: the running step stops, no later step starts, the files are put back",
  { skip: process.platform === "win32" && "needs POSIX process groups" },
  async () => {
    const { dir, file } = workspace();
    try {
      // Like a terminal: one process group, which Ctrl+C signals as a whole.
      const child = spawn(
        process.execPath,
        [
          require.resolve("tsx/cli"),
          path.resolve("tests/fixtures/guarded-run-harness.ts"),
          dir,
        ],
        { detached: true, stdio: "ignore" },
      );
      const exited = new Promise<number | null>((resolve) =>
        child.once("exit", (code) => resolve(code)),
      );
      await waitFor(() => existsSync(path.join(dir, "started")), 20000);
      assert.equal(readFileSync(file, "utf8"), "changed by the step");
      process.kill(-child.pid!, "SIGINT");
      assert.equal(await exited, 130);
      const result = JSON.parse(
        readFileSync(path.join(dir, "result.json"), "utf8"),
      );
      // Expo's CLI exits 0 when cancelled: still recorded as cancelled.
      assert.deepEqual(result, {
        status: 0,
        cancelled: true,
        restored: [file],
      });
      assert.equal(readFileSync(file, "utf8"), "as committed");
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.ok(!existsSync(path.join(dir, "second-step-ran")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "a stop sent only to the command (an editor's stop button) also stops the running step",
  { skip: process.platform === "win32" && "needs POSIX signals" },
  async () => {
    const { dir, file } = workspace();
    const child = spawn(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        path.resolve("tests/fixtures/guarded-run-harness.ts"),
        dir,
      ],
      { detached: true, stdio: "ignore" },
    );
    try {
      const exited = new Promise<number | null>((resolve) =>
        child.once("exit", (code) => resolve(code)),
      );
      await waitFor(() => existsSync(path.join(dir, "started")), 20000);
      // Only the top process, not its group: the step hears nothing directly.
      process.kill(child.pid!, "SIGTERM");
      const code = await Promise.race([
        exited,
        new Promise<"still running">((resolve) =>
          setTimeout(() => resolve("still running"), 10000),
        ),
      ]);
      assert.equal(code, 130);
      const result = JSON.parse(
        readFileSync(path.join(dir, "result.json"), "utf8"),
      );
      assert.equal(result.cancelled, true);
      assert.deepEqual(result.restored, [file]);
      assert.equal(readFileSync(file, "utf8"), "as committed");
      assert.ok(!existsSync(path.join(dir, "second-step-ran")));
    } finally {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Already gone.
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
