const { spawnSync } = require("node:child_process");
const path = require("node:path");

const cli = path.join(
  path.dirname(require.resolve("expo/package.json")),
  "bin/cli",
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist-web",
    "--max-workers",
    "2",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    // SDK 57's static exporter needs the SQLite worker in its full graph.
    // Scope this to web export; native Metro startup keeps its usual defaults.
    env: { ...process.env, EXPO_NO_METRO_LAZY: "1" },
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
