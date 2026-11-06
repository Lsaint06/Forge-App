// Reading what a Supabase project answers, for Forge's development tooling
// (Phase 8). Pure: the network is passed in, so each reading is unit-tested.

/**
 * What an anonymous `select` on forge_records shows about a project.
 * - "closed": refused (42501). The Stage 3 hardening revokes every table
 *   privilege from anon; but a project created since Supabase's 2026 change
 *   grants anon nothing by default, so the baseline is refused there too.
 *   Only supabase/verify/schema_checks.sql (queries 1 and 4) proves the
 *   hardening.
 * - "open": anon may query it (row-level security returns nothing): the
 *   baseline on a project with Supabase's earlier default grants.
 * - "missing": no such table yet.
 */
export type SchemaState = "closed" | "open" | "missing" | "unknown";

export function schemaState(
  error: { code?: string } | null | undefined,
): SchemaState {
  if (!error) return "open";
  if (error.code === "42501") return "closed";
  if (error.code === "PGRST205" || error.code === "42P01") return "missing";
  return "unknown";
}

/**
 * The address an email-link verification returns to, asked with a random
 * token that matches nothing: nothing is confirmed, created or sent. Supabase
 * Auth redirects to `to` when it's on the project's allow list (the error in
 * its fragment), and to the Site URL otherwise. It's the same rule
 * (`IsRedirectURLValid` in supabase/auth) as for sign-in, confirmation and
 * password-reset links, so Google needn't be set up to check the list.
 */
export function unmatchedVerifyPath(to: string, token: string) {
  return `/auth/v1/verify?type=signup&token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(to)}`;
}

/** Auth's answer to one such request: its status and Location. */
export type Landing = { status: number; location?: string | null };

/**
 * Whether the answer went to `requested`; undefined when it isn't a redirect
 * (rate-limited, unavailable, or Auth changed how it answers).
 */
export function landedOn(
  answer: Landing,
  requested: string,
): boolean | undefined {
  const { status, location } = answer;
  if (status < 300 || status > 399 || !location) return undefined;
  return (
    location === requested ||
    location.startsWith(`${requested}#`) ||
    location.startsWith(`${requested}?`)
  );
}

/** FORGE Dev's return addresses (the development project's allow list). */
export const DEV_REDIRECTS = [
  "forge-dev:///welcome",
  "forge-dev:///sign-in",
  "forge-dev:///account",
] as const;

/**
 * Addresses the development project must refuse, and the entry each would
 * expose: the production app's own scheme, the `@` trick from Stage 0, and
 * one address for each broad pattern the allow list must never hold.
 */
export const REFUSED_REDIRECTS = [
  { to: "forge:///welcome", why: "the production app's scheme" },
  {
    to: "exps://attacker-0123456789abcdef.on.expo.app/--/welcome",
    why: "another Expo account's tunnel; catches exps://**",
  },
  {
    to: "exps://c-lstamand-97rrx8-x@attacker.example/--/welcome",
    why: "the @ trick",
  },
  {
    to: "forge-dev:///elsewhere",
    why: "another forge-dev path; catches forge-dev:///**",
  },
  {
    to: "forge-dev://welcome",
    why: "two slashes; catches forge-dev://**",
  },
  {
    to: "exp://forge-probe.invalid/--/welcome",
    why: "Expo Go's exp: scheme; catches exp://**",
  },
] as const;

/** Any website at all: accepted only if the allow list holds `https://**` or `**`. */
export const ARBITRARY_SITE = "https://forge-probe.invalid/return";

/** The founder's optional Expo Go tunnel entry (README), reported, not required. */
export const TUNNEL_EXAMPLE =
  "exps://c-lstamand-97rrx8-0123456789abcdef.on.expo.app/--/welcome";

export type CheckResult = [ok: boolean | undefined, text: string];

/** The parts of Auth's public settings (/auth/v1/settings) dev:check reads. */
export type AuthSettings = {
  external?: Record<string, boolean>;
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
};

/**
 * What the development project's sign-in settings show. Email sign-in and
 * sign-ups are needed; Google is optional there (only needed to test Google
 * in FORGE Dev), so its absence is information, not a failure.
 */
export function authSettingsResults(settings: AuthSettings): CheckResult[] {
  const google = settings.external?.google === true;
  return [
    [settings.external?.email === true, "Email sign-in enabled"],
    [settings.disable_signup !== true, "Sign-ups allowed"],
    google
      ? [true, "Google sign-in enabled"]
      : [
          undefined,
          "Google sign-in not set up (optional: needed only to test Google in FORGE Dev)",
        ],
    [
      undefined,
      settings.mailer_autoconfirm
        ? "Email confirmation is OFF (disposable test accounts need no email)"
        : "Email confirmation is ON (dev:verify-stage3 needs it off)",
    ],
  ];
}

/**
 * Reads the allow list through `probe` (one unmatched verification each).
 * Two controls come first:
 * - an arbitrary website must be refused, which also shows where refused
 *   addresses go (the Site URL);
 * - an address on the Site URL's own host must be accepted, as Auth always
 *   accepts it.
 *
 * If Auth doesn't answer that way, nothing is reported as passed or failed.
 */
export async function checkReturnAddresses(
  probe: (to: string) => Promise<Landing>,
): Promise<CheckResult[]> {
  const arbitrary = await probe(ARBITRARY_SITE);
  const open = landedOn(arbitrary, ARBITRARY_SITE);
  if (open === undefined)
    return [
      [
        undefined,
        arbitrary.status === 429
          ? "Return addresses not checked: Auth is rate-limiting verifications; run dev:check again in 5 minutes"
          : `Return addresses not checked: Auth answered ${arbitrary.status} instead of a redirect`,
      ],
    ];
  const results: CheckResult[] = [];
  let site: URL | undefined;
  if (open)
    results.push([
      false,
      "Return address refused: any website (the allow list holds a pattern as broad as https://** or **)",
    ]);
  else {
    try {
      site = new URL(arbitrary.location!);
    } catch {
      site = undefined;
    }
    const control =
      site && site.origin !== "null" ? `${site.origin}/forge-probe` : undefined;
    const controlOk = control
      ? landedOn(await probe(control), control)
      : undefined;
    if (!site || controlOk !== true)
      return [
        [
          undefined,
          "Return addresses not checked: Auth didn't answer as expected (an address on its own Site URL wasn't accepted)",
        ],
      ];
    const local =
      site.hostname === "localhost" || site.hostname === "127.0.0.1";
    results.push([
      undefined,
      `Refused return addresses go to the Site URL (${local ? "localhost, Supabase's default" : site.protocol === "https:" ? "an https page" : `a ${site.protocol} address`})`,
    ]);
  }
  // Where a refused address lands. An allowed address that is the Site URL
  // itself couldn't be told apart from a refusal, so it isn't judged.
  const refusedTo: Landing = { status: 303, location: arbitrary.location };
  for (const to of DEV_REDIRECTS) {
    const ambiguous = !open && landedOn(refusedTo, to) === true;
    const ok = ambiguous ? undefined : landedOn(await probe(to), to);
    results.push([
      ok,
      `Return address allowed: ${to}${ok === undefined ? " (unreadable)" : ""}`,
    ]);
  }
  for (const { to, why } of REFUSED_REDIRECTS) {
    const ok = landedOn(await probe(to), to);
    results.push([
      ok === undefined ? undefined : !ok,
      `Return address refused: ${to} (${why})${ok === undefined ? ", unreadable" : ""}`,
    ]);
  }
  if (!open) results.push([true, "Return address refused: any website"]);
  const tunnel = landedOn(await probe(TUNNEL_EXAMPLE), TUNNEL_EXAMPLE);
  results.push([
    undefined,
    `Expo Go tunnel entry (optional): ${tunnel === undefined ? "unreadable" : tunnel ? "present" : "absent"}`,
  ]);
  return results;
}
