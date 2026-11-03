// npm run dev:check: read-only checks of the development Supabase project
// (Phase 8), from .env.forge-dev. Nothing is created, changed or deleted:
// Auth's health and public settings, whether the Forge schema (and the
// Stage 3 hardening) is applied, and whether FORGE Dev's return addresses
// are allowed. Refuses the project any of Expo's own settings files (such as
// today's .env) points at. Prints no key, token or address. See
// docs/DEVELOPMENT_ENVIRONMENT.md.

import { createClient } from "@supabase/supabase-js";
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
  DEV_REDIRECTS,
  REFUSED_REDIRECTS,
  redirectAccepted,
  schemaState,
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
  const settings = (await settingsResponse.json().catch(() => ({}))) as {
    external?: Record<string, boolean>;
    disable_signup?: boolean;
    mailer_autoconfirm?: boolean;
  };
  note(settingsResponse.ok, "Auth settings readable");
  note(settings.external?.email === true, "Email sign-in enabled");
  note(settings.disable_signup !== true, "Sign-ups allowed");
  const google = settings.external?.google === true;
  note(google, "Google sign-in enabled");
  note(
    undefined,
    settings.mailer_autoconfirm
      ? "Email confirmation is OFF (disposable test accounts need no email)"
      : "Email confirmation is ON (dev:verify-stage3 needs it off)",
  );

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
    schema === "hardened",
    {
      hardened: "Forge schema with the Stage 3 hardening (anon can't read)",
      baseline:
        "Forge baseline schema only: apply 202611020001_forge_security_hardening.sql",
      missing:
        "No Forge schema: apply 202610140001_forge.sql, then the hardening",
      unknown: `Forge schema state unknown (${error?.code ?? "no code"})`,
    }[schema],
  );

  if (google) {
    const accepted = async (to: string) =>
      redirectAccepted(
        (
          await get(
            `/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(to)}`,
          )
        ).headers.get("location"),
        to,
      );
    for (const to of DEV_REDIRECTS) {
      const ok = await accepted(to);
      note(
        ok,
        `Return address allowed: ${to}${ok === undefined ? " (unreadable)" : ""}`,
      );
    }
    for (const to of REFUSED_REDIRECTS) {
      const ok = await accepted(to);
      note(
        ok === undefined ? undefined : !ok,
        `Return address refused: ${to}${ok === undefined ? " (unreadable)" : ""}`,
      );
    }
  } else note(undefined, "Return addresses not checked (Google isn't enabled)");

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
