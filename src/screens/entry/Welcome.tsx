import React, { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  BRAND_TAGLINE,
  CtaButton,
  FText,
  OutlineButton,
  Wordmark,
} from "../../components/reforge";
import { forge } from "../../theme";
import { useEntry } from "../../auth/session";
import { useAuthLinkStatus } from "../../auth/links";
import {
  signInWithApple,
  signInWithGoogle,
  socialErrorText,
  useSocialOptions,
  type SocialProvider,
} from "../../auth/social";
import { EntryFrame, EntryMessage } from "./EntryFrame";
import { AppleButton, GoogleButton } from "./ProviderButtons";

// Welcome (Phases 7.7B and 7.7B.1): the first screen after the intro for
// anyone who isn't signed in. Forge requires an account: Continue with
// Apple, Google or Email, and nothing else. A provider appears only when it
// is enabled and works here; email is always available.
export default function Welcome() {
  // A reset link that expired lands here (signed out); say what happened.
  const linkStatus = useAuthLinkStatus();
  const { client, notice } = useEntry();
  const options = useSocialOptions();
  const [busy, setBusy] = useState<SocialProvider>();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const social = options.apple || options.google;

  async function continueWith(provider: SocialProvider) {
    if (!client || running.current) return;
    running.current = true;
    setBusy(provider);
    setError(undefined);
    try {
      const signIn = provider === "apple" ? signInWithApple : signInWithGoogle;
      // Signed in: the entry state moves on. Cancelled: nothing to say.
      await signIn(client, () => setFinishing(true));
    } catch (e) {
      setError(socialErrorText(provider, e));
    } finally {
      running.current = false;
      setBusy(undefined);
      setFinishing(false);
    }
  }
  const email = () => router.push("/sign-in");

  return (
    <EntryFrame
      footer={
        <>
          {options.apple && (
            <AppleButton
              disabled={!!busy}
              onPress={() => void continueWith("apple")}
            />
          )}
          {options.google && (
            <GoogleButton
              disabled={!!busy}
              onPress={() => void continueWith("google")}
            />
          )}
          {social ? (
            <OutlineButton
              title="Continue with Email"
              icon="mail-outline"
              disabled={!!busy}
              onPress={email}
            />
          ) : (
            <CtaButton
              title="Continue with Email"
              icon="mail-outline"
              onPress={email}
            />
          )}
        </>
      }
    >
      <View
        testID="welcome"
        style={{ flex: 1, justifyContent: "center", gap: 18 }}
      >
        <View style={{ gap: 10 }}>
          <Wordmark width={220} />
          <FText variant="overline" tone="accent">
            {BRAND_TAGLINE}
          </FText>
        </View>
        <View style={{ gap: 10, marginTop: forge.spacing.group }}>
          <FText variant="heroTitle" header>
            Your training starts here.
          </FText>
          <FText variant="body" tone="secondary">
            Train with purpose. Track your progress. Build something that lasts.
          </FText>
        </View>
        <FText variant="label" tone="secondary">
          Forge works with your account. Your training is saved on your phone
          and synchronized to your account only when you choose.
        </FText>
        <EntryMessage text={notice} />
        <EntryMessage text={linkStatus?.text} tone={linkStatus?.tone} />
        <EntryMessage
          text={finishing ? "Signing you in…" : undefined}
          tone="secondary"
        />
        <EntryMessage text={error} tone="error" />
      </View>
    </EntryFrame>
  );
}
