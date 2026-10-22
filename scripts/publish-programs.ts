// Reproducible curated-program publication (Phase 6, docs/PHASE_6.md).
//
//   npm run programs:publish                 dry run: validate and report
//   npm run programs:publish -- --apply      publish every draft
//   npm run programs:publish -- --apply forge-strength-beginner-3-day ...
//
// Publishing changes only each program's "status" from "draft" to
// "published" and records its immutable fingerprint in published-lock.json.
// It refuses to write anything unless the full test suite passes and the
// resulting library validates, is fingerprint-locked and covers all 18
// goal × experience × frequency combinations. Requires explicit approval.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exercises } from "../src/data/catalog";
import { publicationPlan } from "../src/domain/programs/publication";

const root = join(__dirname, "..");
const libraryDir = join(root, "src", "programs", "library");
const lockPath = join(root, "src", "programs", "published-lock.json");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const select = args.filter((a) => !a.startsWith("--"));

const files = readdirSync(libraryDir).filter((f) => f.endsWith(".json"));
const sources = files.map((f) => ({
  file: f,
  text: readFileSync(join(libraryDir, f), "utf8"),
}));
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Record<
  string,
  string
>;
const plan = publicationPlan(
  sources.map((s) => JSON.parse(s.text)),
  lock,
  exercises,
  select.length ? select : undefined,
);

console.log(
  `Programs to publish: ${plan.publish.length}\n${plan.publish
    .map((p) => `  ${p.id}@${p.version}  ${p.fingerprint}`)
    .join("\n")}`,
);
console.log(
  `Coverage after publication: ${plan.coverage.published} published, ${
    plan.coverage.complete
      ? "all 18 combinations covered"
      : `missing ${plan.coverage.missing.join("; ")}`
  }`,
);
if (plan.errors.length) {
  console.error(`\nBlocked:\n  ${plan.errors.join("\n  ")}`);
  process.exit(1);
}
if (!apply) {
  console.log("\nDry run only. Re-run with --apply after final approval.");
  process.exit(0);
}

// Authored prescriptions, catalog mappings, progression and matching are
// verified by the full logic suite before anything is written.
execSync("npm test", { cwd: root, stdio: "inherit" });

const publishIds = new Set(plan.publish.map((p) => p.id));
for (const s of sources) {
  const program = JSON.parse(s.text) as { id: string; status: string };
  if (!publishIds.has(program.id)) continue;
  const next = s.text.replace(/"status": "draft"/, '"status": "published"');
  if (next === s.text) throw new Error(`${s.file}: status not found`);
  writeFileSync(join(libraryDir, s.file), next);
}
const sorted = Object.fromEntries(
  Object.entries(plan.lock).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(lockPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(
  `\nPublished ${plan.publish.length} programs and updated the lock.\nNext: update the draft-status expectations in tests/strength-v2.test.ts and tests/muscle-v3.test.ts, then run the full verification (docs/PHASE_6.md).`,
);
