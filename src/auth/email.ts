import * as Linking from "expo-linking";
import type { SupabaseClient } from "@supabase/supabase-js";

// Email confirmation (Phases 7.7B and 7.7C): links return to Sign in, which
// says the email is confirmed. A new link can be sent for an unconfirmed
// account; Supabase allows one email to an address about every minute.

export const CONFIRM_RETURN_PATH = "/sign-in";
export const confirmReturnUrl = () => Linking.createURL(CONFIRM_RETURN_PATH);

/** Sends the sign-up confirmation email again. */
export async function resendConfirmation(
  client: SupabaseClient,
  email: string,
) {
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: confirmReturnUrl() },
  });
  if (error) throw error;
}
