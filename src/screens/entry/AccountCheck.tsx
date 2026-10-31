import React, { useRef, useState } from "react";
import { View } from "react-native";
import {
  CtaButton,
  FText,
  ForgeCard,
  OutlineButton,
} from "../../components/reforge";
import { useRepo, useApp, confirm } from "../../state";
import { linkChecked } from "../../cloud/link";
import { BackupSheet } from "../../components/Backup";
import { authErrorText, useEntry } from "../../auth/session";
import { localSummary, ownerHint } from "../../data/ownership";
import { cancelAllNotifications } from "../../notifications";
import { DangerRow, DeleteLocalData } from "../you/account";
import { EntryFrame, EntryMessage } from "./EntryFrame";
import { PASSWORD_MIN } from "./CreateAccount";
import { PasswordField } from "./PasswordField";

type Busy = "link" | "signOut" | "password";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "Google", "Email or Google". */
const orList = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

// Account checks (Phases 7.7B and 7.7C): what has to happen before any
// training is shown. Linking this phone's data to an account needs the
// athlete's explicit choice; another account's data is never shown.
export default function AccountCheck() {
  const { entry, client, finishRecovery, signOut: endSession } = useEntry();
  const r = useRepo();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [password, setPassword] = useState("");
  // The account already holds cloud records: linking was refused.
  const [blocked, setBlocked] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const running = useRef(false);
  const user = "user" in entry ? entry.user : undefined;
  const who = user?.email ?? "this account";

  async function run(
    kind: Busy,
    action: () => Promise<void>,
    fallback: string,
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(authErrorText(e, fallback));
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }
  const signOut = () =>
    void run(
      "signOut",
      async () => {
        if (endSession) return endSession();
        const { error: e } = await client!.auth.signOut();
        if (e) throw e;
      },
      "Forge couldn't sign you out. Try again.",
    );
  const signOutTitle = busy === "signOut" ? "Signing out…" : "Sign out";

  if (entry.kind === "unconfigured" || entry.kind === "misconfigured")
    return (
      <EntryFrame title="Accounts aren't available" eyebrow="Forge">
        <ForgeCard gap={10} testID="accounts-unavailable">
          <FText variant="body">
            {entry.kind === "unconfigured"
              ? "This build of Forge isn't connected to its account service, and Forge needs an account to sign in."
              : "This build of Forge has an invalid account service address, so it can't sign in."}
          </FText>
          <FText variant="label" tone="secondary">
            Training already on this phone is kept. It opens again once this
            build is connected and you sign in.
          </FText>
        </ForgeCard>
      </EntryFrame>
    );

  if (entry.kind === "unlinked" && blocked)
    return (
      <EntryFrame
        title="This account already has training"
        eyebrow="Your account"
        footer={
          <>
            <OutlineButton
              title="Export backup"
              disabled={!!busy}
              onPress={() => setBackupOpen(true)}
            />
            <OutlineButton
              title={signOutTitle}
              disabled={!!busy}
              onPress={signOut}
            />
          </>
        }
      >
        <ForgeCard gap={10} testID="account-link-blocked">
          <FText variant="body">
            {`${who} already has training saved in Forge's cloud. Forge can't safely combine it with the separate training on this phone, so it won't link them.`}
          </FText>
          <FText variant="label" tone="secondary">
            Nothing was linked, uploaded or deleted.
          </FText>
          <FText variant="label" tone="secondary">
            {
              "To keep this phone's training, export a backup, then sign out. It can be linked to an account with no training saved yet."
            }
          </FText>
          <FText variant="label" tone="secondary">
            {`To use ${who}'s training on this phone instead, export a backup, then delete this phone's data. After setup, synchronize in Account & privacy.`}
          </FText>
        </ForgeCard>
        <ForgeCard padding={0} gap={0}>
          <DeleteLocalData />
        </ForgeCard>
        <EntryMessage text={error} tone="error" />
        <BackupSheet
          visible={backupOpen}
          onClose={() => setBackupOpen(false)}
        />
      </EntryFrame>
    );

  if (entry.kind === "unlinked")
    return (
      <EntryFrame
        title="Link this phone's training"
        eyebrow="Your account"
        footer={
          <>
            <CtaButton
              title={
                busy === "link" ? "Checking your account…" : `Link to ${who}`
              }
              disabled={!!busy}
              onPress={() =>
                void run(
                  "link",
                  async () => {
                    let result;
                    try {
                      result = await linkChecked(r, client!, entry.user.id);
                    } catch {
                      // Fails closed; the details never reach the athlete.
                      throw new Error(
                        "Forge couldn't check your account, so nothing was linked. Check your connection and try again.",
                      );
                    }
                    if (result === "accountHasRecords") setBlocked(true);
                    else useApp.getState().touch();
                  },
                  "Linking didn't work. Try again.",
                )
              }
            />
            <OutlineButton
              title={signOutTitle}
              disabled={!!busy}
              onPress={signOut}
            />
          </>
        }
      >
        <ForgeCard gap={10} testID="account-unlinked">
          <FText variant="body">
            {`This phone has training that isn't linked to an account yet. Link it to ${who} to keep using it.`}
          </FText>
          <FText variant="label" tone="secondary">
            {
              "Forge first checks that this account has no training saved in the cloud: two separate histories can't be combined safely. Linking uploads nothing; it stays on this phone until you choose to synchronize in Account & privacy. If this training isn't yours, sign out."
            }
          </FText>
        </ForgeCard>
        <EntryMessage text={error} tone="error" />
      </EntryFrame>
    );

  if (entry.kind === "otherAccount")
    return (
      <OtherAccount
        who={who}
        busy={busy}
        error={error}
        signOutTitle={signOutTitle}
        onSignOut={signOut}
      />
    );

  if (entry.kind === "recovery") {
    const update = () =>
      void run(
        "password",
        async () => {
          if (password.length < PASSWORD_MIN)
            throw new Error(
              `Use at least ${PASSWORD_MIN} characters for your password.`,
            );
          const { error: e } = await client!.auth.updateUser({ password });
          if (e) throw e;
          setPassword("");
          finishRecovery();
        },
        "Forge couldn't update your password. Try again.",
      );
    return (
      <EntryFrame
        title="Set a new password"
        eyebrow="Forge account"
        footer={
          <CtaButton
            title={
              busy === "password" ? "Updating password…" : "Set new password"
            }
            disabled={!!busy}
            onPress={update}
          />
        }
      >
        <ForgeCard gap={14} testID="account-recovery">
          <FText variant="body">{`Choose a new password for ${who}.`}</FText>
          <PasswordField
            label="New password"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={update}
          />
          <FText variant="label" tone="secondary">
            {`At least ${PASSWORD_MIN} characters.`}
          </FText>
        </ForgeCard>
        <EntryMessage text={error} tone="error" />
      </EntryFrame>
    );
  }

  // Any other state routes elsewhere; nothing to show here.
  return <View />;
}

/**
 * Another account's training is on this phone (Phase 7.7C). Says who owns
 * it (masked, from a hint that is never authorization), why it is kept
 * apart, how to get back to it, and exactly what deleting would remove.
 */
function OtherAccount({
  who,
  busy,
  error,
  signOutTitle,
  onSignOut,
}: {
  who: string;
  busy?: Busy;
  error?: string;
  signOutTitle: string;
  onSignOut: () => void;
}) {
  const r = useRepo();
  const hint = ownerHint(r);
  const summary = localSummary(r);
  const owner = hint?.email ?? "a different Forge account";
  const methods = hint?.methods?.length ? orList(hint.methods) : undefined;
  const removed = [
    summary.workouts && plural(summary.workouts, "workout"),
    summary.templates && plural(summary.templates, "template"),
    summary.journal &&
      plural(summary.journal, "journal entry", "journal entries"),
    summary.customExercises &&
      plural(summary.customExercises, "custom exercise"),
  ].filter(Boolean) as string[];
  const contents = removed.length
    ? `${removed.join(", ")}, with that account's profile and preferences`
    : "that account's profile and preferences";
  const unsynced = summary.unsynced
    ? `${plural(summary.unsynced, "change")} ${summary.unsynced === 1 ? "was" : "were"} never synchronized: ${summary.unsynced === 1 ? "it exists" : "they exist"} only on this phone and would be lost for good.`
    : "Everything here had been synchronized, so that account keeps its training in the cloud.";
  const remove = () =>
    confirm(
      "Delete the other account's training?",
      `This removes ${contents} from this phone. ${unsynced} It can't be undone.`,
      () => {
        r.clearData();
        void cancelAllNotifications().catch(() => {});
      },
      { action: "Delete from this phone" },
    );
  return (
    <EntryFrame
      title="This phone's training belongs to another account"
      eyebrow="Your account"
      footer={
        <CtaButton title={signOutTitle} disabled={!!busy} onPress={onSignOut} />
      }
    >
      <ForgeCard gap={10} testID="account-other">
        <FText variant="body">
          {`You're signed in as ${who}, but the training on this phone belongs to ${owner}.`}
        </FText>
        <FText variant="label" tone="secondary">
          {
            "Forge keeps each account's training separate: it never shows, moves or combines one account's training with another's."
          }
        </FText>
      </ForgeCard>
      <ForgeCard gap={8} testID="account-other-return">
        <FText variant="cardTitle" weight="700" header>
          To use this phone&apos;s training
        </FText>
        <FText variant="body">1. Sign out.</FText>
        <FText variant="body">
          {hint?.email
            ? `2. Sign in with ${hint.email}${methods ? ` using ${methods}` : ""}.`
            : `2. Sign in with the account that used this phone before${methods ? `, using ${methods}` : ""}.`}
        </FText>
        <FText variant="label" tone="secondary">
          Everything on this phone will be just as it was.
        </FText>
      </ForgeCard>
      <FText variant="overline" tone="secondary" header>
        {`Use this phone for ${who} instead`}
      </FText>
      <ForgeCard padding={0} gap={0} testID="account-other-delete">
        <View style={{ padding: 16, gap: 8 }}>
          <FText variant="body">
            {`Deleting removes ${contents} from this phone.`}
          </FText>
          <FText
            variant="label"
            tone={summary.unsynced ? "error" : "secondary"}
          >
            {unsynced}
          </FText>
        </View>
        <DangerRow
          title="Delete this phone's training"
          description="Removes it from this phone only. It can't be undone."
          divider
          disabled={!!busy}
          onPress={remove}
        />
      </ForgeCard>
      <EntryMessage text={error} tone="error" />
    </EntryFrame>
  );
}
