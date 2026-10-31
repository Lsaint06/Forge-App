import React, { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeField,
  OutlineButton,
} from "../../components/reforge";
import { authErrorCode, authErrorText, useEntry } from "../../auth/session";
import { useAuthLinkStatus } from "../../auth/links";
import { resendConfirmation } from "../../auth/email";
import { EntryFrame, EntryMessage } from "./EntryFrame";
import { PasswordField, useCooldown } from "./PasswordField";

const back = () =>
  router.canGoBack() ? router.back() : router.replace("/welcome");

// Sign in (Phases 7.7B and 7.7C): the existing Supabase email and password
// sign-in and password-reset request. A successful sign-in is what changes
// the entry state; this screen never navigates into the app on its own.
export default function SignIn() {
  const { client } = useEntry();
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"signIn" | "reset" | "resend">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // The address that still needs confirming, for "Resend confirmation email".
  const [unconfirmed, setUnconfirmed] = useState<string>();
  const cooldown = useCooldown();
  const running = useRef(false);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const linkStatus = useAuthLinkStatus();

  async function run(
    kind: "signIn" | "reset" | "resend",
    work: () => Promise<void>,
  ) {
    if (!client || running.current) return;
    running.current = true;
    setBusy(kind);
    setError(undefined);
    setNotice(undefined);
    try {
      await work();
    } catch (e) {
      if (authErrorCode(e) === "email_not_confirmed") {
        const address = email.trim();
        setUnconfirmed(address);
        setError(
          `Confirm your email first: open the link sent to ${address}, then sign in.`,
        );
      } else {
        setError(
          authErrorText(
            e,
            kind === "reset"
              ? "Forge couldn't send a reset link. Try again."
              : kind === "resend"
                ? "Forge couldn't send the email. Try again."
                : "Sign-in didn't work. Try again.",
          ),
        );
      }
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  function submit() {
    const address = email.trim();
    if (!address || (!reset && !password)) {
      setError(
        reset ? "Enter your email address." : "Enter your email and password.",
      );
      return;
    }
    if (reset)
      void run("reset", async () => {
        const { error: e } = await client!.auth.resetPasswordForEmail(address, {
          redirectTo: Linking.createURL("/account"),
        });
        if (e) throw e;
        cooldown.start();
        setNotice(
          `Reset requested. If ${address} has a Forge account, use the link in that email to set a new password. Check your spam folder if it doesn't arrive.`,
        );
      });
    else
      void run("signIn", async () => {
        setUnconfirmed(undefined);
        const { error: e } = await client!.auth.signInWithPassword({
          email: address,
          password,
        });
        if (e) throw e;
        setPassword("");
      });
  }

  const resend = () =>
    void run("resend", async () => {
      await resendConfirmation(client!, unconfirmed!);
      cooldown.start();
      setNotice(
        `Sent. Check ${unconfirmed} for a new confirmation link, including your spam folder.`,
      );
    });

  const waiting = cooldown.remaining > 0;
  return (
    <EntryFrame
      title={reset ? "Reset password" : "Sign in"}
      eyebrow="Forge account"
      onBack={
        reset
          ? () => {
              setReset(false);
              setError(undefined);
              setNotice(undefined);
            }
          : back
      }
      footer={
        <CtaButton
          title={
            busy === "signIn"
              ? "Signing in…"
              : busy === "reset"
                ? "Sending reset link…"
                : reset
                  ? waiting
                    ? `Send again in ${cooldown.remaining} s`
                    : "Send reset link"
                  : "Sign in"
          }
          disabled={!!busy || (reset && waiting)}
          onPress={submit}
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
          returnKeyType={reset ? "send" : "next"}
          submitBehavior={reset ? "blurAndSubmit" : "submit"}
          onSubmitEditing={() =>
            reset ? submit() : passwordRef.current?.focus()
          }
        />
        {!reset && (
          <PasswordField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        )}
      </ForgeCard>
      <EntryMessage text={linkStatus?.text} tone={linkStatus?.tone} />
      <EntryMessage text={error} tone="error" />
      <EntryMessage text={notice} />
      {!reset && unconfirmed && (
        <OutlineButton
          title={
            busy === "resend"
              ? "Sending…"
              : waiting
                ? `Resend in ${cooldown.remaining} s`
                : "Resend confirmation email"
          }
          icon="mail-outline"
          disabled={!!busy || waiting}
          onPress={resend}
        />
      )}
      <View style={{ gap: 4 }}>
        {!reset && (
          <TextLink
            label="Forgot password?"
            onPress={() => {
              setReset(true);
              setError(undefined);
              setNotice(undefined);
            }}
          />
        )}
        <TextLink
          label="New to Forge? Create an account"
          onPress={() => router.replace("/create-account")}
        />
      </View>
    </EntryFrame>
  );
}

/** A quiet text action with a 44 pt touch target. */
export function TextLink({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <FText variant="body" weight="700" tone="accent">
        {label}
      </FText>
    </Pressable>
  );
}
