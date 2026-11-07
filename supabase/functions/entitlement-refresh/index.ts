// Edge Function entitlement-refresh (Phase 9.3; not deployed). The
// signed-in account asks Forge's server to read its membership afresh from
// RevenueCat; it is kept in forge_entitlements, and the answer is
// forge_entitlement()'s. Everything is in ../_shared (reconcile.ts decides;
// rest.ts speaks to Supabase and RevenueCat over fetch): this file only
// hands it the environment.
//
// Deployed with the platform's JWT check on (verify_jwt, the default:
// Supabase advises keeping it for functions users call), and it
// authenticates the caller again itself, with Supabase Auth.
// Secrets: SUPABASE_URL, SUPABASE_SECRET_KEYS and SUPABASE_PUBLISHABLE_KEYS
// (injected by Supabase as JSON by key name; "default" is used, and the
// legacy SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are the
// fallbacks), REVENUECAT_SECRET_API_KEY, FORGE_ENVIRONMENT (production or
// development) and FORGE_MEMBERSHIP_PRODUCT_IDS (comma-separated; founder
// decision F16). Without all of them, every request is refused (503) and
// nothing runs.

// @ts-expect-error TS5097: Deno needs the extension (see _shared/reconcile.ts).
import { entitlementRefresh } from "../_shared/rest.ts";

/** What this file uses of Deno's runtime (the app's tsc has no Deno types). */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(entitlementRefresh((name) => Deno.env.get(name), fetch));
