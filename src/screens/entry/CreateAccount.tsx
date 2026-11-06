import React, { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { router } from "expo-router";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeField,
  OutlineButton,
} from "../../components/reforge";
import { authErrorText, useEntry } from "../../auth/session";
import { confirmReturnUrl, resendConfirmation } from "../../auth/email";
import { EntryFrame, EntryMessage } from "./EntryFrame";
import { PasswordField, useCooldown } from "./PasswordField";
import { TextLink } from "./SignIn";

/** The same minimum as setting a new password on the Account screen. */
export const PASSWORD_MIN = 8;

/** The first problem with the form, in plain words; undefined when ready. */
export function signUpProblem(
  email: string,
  password: string,
  confirm: string,
) {
  const address = email.trim();
  if (!address) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return "Enter a valid email address.";
  if (password.length < PASSWORD_MIN)
    return `Use at least ${PASSWORD_MIN} characters for your password.`;
  if (password !== confirm) return "The passwords don't match.";
  return undefined;
}

const back = () =>
  router.canGoBack() ? router.back() : router.replace("/welcome");

type InputRef = React.ComponentRef<typeof TextInput>;

// Create account (Phases 7.7B and 7.7C): the existing Supabase sign-up.
// Creating an account is not a session: Forge continues only when the
// account service returns one. When the project asks for email
// confirmation, that is said plainly, a new link can be sent, and the
// athlete signs in afterwards.
export default function CreateAccount() {
  const { client } = useEntry();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"create" | "resend">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmFor, setConfirmFor] = useState<string>();
  const cooldown = useCooldown();
  const running = useRef(false);
  const passwordRef = useRef<InputRef>(null);
  const confirmRef = useRef<InputRef>(null);

  async function submit() {
    if (!client || running.current) return;
    const problem = signUpProblem(email, password, confirm);
    setError(problem);
    if (problem) return;
    running.current = true;
    setBusy("create");
    try {
      const address = email.trim();
      const { data, error: e } = await client.auth.signUp({
        email: address,
        password,
        // The confirmation link returns to Sign in (Expo Go: exp://…/--/sign-in).
        options: { emailRedirectTo: confirmReturnUrl() },
      });
      if (e) throw e;
      setPassword("");
      setConfirm("");
      // With a session, the entry state moves on by itself.
      if (!data.session) {
        setConfirmFor(address);
        cooldown.start();
      }
    } catch (e) {
      setError(
        authErrorText(e, "Forge couldn't create your account. Try again."),
      );
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  async function resend() {
    if (!client || !confirmFor || running.current) return;
    running.current = true;
    setBusy("resend");
    setError(undefined);
    setNotice(undefined);
    try {
      await resendConfirmation(client, confirmFor);
      cooldown.start();
      setNotice(`Sent again. Check ${confirmFor}, including your spam folder.`);
    } catch (e) {
      setError(authErrorText(e, "Forge couldn't send the email. Try again."));
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  if (confirmFor)
    return (
      <EntryFrame
        title="Confirm your email"
        eyebrow="Forge account"
        onBack={() => {
          setConfirmFor(undefined);
          setError(undefined);
          setNotice(undefined);
        }}
        footer={
          <>
            <CtaButton
              title="Go to sign in"
              onPress={() => router.replace("/sign-in")}
            />
            <OutlineButton
              title={
                busy === "resend"
                  ? "Sending…"
                  : cooldown.remaining > 0
                    ? `Resend email in ${cooldown.remaining} s`
                    : "Resend email"
              }
              icon="mail-outline"
              disabled={!!busy || cooldown.remaining > 0}
              onPress={() => void resend()}
            />
          </>
        }
      >
        <View testID="confirm-email" style={{ gap: 12 }}>
          <FText variant="body">
            {`Check ${confirmFor} for a confirmation link from Forge's account service, then sign in.`}
          </FText>
          <FText variant="label" tone="secondary">
            If it doesn&apos;t arrive within a few minutes, check your spam
            folder or send it again.
          </FText>
          <FText variant="label" tone="secondary">
            If you already have an account with this email, sign in instead,
            including with Continue with Google if that&apos;s how you created
            it.
          </FText>
        </View>
        <EntryMessage text={notice} />
        <EntryMessage text={error} tone="error" />
      </EntryFrame>
    );

  return (
    <EntryFrame
      title="Create account"
      eyebrow="Forge account"
      onBack={back}
      footer={
        <CtaButton
          title={busy === "create" ? "Creating account…" : "Create account"}
          disabled={!!busy}
          onPress={() => void submit()}
        />
      }
    >
      <ForgeCard gap={14}>
        <ForgeField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordField
          ref={confirmRef}
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <FText variant="label" tone="secondary">
          {`At least ${PASSWORD_MIN} characters.`}
        </FText>
      </ForgeCard>
      <EntryMessage text={error} tone="error" />
      <TextLink
        label="Already have an account? Sign in"
        onPress={() => router.replace("/sign-in")}
      />
    </EntryFrame>
  );
}
