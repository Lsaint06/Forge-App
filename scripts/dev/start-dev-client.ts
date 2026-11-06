// npm run start:dev [-- <expo start options>]: Metro for FORGE Dev, the
// development build (Phase 8), against the development Supabase project
// only. Reads .env.forge-dev and nothing else (EXPO_NO_DOTENV), and refuses
// to start when that file is incomplete, isn't the development project, or
// is the project one of Expo's own settings files points at, and while a
// file Expo would bundle into FORGE Dev's JavaScript exists (.env.local,
// .env.development, .env.development.local). `npm start` (Expo Go) is
// unchanged.
// See docs/DEVELOPMENT_ENVIRONMENT.md.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  BUNDLED_IN_DEVELOPMENT,
  DEV_ENV_FILE,
  EXPO_ENV_FILES,
  checkDevProject,
  devClientEnv,
  maskRef,
  parseEnvFile,
  readEnvFiles,
} from "./env-files";

const root = process.cwd();
const text = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : undefined;

const devText = text(path.join(root, DEV_ENV_FILE));
if (devText === undefined) {
  console.error(
    `No ${DEV_ENV_FILE}. Copy ${DEV_ENV_FILE}.example and fill it in with the development project (docs/DEVELOPMENT_ENVIRONMENT.md).`,
  );
  process.exit(1);
}
const dev = parseEnvFile(devText);
const bundled = BUNDLED_IN_DEVELOPMENT.filter((file) =>
  existsSync(path.join(root, file)),
);
if (bundled.length) {
  console.error(
    `FORGE Dev won't start: move ${bundled.join(", ")} out of the project first. Expo would add ${bundled.length > 1 ? "their" : "its"} values to FORGE Dev's JavaScript.`,
  );
  process.exit(1);
}
const project = checkDevProject(dev, readEnvFiles(root, EXPO_ENV_FILES, text));
if (!project.ok) {
  console.error(`FORGE Dev won't start:\n- ${project.problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `FORGE Dev → development project ${maskRef(project.ref)} (APP_VARIANT=development; Expo's own .env files not read)`,
);
const cli = createRequire(path.join(root, "package.json")).resolve(
  "expo/bin/cli",
);
const child = spawn(
  process.execPath,
  [cli, "start", "--dev-client", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: devClientEnv(process.env, dev) as NodeJS.ProcessEnv,
  },
);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
