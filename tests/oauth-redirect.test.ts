import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  returnUrlRefusal,
  supabaseAcceptsReturnUrl,
} from "../src/auth/redirects";

// Phase 7.7B.1 fix: Continue with Google ended on "localhost" in Expo Go.
// Supabase Auth refuses return addresses whose host is a non-loopback IP
// address (before its allow list) and falls back to the Site URL, and Expo Go
// on a local network returns to exp://<the computer's IP>:8081/--/…

test("return addresses Supabase accepts, as observed on Forge's project", () => {
  // Each verdict below was observed against the live project (Site URL
  // http://localhost:3000; allow list exp://**, exps://**, forge://**,
  // forge://account).
  const observed: [string, boolean][] = [
    // SDK 58 tunnel (@expo/ws-tunnel, on.expo.app).
    ["exps://c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app/--/welcome", true],
    ["exp://c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app/--/welcome", true],
    ["forge:///welcome", true],
    ["forge://welcome", true],
    ["exp://192.168.1.23:8081/--/welcome", false],
    ["exp://10.0.0.5:8081/--/welcome", false],
    ["exp://127.0.0.1:8081/--/welcome", true],
    ["exp://abc-anonymous-8081.exp.direct/--/welcome", true],
    ["exp://my-pc.local:8081/--/welcome", true],
    ["forge://account", true],
  ];
  for (const [url, accepted] of observed)
    assert.equal(supabaseAcceptsReturnUrl(url), accepted, url);
});

test("the IP rule, as Supabase Auth's source defines it", () => {
  // Supabase refuses a whole address written as one number, and IPv6
  // literals other than loopback.
  assert.equal(supabaseAcceptsReturnUrl("exp://3232235777/--/welcome"), false);
  assert.equal(supabaseAcceptsReturnUrl("exp://[fe80::1]:8081/--/x"), false);
  assert.equal(supabaseAcceptsReturnUrl("exp://[::1]:8081/--/x"), true);
  // Hostnames and a build's own scheme are left to the allow list.
  assert.equal(
    supabaseAcceptsReturnUrl("exps://abc-anonymous-8081.exp.direct/--/welcome"),
    true,
  );
  assert.equal(supabaseAcceptsReturnUrl("forge:///welcome"), true);
  assert.equal(supabaseAcceptsReturnUrl("forge://welcome"), true);
  assert.equal(supabaseAcceptsReturnUrl("not a url"), false);
  assert.equal(supabaseAcceptsReturnUrl(""), false);
  // The reason, for the development log.
  assert.equal(
    returnUrlRefusal("exp://192.168.1.23:8081/--/welcome"),
    "ip-address",
  );
  assert.equal(returnUrlRefusal("not a url"), "unreadable");
  assert.equal(
    returnUrlRefusal(
      "exps://c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app/--/welcome",
    ),
    undefined,
  );
});

test("supabase-js sends the return address unchanged, on the implicit flow", async () => {
  const client = createClient(
    "https://forgeproj.supabase.co",
    "sb_publishable_test",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const redirectTo = "exps://abc-anonymous-8081.exp.direct/--/welcome";
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  assert.equal(error, null);
  const url = new URL(data.url!);
  assert.equal(
    url.origin + url.pathname,
    "https://forgeproj.supabase.co/auth/v1/authorize",
  );
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("redirect_to"), redirectTo);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  // Implicit flow: tokens come back in the fragment, as Forge reads them.
  assert.equal(url.searchParams.get("code_challenge"), null);
  // A JSON answer instead of Google's page would break the sheet.
  assert.equal(url.searchParams.get("skip_http_redirect"), null);
});
