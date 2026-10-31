import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { OAUTH_RETURN_PATH } from "./links";
import { socialOptions, useAuthProviders } from "./providers";
import { returnUrlRefusal, supabaseAcceptsReturnUrl } from "./redirects";

// Continue with Apple or Google (Phase 7.7B.1), through the existing
// Supabase Auth. Each only produces a session: the entry gate then decides
// what is shown (setup, the link check, another account's block, or Home),
// exactly as for email. Nothing here reads, links, uploads or downloads
// training data.

export type SocialProvider = "apple" | "google";
/** Signed in, or the athlete closed the sheet: never an error. */
export type SocialOutcome = "signedIn" | "cancelled";

const LABEL: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
};

/**
 * Where Supabase returns from Google: Expo's own URL for this app, never a
 * hand-built one (Expo Go: exp://<development server>/--/welcome, or exps://
 * over a tunnel; Forge's build: forge:///welcome).
 */
export const oauthReturnUrl = () => Linking.createURL(OAUTH_RETURN_PATH);

/** Running inside Expo Go rather than Forge's own build. */
export const inExpoGo = () =>
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The tokens or error in Supabase's redirect back to Forge (implicit flow:
 * in the fragment). Nothing else is read, and nothing is logged.
 */
export function oauthRedirectResult(url: string): {
  tokens?: { access_token: string; refresh_token: string };
  error?: string;
} {
  try {
    const u = new URL(url);
    const hash = new URLSearchParams(u.hash.slice(1));
    const get = (key: string) => hash.get(key) ?? u.searchParams.get(key);
    const error = get("error") ?? get("error_code");
    if (error) return { error };
    const access_token = get("access_token");
    const refresh_token = get("refresh_token");
    return access_token && refresh_token
      ? { tokens: { access_token, refresh_token } }
      : { error: "missing_tokens" };
  } catch {
    return { error: "invalid_redirect" };
  }
}

class SocialSignInError extends Error {
  constructor(
    readonly provider: SocialProvider,
    readonly code: string,
  ) {
    super(`${LABEL[provider]} sign-in failed (${code})`);
  }
}

/**
 * Google, through Supabase's OAuth flow in the system's secure sign-in sheet
 * (works in Expo Go). Google returns to Supabase, which returns to Forge;
 * the client secret lives only in Supabase.
 */
export async function signInWithGoogle(
  client: SupabaseClient,
  onAuthorized?: () => void,
): Promise<SocialOutcome> {
  const redirectTo = oauthReturnUrl();
  // Supabase would send the athlete to its Site URL instead: never open a
  // sheet that can't come back.
  if (!supabaseAcceptsReturnUrl(redirectTo))
    throw new SocialSignInError("google", "return_address_refused");
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Always ask which Google account: phones are shared.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new SocialSignInError("google", "no_url");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return "cancelled";
  const { tokens, error: denied } = oauthRedirectResult(result.url);
  if (denied === "access_denied") return "cancelled";
  if (!tokens) throw new SocialSignInError("google", denied ?? "unknown");
  onAuthorized?.();
  const { error: session } = await client.auth.setSession(tokens);
  if (session) throw session;
  return "signedIn";
}

/**
 * Apple's native sheet (iOS, Forge's own build only), then Supabase's ID
 * token sign-in. A one-time nonce ties Apple's token to this request.
 */
export async function signInWithApple(
  client: SupabaseClient,
  onAuthorized?: () => void,
): Promise<SocialOutcome> {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: unknown })?.code === "ERR_REQUEST_CANCELED")
      return "cancelled";
    throw e;
  }
  if (!credential.identityToken)
    throw new SocialSignInError("apple", "no_identity_token");
  onAuthorized?.();
  const { error } = await client.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce,
  });
  if (error) throw error;
  // Apple shares the name only the first time: keep it on the account
  // (Supabase's recommendation). Not used by Forge yet (Phase 7.7C).
  const n = credential.fullName;
  const full = [n?.givenName, n?.middleName, n?.familyName]
    .filter((part): part is string => !!part)
    .join(" ");
  if (full)
    await client.auth
      .updateUser({
        data: {
          full_name: full,
          given_name: n?.givenName ?? undefined,
          family_name: n?.familyName ?? undefined,
        },
      })
      .catch(() => {});
  return "signedIn";
}

/** Plain words for a failed sign-in; provider details go to the log only. */
export function socialErrorText(provider: SocialProvider, e: unknown) {
  const code =
    e instanceof SocialSignInError
      ? e.code
      : String(
          (e as { code?: unknown; name?: unknown })?.code ??
            (e as { name?: unknown })?.name ??
            "unknown",
        );
  console.warn(`[FORGE] ${LABEL[provider]} sign-in failed`, code);
  if (isAuthRetryableFetchError(e))
    return "Can't reach Forge's account service. Check your connection and try again.";
  return `${LABEL[provider]} sign-in didn't finish. Try again, or continue with email.`;
}

/** The provider buttons that work here, now. */
export function useSocialOptions() {
  const providers = useAuthProviders();
  const expoGo = inExpoGo();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios" || expoGo) return;
    let active = true;
    AppleAuthentication.isAvailableAsync().then(
      (ok) => {
        if (active) setAppleAvailable(ok);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [expoGo]);
  const returnUrl = oauthReturnUrl();
  const refusal = returnUrlRefusal(returnUrl);
  const googleReturns = !refusal;
  const googleEnabled = providers.google;
  // Development only: say exactly where Google would return, and why it is
  // hidden when Supabase would refuse that address. The address is the
  // development server's (never a token or a secret).
  useEffect(() => {
    if (!__DEV__ || !googleEnabled) return;
    console.info(
      refusal === "ip-address"
        ? `[FORGE] Continue with Google is hidden: this copy of Forge was loaded from a local network address, so its return address is ${returnUrl}, and Supabase never returns sign-ins to an IP address. Close it in Expo Go, then open the tunnel address Metro shows (scan its QR code), or use a development build.`
        : refusal
          ? `[FORGE] Continue with Google is hidden: its return address can't be read (${returnUrl}).`
          : `[FORGE] Continue with Google returns to ${returnUrl}.`,
    );
  }, [googleEnabled, refusal, returnUrl]);
  return socialOptions({
    platform: Platform.OS,
    expoGo,
    appleAvailable,
    googleReturns,
    providers,
  });
}
