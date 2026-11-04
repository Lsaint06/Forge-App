// npm run dev:check: read-only checks of the development Supabase project
// (Phase 8), from .env.forge-dev. Nothing is created, changed or deleted:
// Auth's health and public settings, whether the Forge schema (and the
// Stage 3 hardening) is applied, and which return addresses the project
// allows, read from email-link verifications with random tokens that match
// nothing (Phase 8.3B: no Google needed). Refuses the project any of Expo's
// own settings files (such as today's .env) points at. Prints no key, token
// or project address. See docs/DEVELOPMENT_ENVIRONMENT.md.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DEV_ENV_FILE,
  EXPO_ENV_FILES,
  checkDevProject,
  maskRef,
  parseEnvFile,
  readEnvFiles,
} from "./env-files";
import {
  authSettingsResults,
  checkReturnAddresses,
  schemaState,
  unmatchedVerifyPath,
  type AuthSettings,
} from "./probes";

const text = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : undefined;

async function main() {
  const devText = text(path.join(process.cwd(), DEV_ENV_FILE));
  if (devText === undefined)
    throw new Error(`No ${DEV_ENV_FILE} (see ${DEV_ENV_FILE}.example)`);
  const project = checkDevProject(
    parseEnvFile(devText),
    readEnvFiles(process.cwd(), EXPO_ENV_FILES, text),
  );
  if (!project.ok) throw new Error(project.problems.join("; "));
  const { url, key, ref } = project;
  const results: [boolean | undefined, string][] = [];
  const note = (ok: boolean | undefined, text: string) =>
    results.push([ok, text]);
  console.log(`Development project ${maskRef(ref)}: read-only checks`);

  const get = (p: string) =>
    fetch(`${url}${p}`, {
      headers: { apikey: key },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

  const health = await get("/auth/v1/health");
  note(health.ok, `Auth answers (/auth/v1/health ${health.status})`);

  const settingsResponse = await get("/auth/v1/settings");
  const settings = (await settingsResponse
    .json()
    .catch(() => ({}))) as AuthSettings;
  note(settingsResponse.ok, "Auth settings readable");
  for (const [ok, text] of authSettingsResults(settings)) note(ok, text);

  const anon = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await anon.from("forge_records").select("id").limit(1);
  const schema = schemaState(error);
  note(
    schema === "closed",
    {
      closed: "Forge schema applied; anonymous users can't read it",
      open: "Forge baseline schema: anonymous users can still query it (apply 202611020001_forge_security_hardening.sql)",
      missing:
        "No Forge schema: apply 202610140001_forge.sql, then the hardening",
      unknown: `Forge schema state unknown (${error?.code ?? "no code"})`,
    }[schema],
  );
  if (schema === "closed")
    note(
      undefined,
      "Stage 3 hardening: confirm with supabase/verify/schema_summary.sql in the SQL editor. Projects created since Supabase's 2026 change refuse anonymous users with or without it",
    );

  // One request at a time, gently: Auth limits verifications per address.
  const probe = async (to: string) => {
    await new Promise((done) => setTimeout(done, 250));
    const answer = await get(
      unmatchedVerifyPath(to, randomBytes(28).toString("hex")),
    );
    return { status: answer.status, location: answer.headers.get("location") };
  };
  for (const [ok, text] of await checkReturnAddresses(probe)) note(ok, text);

  for (const [ok, text] of results)
    console.log(`${ok === undefined ? "•" : ok ? "✓" : "✗"} ${text}`);
  const failed = results.filter(([ok]) => ok === false).length;
  console.log(failed ? `${failed} check(s) failed.` : "All checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main().catch((e: unknown) => {
  console.error(`dev:check stopped: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
