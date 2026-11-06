// For tests/guarded-run.test.ts: runs two steps through runGuarded, as
// `npm run dev:ios` does, so the test can press Ctrl+C mid-step. The first
// step changes a guarded file, then waits, and exits 0 on Ctrl+C, as Expo's
// CLI does. The second step only leaves a mark if it ever runs.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { runGuarded } from "../../scripts/dev/guarded-run";

const dir = process.argv[2]!;
const guarded = path.join(dir, "app.json");
const first = `
process.on("SIGINT", () => process.exit(0));
require("node:fs").writeFileSync(${JSON.stringify(guarded)}, "changed by the step");
require("node:fs").writeFileSync(${JSON.stringify(path.join(dir, "started"))}, "");
setTimeout(() => {}, 30000);
`;
const second = `require("node:fs").writeFileSync(${JSON.stringify(path.join(dir, "second-step-ran"))}, "")`;

void runGuarded(
  [
    { command: process.execPath, args: ["-e", first] },
    { command: process.execPath, args: ["-e", second] },
  ],
  [guarded],
).then((result) => {
  writeFileSync(path.join(dir, "result.json"), JSON.stringify(result));
  process.exit(result.cancelled ? 130 : result.status);
});
