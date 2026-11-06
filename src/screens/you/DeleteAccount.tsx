import React, { useRef, useState } from "react";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeSubScreen,
  OutlineButton,
} from "../../components/reforge";
import { BackupChoices, useBackupActions } from "../../components/Backup";
import { useRepo, useApp, confirm } from "../../state";
import { cloudClient, tokenClient, verifierClient } from "../../cloud/client";
import { goBack } from "../../navigation";
import { authErrorCode, authErrorText, useEntry } from "../../auth/session";
import {
  checkDeletion,
  cloudDeletion,
  deleteAccount,
  deletedAccount,
  dismissDeletion,
  pendingDeletion,
  type DeletionDeps,
  type DeletionOutcome,
} from "../../auth/account-deletion";
import {
  RECENT_SIGN_IN_MS,
  ReauthError,
  reauthWithPassword,
} from "../../auth/reauth";
import {
  reauthWithGoogle,
  socialErrorText,
  useSocialOptions,
} from "../../auth/social";
import { dataOwner, localSummary } from "../../data/ownership";
import { backupState } from "../../data/backup";
import {
  ACCOUNT_GONE_HERE,
  DELETION_DIDNT_HAPPEN,
  unsyncedLossText,
} from "../../domain/presentation/account";
import { cancelAllNotifications } from "../../notifications";
import { DangerRow } from "./account";
import { EntryBusy, EntryMessage } from "../entry/EntryFrame";
import { PasswordField } from "../entry/PasswordField";
import { GoogleButton } from "../entry/ProviderButtons";

// Delete Forge account (Phase 7.8E, Stage 2): what deleting means, a backup
// first, the athlete confirmed again, then one explicit, final confirmation.
// The deletion itself, and what happens after an interruption, is
// src/auth/account-deletion. Confirming it's you is checked in the app
// only: the account service doesn't yet require a recent sign-in (Stage 3).

type Step =
  | "explain"
  | "backup"
  | "identity"
  | "final"
  | "working"
  | "uncertain"
  | "notDeleted"
  | "gone"
  | "deleted";
type Busy = "password" | "google" | "check";

const CONFIRM_AGAIN =
  "It's been a few minutes since you confirmed it's you. Confirm again to delete your account.";
const SERVICE_ASKS =
  "Forge's account service asks you to sign in again first. Confirm it's you, then delete.";
const NOT_SENT =
  "Forge couldn't use your sign-in to send the request, so nothing was sent and nothing changed. Confirm it's you again.";
const STILL_UNCONFIRMED =
  "Forge still couldn't confirm the deletion. Check your connection and try again.";
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "3 workouts, 2 templates and 1 journal entry". */
function holdings(s: ReturnType<typeof localSummary>) {
  const parts = [
    s.workouts && plural(s.workouts, "workout"),
    s.templates && plural(s.templates, "template"),
    s.journal && plural(s.journal, "journal entry", "journal entries"),
    s.customExercises && plural(s.customExercises, "custom exercise"),
  ].filter(Boolean) as string[];
  if (parts.length < 2) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * A different account came back from the sign-in (D4). Forge refused it,
 * ended only its new session, and changed nothing else; a Google sign-in may
 * have created that account just now, which Forge never deletes.
 */
function differentAccountText(
  e: ReauthError,
  email: string | undefined,
  google: boolean,
) {
  const mine = `Confirm with ${email ?? "the account you're signed in to"}.`;
  const chosen = e.other?.email ? ` (${e.other.email})` : "";
  return google
    ? `That's a different Google account${chosen}, so it can't confirm this deletion. Forge signed it out here and didn't change it or anything else. If it had no Forge account, choosing it may have created an empty one. ${mine}`
    : `That's a different account${chosen}. Forge signed it out here and didn't change it or anything else. ${mine}`;
}

/** Plain words for a failed confirmation (never the service's message). */
function reauthText(e: unknown, email?: string, google = false) {
  if (e instanceof ReauthError)
    return e.reason === "wrong_account"
      ? differentAccountText(e, email, google)
      : "Forge couldn't confirm it's you. Try again.";
  if (authErrorCode(e) === "invalid_credentials")
    return "That password isn't right. Try again.";
  return authErrorText(e, "Forge couldn't confirm it's you. Try again.");
}

export default function DeleteAccount() {
  const r = useRepo();
  const client = cloudClient();
  const { entry, signOut: endSession } = useEntry();
  const user = entry.kind === "ready" ? entry.user : undefined;
  const offline = entry.kind === "ready" && entry.offline;
  const social = useSocialOptions();
  /**
   * Where this phone's own records put the deletion now. The launch check
   * can settle it while this screen is open, so this is read again whenever
   * a check returns nothing new.
   */
  function recorded(): Step {
    if (!user) return "explain";
    // Already known to be gone (deleted elsewhere, or found at launch).
    const gone = deletedAccount(r);
    if (gone?.owner === user.id) return gone.localRemoved ? "deleted" : "gone";
    const marker = pendingDeletion(r);
    if (marker?.owner !== user.id) return "explain";
    if (marker.state === "requested") return "uncertain";
    if (marker.state === "notDeleted") return "notDeleted";
    return "explain";
  }
  const [step, setStep] = useState<Step>(recorded);
  const [exported, setExported] = useState<"saved" | "shared">();
  const actions = useBackupActions(setExported);
  const [password, setPassword] = useState("");
  const [confirmedAt, setConfirmedAt] = useState<number>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const running = useRef(false);

  const leave = () => goBack("/account");
  const owns = !!user && dataOwner(r) === user.id;
  const summary = localSummary(r);
  const held = holdings(summary);
  const unsynced = unsyncedLossText(summary.unsynced);
  const email = user?.email;
  const methods = user?.methods ?? [];
  const byPassword =
    !!email && (methods.includes("Email") || methods.length === 0);
  const byGoogle = methods.includes("Google") && social.google;

  function show(next: Step, text?: string) {
    setStep(next);
    setNote(text);
    setError(undefined);
  }

  /** What deleting needs from this phone: its sign-in and its reminders. */
  function deps(owner: string): DeletionDeps {
    return {
      ...cloudDeletion(client!, owner, tokenClient),
      signOut: async () => {
        if (endSession) await endSession({ deleted: true });
        else await client!.auth.signOut({ scope: "local" });
      },
      afterRemove: () => {
        void cancelAllNotifications().catch(() => {});
        useApp.getState().touch();
      },
    };
  }

  function settle(outcome: DeletionOutcome | undefined, quiet = false) {
    useApp.getState().touch();
    switch (outcome?.kind) {
      case "deleted":
        // Signed out now: the entry gate moves on to Welcome, which says so.
        return show("deleted");
      case "notDeleted":
        return show("notDeleted");
      case "reauthenticate":
        setConfirmedAt(undefined);
        return show("identity", SERVICE_ASKS);
      case "notSent":
        setConfirmedAt(undefined);
        return show("identity", NOT_SENT);
      case "accountGone":
        return show("gone");
      case "uncertain":
        return show("uncertain", quiet ? undefined : STILL_UNCONFIRMED);
      default:
        // Nothing new from this check (a launch check may have settled it).
        return show(recorded());
    }
  }

  async function guarded(kind: Busy | undefined, action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setError(undefined);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  /**
   * Something threw while deleting or checking: say only what this phone's
   * own records show. The engine marks a confirmed deletion before this
   * phone's part, and removes the training and records it in one step.
   */
  function failed(owner: string) {
    const marker = pendingDeletion(r);
    const gone = deletedAccount(r);
    useApp.getState().touch();
    // Confirmed: this phone's part finishes the next time Forge opens.
    if (marker?.state === "deleted") return show("deleted");
    if (gone?.owner === owner)
      return show(gone.localRemoved ? "deleted" : "gone");
    if (marker?.state === "requested") {
      setStep("uncertain");
      return setError(
        "Something went wrong before Forge could confirm the deletion. Nothing on this phone was removed.",
      );
    }
    setStep("final");
    setError("Forge couldn't send the request. Nothing changed. Try again.");
  }

  const confirmWithPassword = () =>
    void guarded("password", async () => {
      if (!client || !user) return;
      if (!password) return setError("Enter your password.");
      try {
        const verifier = verifierClient();
        if (!verifier) return;
        await reauthWithPassword(client, verifier, user, password);
        setPassword("");
        setConfirmedAt(Date.now());
        show("final");
      } catch (e) {
        setError(reauthText(e, email));
      }
    });

  const confirmWithGoogle = () =>
    void guarded("google", async () => {
      if (!client || !user) return;
      try {
        // Cancelled: nothing changes, and the athlete can try again. The
        // returned sign-in is checked by a client that stores nothing.
        const checker = verifierClient()?.auth;
        const result = await reauthWithGoogle(client, user, checker);
        if (result === "cancelled") return;
        setConfirmedAt(Date.now());
        show("final");
      } catch (e) {
        setError(
          e instanceof ReauthError
            ? reauthText(e, email, true)
            : socialErrorText("google", e),
        );
      }
    });

  const remove = () =>
    void guarded(undefined, async () => {
      if (!client || !user) return;
      if (
        confirmedAt === undefined ||
        Date.now() - confirmedAt > RECENT_SIGN_IN_MS
      ) {
        setConfirmedAt(undefined);
        return show("identity", CONFIRM_AGAIN);
      }
      show("working");
      try {
        settle(await deleteAccount(r, user.id, deps(user.id)), true);
      } catch {
        failed(user.id);
      }
    });

  const checkAgain = () =>
    void guarded("check", async () => {
      if (!client || !user) return;
      try {
        settle(await checkDeletion(r, user.id, deps(user.id)));
      } catch {
        failed(user.id);
      }
    });

  const keepAccount = () => {
    if (user) dismissDeletion(r, user.id);
    useApp.getState().touch();
    leave();
  };
  const tryAgain = () => {
    if (user) dismissDeletion(r, user.id);
    const fresh =
      confirmedAt !== undefined &&
      Date.now() - confirmedAt <= RECENT_SIGN_IN_MS;
    show(fresh ? "final" : "identity");
  };

  const finalConfirm = () =>
    confirm(
      "Delete your Forge account?",
      "This can't be undone. Your account and its cloud training are deleted, then the training on this phone is removed.",
      remove,
      { action: "Delete account" },
    );

  const offlineNote = offline ? (
    <EntryMessage text="You're offline. Deleting your account needs a connection." />
  ) : null;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  // Before anything is sent, only the owner of this phone's training gets
  // this far. Once a request is underway the sign-in and the training go
  // away as planned, so those steps don't depend on them.
  // Settled elsewhere while this screen was open (the launch check, or a
  // sync): an account known to be gone has nothing left to delete here.
  const known = !!user && deletedAccount(r)?.owner === user.id;
  const view: Step =
    known && step !== "deleted" && step !== "working" ? recorded() : step;
  const before = ["explain", "backup", "identity", "final"].includes(view);
  if (view === "deleted" || (view === "working" && !user)) {
    body =
      view === "deleted" ? (
        <ForgeCard gap={8} testID="delete-done">
          <FText variant="body">Your Forge account was deleted.</FText>
        </ForgeCard>
      ) : (
        <EntryBusy text="Deleting your account…" />
      );
  } else if (!client || !user) {
    body = (
      <ForgeCard gap={8} testID="delete-unavailable">
        <FText variant="body">Sign in to the account you want to delete.</FText>
      </ForgeCard>
    );
  } else if (!owns && before) {
    body = (
      <ForgeCard gap={8} testID="delete-not-owner">
        <FText variant="body">
          {
            "This phone's training belongs to a different account, so this account can't be deleted here."
          }
        </FText>
      </ForgeCard>
    );
    footer = <OutlineButton title="Back" onPress={leave} />;
  } else if (view === "explain") {
    body = (
      <>
        {offlineNote}
        <ForgeCard gap={8} testID="delete-cloud">
          <FText variant="overline" tone="error" header>
            In Forge&apos;s cloud
          </FText>
          <FText variant="body">
            {`${email ?? "This account"} and everything saved to it in Forge's cloud are deleted permanently: workouts, templates, journals and settings.`}
          </FText>
          <FText variant="label" tone="secondary">
            Signing up again with the same email creates a new, empty account.
            It can&apos;t bring this one back.
          </FText>
        </ForgeCard>
        <ForgeCard gap={8} testID="delete-phone">
          <FText variant="overline" tone="secondary" header>
            On this phone
          </FText>
          <FText variant="body">
            {held
              ? `This phone holds ${held}.`
              : "This phone holds no workouts, templates or journal entries."}
          </FText>
          {!!unsynced && (
            <FText variant="label" tone="error">
              {unsynced}
            </FText>
          )}
          <FText variant="label" tone="secondary">
            {
              "Once the deletion is confirmed, Forge removes this phone's training too, so no other account can open it. Nothing here is removed unless the deletion is confirmed."
            }
          </FText>
          <FText variant="label" tone="secondary">
            {
              "To keep a copy, export a backup next. A backup is a file, not your account: importing it later brings back only what's in the file."
            }
          </FText>
        </ForgeCard>
        <ForgeCard gap={8} testID="delete-devices">
          <FText variant="overline" tone="secondary" header>
            Other devices
          </FText>
          <FText variant="label" tone="secondary">
            {
              "Phones and tablets signed in to this account are signed out when their sign-in next renews. Their training stays locked to the deleted account, so export a backup on them first if they hold training this phone doesn't."
            }
          </FText>
        </ForgeCard>
        <FText variant="label" tone="secondary">
          {
            "Only want to clear this phone? Go back and use Delete all local data: your account and its cloud training stay."
          }
        </FText>
      </>
    );
    footer = (
      <>
        <CtaButton title="Continue" onPress={() => show("backup")} />
        <OutlineButton title="Keep my account" onPress={leave} />
      </>
    );
  } else if (view === "backup") {
    body = (
      <>
        <ForgeCard gap={8} testID="delete-backup">
          <FText variant="overline" tone="secondary" header>
            Export first
          </FText>
          <FText variant="body">
            Save this phone&apos;s training to a file before it&apos;s removed.
          </FText>
          <FText variant="label" tone="secondary">
            {`${backupState(r).text}.`}
          </FText>
        </ForgeCard>
        <BackupChoices actions={actions} />
        <EntryMessage
          text={
            exported === "saved"
              ? "Backup saved and checked."
              : exported === "shared"
                ? "You shared a copy. Forge can't confirm it was saved: check it arrived before you continue."
                : undefined
          }
          tone={exported === "saved" ? "positive" : "secondary"}
        />
      </>
    );
    footer = (
      <>
        {exported ? (
          <CtaButton title="Continue" onPress={() => show("identity")} />
        ) : (
          <OutlineButton
            title="Continue without a backup"
            disabled={!!actions.busy}
            onPress={() => show("identity")}
          />
        )}
        <OutlineButton
          title="Keep my account"
          disabled={!!actions.busy}
          onPress={leave}
        />
      </>
    );
  } else if (view === "identity") {
    body = (
      <>
        {offlineNote}
        <ForgeCard gap={12} testID="delete-identity">
          <FText variant="overline" tone="secondary" header>
            Confirm it&apos;s you
          </FText>
          <FText variant="body">
            {`Sign in to ${email ?? "this account"} again to delete it.`}
          </FText>
          {byPassword && (
            <>
              <PasswordField
                label="Password"
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={confirmWithPassword}
              />
              <CtaButton
                title={
                  busy === "password" ? "Confirming…" : "Confirm with password"
                }
                compact
                disabled={!!busy}
                onPress={confirmWithPassword}
              />
            </>
          )}
          {byGoogle && (
            <>
              {byPassword && (
                <FText variant="label" tone="secondary">
                  Or confirm with Google.
                </FText>
              )}
              <FText variant="label" tone="secondary">
                {`In Google's sheet, choose ${email ?? "this account"}. A different Google account can't confirm this deletion.`}
              </FText>
              <GoogleButton disabled={!!busy} onPress={confirmWithGoogle} />
            </>
          )}
          {!byPassword && !byGoogle && (
            <FText variant="label" tone="secondary">
              {methods.includes("Google")
                ? "Confirming with Google isn't available in this copy of Forge right now, so the account can't be deleted here yet."
                : "This account signs in a way Forge can't confirm here yet, so it can't be deleted in this version of Forge."}
            </FText>
          )}
        </ForgeCard>
        <EntryMessage text={note} />
        <EntryMessage text={error} tone="error" />
      </>
    );
    footer = (
      <OutlineButton
        title="Keep my account"
        disabled={!!busy}
        onPress={leave}
      />
    );
  } else if (view === "final" || view === "working") {
    const working = view === "working";
    body = (
      <>
        {offlineNote}
        <ForgeCard gap={10} testID="delete-final">
          <FText variant="overline" tone="error" header>
            Permanent
          </FText>
          <FText variant="cardTitle" weight="700">
            {`Delete ${email ?? "this account"}?`}
          </FText>
          <FText variant="body">
            Your account and its cloud training are deleted for good.
          </FText>
          <FText variant="body">
            {held
              ? `Then everything on this phone is removed: ${held}, with your profile and preferences.`
              : "Then this phone's profile and preferences are removed."}
          </FText>
          {!!unsynced && (
            <FText variant="label" tone="error">
              {unsynced}
            </FText>
          )}
          <FText variant="label" tone="secondary">
            {exported === "saved"
              ? "You saved a backup, and Forge checked it."
              : exported === "shared"
                ? "You shared a backup; Forge couldn't confirm it was saved."
                : "You haven't exported a backup."}
          </FText>
        </ForgeCard>
        <ForgeCard padding={0} gap={0}>
          <DangerRow
            title="Delete my Forge account"
            description="Permanently deletes your account, its cloud training and this phone's training."
            disabled={working || offline}
            onPress={finalConfirm}
          />
        </ForgeCard>
        {working && <EntryBusy text="Deleting your account…" />}
        {working && (
          <FText variant="label" tone="secondary">
            Keep Forge open. If it closes, Forge checks what happened the next
            time it opens.
          </FText>
        )}
        <EntryMessage text={error} tone="error" />
      </>
    );
    footer = (
      <OutlineButton
        title="Keep my account"
        disabled={working}
        onPress={leave}
      />
    );
  } else if (view === "uncertain") {
    body = (
      <>
        {offlineNote}
        <ForgeCard gap={10} testID="delete-uncertain">
          <FText variant="cardTitle" weight="700" header>
            Forge couldn&apos;t confirm the deletion
          </FText>
          <FText variant="body">
            {
              "Your request may or may not have reached Forge's account service. Nothing on this phone was removed."
            }
          </FText>
          <FText variant="label" tone="secondary">
            {
              "Check again when you're connected. If the account was deleted, Forge then removes this phone's training, as you confirmed. If you've added training since, export a backup first."
            }
          </FText>
          {!!unsynced && (
            <FText variant="label" tone="error">
              {unsynced}
            </FText>
          )}
        </ForgeCard>
        <BackupChoices actions={actions} />
        <EntryMessage text={note} />
        <EntryMessage text={error} tone="error" />
      </>
    );
    footer = (
      <>
        <CtaButton
          title={busy === "check" ? "Checking…" : "Check again"}
          disabled={!!busy || !!actions.busy}
          onPress={checkAgain}
        />
        <OutlineButton
          title="Back to Account & privacy"
          disabled={!!busy}
          onPress={leave}
        />
      </>
    );
  } else if (view === "gone") {
    body = (
      <>
        <ForgeCard gap={10} testID="delete-gone">
          <FText variant="cardTitle" weight="700" header>
            This Forge account no longer exists
          </FText>
          <FText variant="body">{ACCOUNT_GONE_HERE}</FText>
          {!!unsynced && (
            <FText variant="label" tone="error">
              {unsynced}
            </FText>
          )}
          <FText variant="label" tone="secondary">
            {
              "After exporting, remove it with Delete all local data in Account & privacy."
            }
          </FText>
        </ForgeCard>
        <BackupChoices actions={actions} />
        <EntryMessage
          text={
            exported === "saved"
              ? "Backup saved and checked."
              : exported === "shared"
                ? "You shared a copy. Forge can't confirm it was saved."
                : undefined
          }
          tone={exported === "saved" ? "positive" : "secondary"}
        />
      </>
    );
    footer = (
      <OutlineButton
        title="Back to Account & privacy"
        disabled={!!actions.busy}
        onPress={leave}
      />
    );
  } else {
    body = (
      <ForgeCard gap={10} testID="delete-not-deleted">
        <FText variant="cardTitle" weight="700" header>
          Your account wasn&apos;t deleted
        </FText>
        <FText variant="body">{DELETION_DIDNT_HAPPEN}</FText>
      </ForgeCard>
    );
    footer = (
      <>
        <CtaButton title="Keep my account" onPress={keepAccount} />
        <OutlineButton title="Try again" onPress={tryAgain} />
      </>
    );
  }

  return (
    <ForgeSubScreen
      title="Delete Forge account"
      eyebrow="Account & privacy"
      onBack={() => {
        if (step !== "working") leave();
      }}
      footer={footer}
    >
      {body}
    </ForgeSubScreen>
  );
}
