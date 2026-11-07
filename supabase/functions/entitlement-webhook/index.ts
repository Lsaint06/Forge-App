// Edge Function entitlement-webhook (Phase 9.3; not deployed). RevenueCat
// reports a change; every Forge account the event names is refreshed from
// RevenueCat (never from the event's fields), once per event ID.
// Everything is in ../_shared (reconcile.ts decides; rest.ts speaks to
// Supabase and RevenueCat over fetch): this file only hands it the
// environment.
//
// Deployed with Supabase's JWT verification off (`verify_jwt = false`):
// RevenueCat sends no Supabase token. The function checks RevenueCat's
// Authorization header and HMAC signature itself. Secrets: those of
// entitlement-refresh, and REVENUECAT_WEBHOOK_AUTHORIZATION and
// REVENUECAT_WEBHOOK_SIGNING_SECRET, as set on the webhook in RevenueCat.
// Signing is optional in RevenueCat's dashboard: it must be turned on, or
// every delivery is refused. Without all of them, every request is refused
// (503) and nothing runs.

// @ts-expect-error TS5097: Deno needs the extension (see _shared/reconcile.ts).
import { entitlementWebhook } from "../_shared/rest.ts";

/** What this file uses of Deno's runtime (the app's tsc has no Deno types). */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(entitlementWebhook((name) => Deno.env.get(name), fetch));
