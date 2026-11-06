// npm run dev:verify-stage3 -- --confirm <dev ref> --email <you@domain> [--stale]
//
// DESTRUCTIVE, and only for the development Supabase project (Phase 8):
// verifies the Stage 3 hardening end to end with two throwaway accounts it
// creates itself (sign-up with email confirmation off) and deletes again
// through forge_delete_account, which can only ever delete the caller's own
// account. It never signs in to an existing account. It refuses to run
// unless .env.forge-dev is the development project and not the project any
// of Expo's own settings files (such as today's .env) points at, and
// --confirm repeats that project's ref.
// Passwords and tokens stay in memory and are never printed.
// --stale also waits 11 minutes to check that a refreshed but old sign-in
// is refused. See docs/DEVELOPMENT_ENVIRONMENT.md.

import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";
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
import { schemaState } from "./probes";

/** The options, or why they can't be used. */
export function readOptions(
  argv: string[],
): { confirm: string; email: string; stale: boolean } | { problem: string } {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1]?.trim() : undefined;
  };
  const confirm = value("--confirm");
  const email = value("--email");
  if (!confirm || confirm.startsWith("--"))
    return { problem: "--confirm <development project ref> is required" };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { problem: "--email <an address you own> is required" };
  return { confirm, email, stale: argv.includes("--stale") };
}

/** A throwaway address on `email`'s mailbox: plus-addressing, never sent. */
export function throwawayEmail(email: string, run: string, who: string) {
  const [local, domain] = email.split("@") as [string, string];
  return `${local.split("+")[0]}+forgeverify${run}${who}@${domain}`;
}

const MINUTE = 60_000;
const freshClient = (url: string, key: string) =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

async function main() {
  const options = readOptions(process.argv.slice(2));
  if ("problem" in options) throw new Error(options.problem);
  const text = (file: string) =>
    existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const devText = text(path.join(process.cwd(), DEV_ENV_FILE));
  if (devText === undefined) throw new Error(`No ${DEV_ENV_FILE}`);
  const project = checkDevProject(
    parseEnvFile(devText),
    readEnvFiles(process.cwd(), EXPO_ENV_FILES, text),
  );
  if (!project.ok) throw new Error(project.problems.join("; "));
  const { url, key, ref } = project;
  if (options.confirm !== ref)
    throw new Error(
      "--confirm doesn't match the development project's ref in .env.forge-dev",
    );

  // Preconditions: sign-ups give a session at once, and the hardening is on.
  const settings = (await (
    await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    })
  ).json()) as { mailer_autoconfirm?: boolean; disable_signup?: boolean };
  if (!settings.mailer_autoconfirm || settings.disable_signup)
    throw new Error(
      "In the development project, allow sign-ups and turn email confirmation off first",
    );
  const anon = freshClient(url, key);
  const probe = await anon.from("forge_records").select("id").limit(1);
  // Anonymous users must be refused. Whether that's the Stage 3 hardening
  // (and not just a newer project's default) is what the checks below prove,
  // as supabase/verify/schema_checks.sql shows directly.
  if (schemaState(probe.error) !== "closed")
    throw new Error(
      "The development project doesn't have the Forge schema with the Stage 3 hardening applied",
    );

  console.log(
    `Development project ${maskRef(ref)}: Stage 3 verification with two throwaway accounts`,
  );
  const run = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const people = (["a", "b"] as const).map((who) => ({
    who,
    email: throwawayEmail(options.email, run, who),
    password: `${randomBytes(18).toString("base64url")}aA1!`,
    client: freshClient(url, key),
    id: "",
    deleted: false,
  }));
  const [a, b] = people as [(typeof people)[0], (typeof people)[0]];
  const results: [boolean, string][] = [];
  const check = (ok: boolean, text: string) => {
    results.push([ok, text]);
    console.log(`${ok ? "✓" : "✗"} ${text}`);
    return ok;
  };
  const refused = (
    error: PostgrestError | null,
    code = "42501",
    hint?: string,
  ) => !!error && error.code === code && (hint ? error.hint === hint : true);
  const deleteAccount = (client: SupabaseClient) =>
    client.rpc("forge_delete_account");
  const write = (client: SupabaseClient, id: string) =>
    client.rpc("forge_write", {
      record_id: id,
      record_kind: "journal",
      record_payload: { verify: run },
      base_revision: 0,
      is_deleted: false,
    });

  try {
    for (const person of people) {
      const { data, error } = await person.client.auth.signUp({
        email: person.email,
        password: person.password,
      });
      person.id = data.user?.id ?? "";
      if (
        !check(
          !error && !!data.session,
          `Sign-up ${person.who.toUpperCase()} gives a session`,
        )
      )
        throw new Error("sign-up didn't start a session");
    }

    // Ownership: the same record ID, kept apart.
    check(
      (await write(a.client, "forge-verify")).data?.revision === 1 &&
        (await write(b.client, "forge-verify")).data?.revision === 1,
      "A and B each write a record with the same ID",
    );
    const rows = async (client: SupabaseClient) =>
      (await client.from("forge_records").select("id, user_id")).data ?? [];
    const aRows = await rows(a.client);
    const bRows = await rows(b.client);
    check(
      aRows.length === 1 &&
        aRows[0]!.user_id === a.id &&
        bRows.length === 1 &&
        bRows[0]!.user_id === b.id,
      "Each account reads only its own record",
    );

    // Privileges: nothing for anon; signed in, only reading.
    check(
      refused((await anon.from("forge_records").select("id")).error) &&
        refused((await write(anon, "anon-write")).error),
      "Anonymous callers can't read the table or call forge_write",
    );
    check(
      refused(
        (
          await a.client.from("forge_records").insert({
            user_id: a.id,
            id: "direct",
            kind: "journal",
            payload: {},
          })
        ).error,
      ) &&
        refused(
          (
            await a.client
              .from("forge_records")
              .update({ payload: { x: 1 } })
              .eq("id", "forge-verify")
          ).error,
        ),
      "Signed-in accounts can't insert or update the table directly",
    );

    // A fresh sign-in deletes; the deleted account's token can do nothing.
    const deletedA = !(await deleteAccount(a.client)).error;
    a.deleted = deletedA;
    check(deletedA, "A fresh sign-in deletes its own account");
    check(
      (await rows(a.client)).length === 0 &&
        !!(await write(a.client, "after-deletion")).error,
      "The deleted account's still-valid token reads nothing and writes nothing",
    );
    check(!(await deleteAccount(a.client)).error, "Deleting again is harmless");
    check((await rows(b.client)).length === 1, "B's record is untouched");

    // A sign-in that has ended can't delete, even with a valid token.
    const ended = (await b.client.auth.getSession()).data.session!.access_token;
    await b.client.auth.signOut({ scope: "local" });
    const endedClient = createClient(url, key, {
      accessToken: async () => ended,
    });
    check(
      refused(
        (await deleteAccount(endedClient)).error,
        "42501",
        "reauthentication_needed",
      ),
      "A signed-out session's token is asked to sign in again",
    );
    await b.client.auth.signInWithPassword({
      email: b.email,
      password: b.password,
    });
    const signedInAt = Date.now();

    if (options.stale) {
      const wait = signedInAt + 11 * MINUTE - Date.now();
      console.log(
        `Waiting ${Math.ceil(wait / MINUTE)} minutes for B's sign-in to be 11 minutes old…`,
      );
      await new Promise((done) => setTimeout(done, Math.max(0, wait)));
      await b.client.auth.refreshSession();
      check(
        refused(
          (await deleteAccount(b.client)).error,
          "42501",
          "reauthentication_needed",
        ),
        "An 11-minute-old sign-in, freshly refreshed, is asked to sign in again",
      );
      await b.client.auth.signInWithPassword({
        email: b.email,
        password: b.password,
      });
    }
    const deletedB = !(await deleteAccount(b.client)).error;
    b.deleted = deletedB;
    check(deletedB, "A fresh sign-in deletes B");

    for (const person of people)
      check(
        !!(
          await freshClient(url, key).auth.signInWithPassword({
            email: person.email,
            password: person.password,
          })
        ).error,
        `${person.who.toUpperCase()} can't sign in any more`,
      );
  } finally {
    const left = people.filter((p) => p.id && !p.deleted);
    if (left.length)
      console.log(
        `Not deleted; remove in the development project's Authentication → Users: ${left.map((p) => p.email).join(", ")}`,
      );
  }
  const failed = results.filter(([ok]) => !ok).length;
  console.log(
    failed
      ? `${failed} check(s) failed.`
      : "Stage 3 verified on the development project.",
  );
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module)
  main().catch((e: unknown) => {
    console.error(
      `dev:verify-stage3 stopped: ${e instanceof Error ? e.message : e}`,
    );
    process.exitCode = 1;
  });
