import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  CtaButton,
  FText,
  ForgeCard,
  OutlineButton,
} from "../../components/reforge";
import { Label, Screen } from "../../components/ui";
import { ProfileForm } from "../../components/ProfileForm";
import { confirm, useApp, useRepo } from "../../state";
import { authErrorText, useEntry } from "../../auth/session";
import { hasLocalData } from "../../data/ownership";
import { accountHasCloudRecords } from "../../cloud/link";
import { synchronize } from "../../cloud/sync";
import { transport } from "../../cloud/client";
import { restoreOutcome } from "../../domain/presentation/account";
import { EntryBusy, EntryFrame, EntryMessage } from "./EntryFrame";
import { TextLink } from "./SignIn";

type Check = "checking" | "records" | "none" | "failed";

// First-time setup (Phases 7.7B and 7.7C). A returning athlete on a phone
// with nothing of its own yet is offered their saved training first (P1):
// a read-only check, then, only if they choose it, the existing manual
// synchronization, once. On an empty phone that only downloads. Everyone
// else sets up as before. Who is being set up is always shown, with a way
// out for the wrong account (P4).
export default function Setup() {
  const { entry, client, signOut: endSession } = useEntry();
  const r = useRepo();
  const user = entry.kind === "setup" ? entry.user : undefined;
  const userId = user?.id;
  const who = user?.email ?? "this account";
  const offline = entry.kind === "setup" && entry.offline;
  // Restore only where there's nothing to protect and nothing to upload.
  const [check, setCheck] = useState<Check>(() =>
    client && userId && !hasLocalData(r)
      ? offline
        ? "failed"
        : "checking"
      : "none",
  );
  const [busy, setBusy] = useState<"restore" | "signOut">();
  const [error, setError] = useState<string>();
  const [partial, setPartial] = useState<string>();
  const running = useRef(false);

  useEffect(() => {
    if (check !== "checking" || !client || !userId) return;
    let active = true;
    accountHasCloudRecords(client, userId).then(
      (has) => {
        if (active) setCheck(has ? "records" : "none");
      },
      () => {
        if (active) setCheck("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [check, client, userId]);

  async function work(
    kind: "restore" | "signOut",
    action: () => Promise<void>,
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(
        authErrorText(
          e,
          kind === "restore"
            ? "Forge couldn't restore your training. Try again."
            : "Forge couldn't sign you out. Try again.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  const doSignOut = () =>
    void work("signOut", async () => {
      if (endSession) return endSession();
      const { error: e } = await client!.auth.signOut();
      if (e) throw e;
    });
  // Nothing entered yet: just sign out (another account can then set the
  // phone up). Otherwise say what stays behind.
  const notYou = () =>
    hasLocalData(r)
      ? confirm(
          "Sign out?",
          `What you've entered so far stays on this phone with ${who}. Another account can't use this phone until it's removed.`,
          doSignOut,
          { action: "Sign out", destructive: false },
        )
      : doSignOut();

  const restore = () =>
    void work("restore", async () => {
      setPartial(undefined);
      const result = await synchronize(r, transport(client!, userId!), userId!);
      const outcome = restoreOutcome(result);
      if (outcome.kind === "done") {
        // Home opens once the restored profile is in; if the account had
        // no finished profile, setup continues with the training in place.
        setCheck("none");
        useApp.getState().touch();
        return;
      }
      if (outcome.kind === "failed") throw new Error(outcome.text);
      setPartial(outcome.text);
    });

  const skip = (unchecked: boolean) =>
    confirm(
      unchecked ? "Set up without checking?" : "Set up without restoring?",
      `If ${who} has training saved in Forge's cloud, it stays there. Synchronizing later in Account & privacy brings it to this phone, and you'll choose which profile to keep.`,
      () => setCheck("none"),
      { action: "Set up this phone", destructive: false },
    );

  const account = (
    <SetupAccount who={who} disabled={!!busy} onNotYou={notYou} />
  );

  if (check === "checking")
    return (
      <EntryFrame title="Welcome to Forge" eyebrow="Your account">
        {account}
        <EntryBusy text="Checking your account…" />
      </EntryFrame>
    );

  if (check === "records")
    return (
      <EntryFrame
        title="Welcome back"
        eyebrow="Your account"
        footer={
          partial ? (
            <>
              <CtaButton
                title="Continue"
                disabled={!!busy}
                onPress={() => {
                  setCheck("none");
                  useApp.getState().touch();
                }}
              />
              <OutlineButton
                title={busy === "restore" ? "Restoring…" : "Try again"}
                disabled={!!busy}
                onPress={restore}
              />
            </>
          ) : (
            <CtaButton
              title={
                busy === "restore"
                  ? "Restoring your training…"
                  : "Restore my training"
              }
              icon="cloud-download-outline"
              disabled={!!busy}
              onPress={restore}
            />
          )
        }
      >
        {account}
        <ForgeCard gap={10} testID="setup-restore">
          <FText variant="body">
            {`${who} has training saved in Forge's cloud. Restore it to this phone to pick up where you left off.`}
          </FText>
          <FText variant="label" tone="secondary">
            Your workouts, templates, journal and profile come back. Nothing is
            uploaded, and nothing else changes.
          </FText>
        </ForgeCard>
        {busy === "restore" && <EntryBusy text="Restoring your training…" />}
        <EntryMessage text={partial} tone="error" />
        <EntryMessage text={error} tone="error" />
        {!partial && (
          <TextLink
            label="Set up without restoring"
            disabled={!!busy}
            onPress={() => skip(false)}
          />
        )}
      </EntryFrame>
    );

  if (check === "failed")
    return (
      <EntryFrame
        title="Couldn't check your account"
        eyebrow="Your account"
        footer={
          <>
            <CtaButton
              title="Try again"
              disabled={!!busy}
              onPress={() => {
                setError(undefined);
                setCheck("checking");
              }}
            />
            <OutlineButton
              title="Set up this phone now"
              disabled={!!busy}
              onPress={() => skip(true)}
            />
          </>
        }
      >
        {account}
        <ForgeCard gap={10} testID="setup-check-failed">
          <FText variant="body">
            {offline
              ? `You're offline, so Forge can't look for training saved to ${who}.`
              : `Forge couldn't reach its account service to look for training saved to ${who}.`}
          </FText>
          <FText variant="label" tone="secondary">
            {
              "If you've used Forge before, connect and try again to restore it. Otherwise, set up this phone now."
            }
          </FText>
        </ForgeCard>
        <EntryMessage text={error} tone="error" />
      </EntryFrame>
    );

  return (
    <Screen title="Made by your effort." eyebrow="WELCOME TO FORGE">
      <Label muted>
        A private training log. A clearer view of your progress. Set up your
        profile to start training.
      </Label>
      {userId && account}
      <EntryMessage text={error} tone="error" />
      <ProfileForm onboarding onDone={() => router.replace("/(tabs)")} />
    </Screen>
  );
}

/** Who is being set up, with a way out for the wrong account (P4). */
function SetupAccount({
  who,
  disabled,
  onNotYou,
}: {
  who: string;
  disabled: boolean;
  onNotYou: () => void;
}) {
  return (
    <View testID="setup-account" style={{ gap: 2 }}>
      <FText variant="label" tone="secondary">
        {`Setting up Forge for ${who}`}
      </FText>
      <TextLink
        label="Not you? Sign out"
        disabled={disabled}
        onPress={onNotYou}
      />
    </View>
  );
}
