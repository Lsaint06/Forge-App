import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initializeRepository, repository } from "../src/data/native";
import {
  commitPending,
  reconcilePendingDeletes,
  remainingMs,
} from "../src/data/pending-deletes";
import { useApp, useRepo } from "../src/state";
import { AppStack } from "../src/auth/AppStack";
import { entryState, type AuthUser } from "../src/auth/entry";
import {
  continuation,
  continuedWorkout,
  endContinuation,
  noteSessionEnded,
  sessionEnded,
} from "../src/auth/continuation";
import { EntryContext, authClient, useAuthSession } from "../src/auth/session";
import { tokenClient } from "../src/cloud/client";
import {
  claimIfEmpty,
  dataOwner,
  hasLocalData,
  hasSyncHistory,
  recordOwnerHint,
} from "../src/data/ownership";
import {
  acknowledgeDeletedAccount,
  cloudDeletion,
  deletedAccount,
  pendingDeletion,
  resumeDeletion,
} from "../src/auth/account-deletion";
import {
  WORKOUT_CONTINUES_TEXT,
  WORKOUT_FINISHED_SIGNED_OUT_TEXT,
  welcomeDeletionText,
} from "../src/domain/presentation/account";
import { cancelAllNotifications } from "../src/notifications";
import { Loading, dark, useColors } from "../src/components/ui";
import * as SplashScreen from "expo-splash-screen";
import { ForgeSplash } from "../src/components/splash/ForgeSplash";
import { ErrorBoundary } from "../src/components/Recovery";
import { loadBrandFonts } from "../src/fonts";
import {
  finishIntro,
  introPending,
  onIntroReplay,
} from "../src/components/splash/session";

// The native launch screen is cosmetic: failures in its module must never
// block startup.
function nativeSplash(action: () => Promise<unknown>) {
  try {
    void action().catch(() => {});
  } catch {
    // Ignore: the in-app intro and app still render.
  }
}
// Keep the native launch screen up until the first in-app frame is ready.
nativeSplash(() => SplashScreen.preventAutoHideAsync());
// REFORGE display face: loads in parallel and never delays startup.
loadBrandFonts();
// Only the entry state's kind changes the routes; the root stack doesn't
// re-render for ordinary data changes.
const Routes = React.memo(AppStack);
function Navigation() {
  const c = useColors();
  const [{ client, misconfigured }] = useState(authClient);
  const auth = useAuthSession(client);
  const r = useRepo();
  // This phone's data is only consulted once someone is signed in.
  const user = auth.session ?? auth.offline;
  // Signed out without asking, mid-workout (Phase 7.8E, Stage 4): the
  // account whose sign-in just ended, or, after a restart, the one a recent
  // marker names for the same workout still in progress.
  const restored = auth.session !== undefined;
  const marker = !user && restored && !auth.ended ? continuation(r) : undefined;
  const ended: AuthUser | undefined = user
    ? undefined
    : (auth.ended ?? (marker ? { id: marker.owner } : undefined));
  const owner = user || ended ? dataOwner(r) : undefined;
  const continued = ended ? continuedWorkout(r, ended.id) : undefined;
  const entry = entryState({
    configured: !!client,
    misconfigured,
    session: auth.session,
    offline: auth.offline,
    recovering: auth.recovering,
    owner,
    hasLocalData: user ? hasLocalData(r) : false,
    syncHistory: user && owner && owner !== user.id ? hasSyncHistory(r) : false,
    onboarded: user ? r.profile().onboarded : false,
    ended,
    continued: !!continued,
  });
  // Recorded for a restart while it lasts; any sign-in ends it.
  const endedId = auth.ended?.id;
  useEffect(() => {
    if (!endedId) return;
    try {
      noteSessionEnded(repository(), endedId);
    } catch {
      // Without the marker the workout still continues until Forge closes.
    }
  }, [endedId]);
  const anyoneSignedIn = !!user;
  useEffect(() => {
    if (!anyoneSignedIn) return;
    try {
      endContinuation(repository());
    } catch {
      // A stale marker opens nothing: it must match the workout in progress.
    }
  }, [anyoneSignedIn]);
  // After a continuation, signed out: that account's workout is still saved
  // here. Only with a marker naming this phone's owner and a workout still on
  // it: never on a new phone, after a deletion, or once it was discarded.
  const lastEnded = entry.kind === "signedOut" ? sessionEnded(r) : undefined;
  const continuationNotice =
    entry.kind === "continuing"
      ? {
          text:
            continued === "active"
              ? WORKOUT_CONTINUES_TEXT
              : WORKOUT_FINISHED_SIGNED_OUT_TEXT,
          canReturn: continued === "active",
        }
      : lastEnded &&
          lastEnded.owner === dataOwner(r) &&
          r.workout(lastEnded.workout)
        ? { text: WORKOUT_FINISHED_SIGNED_OUT_TEXT, canReturn: false }
        : undefined;
  // Setup on an empty phone: what the athlete enters is theirs from the
  // start. Also replaces a claim with nothing behind it (P4).
  const claim =
    entry.kind === "setup" && owner !== entry.user.id
      ? entry.user.id
      : undefined;
  useEffect(() => {
    if (!claim) return;
    try {
      if (claimIfEmpty(repository(), claim)) useApp.getState().touch();
    } catch {
      // Left unclaimed: the athlete is asked to link it after setup.
    }
  }, [claim]);
  // While the owner is signed in, remember how to describe them (masked) for
  // the conflict screen. Words only, never authorization (P2).
  const ownerSignedIn = user && owner === user.id ? user : undefined;
  const hintKey = ownerSignedIn
    ? `${ownerSignedIn.id}|${ownerSignedIn.email ?? ""}|${(ownerSignedIn.methods ?? []).join(",")}`
    : undefined;
  useEffect(() => {
    if (!hintKey || !ownerSignedIn) return;
    try {
      recordOwnerHint(repository(), ownerSignedIn);
    } catch {
      // A missing hint only means neutral wording on the conflict screen.
    }
    // The key holds everything the hint is made from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);
  // An account deletion this phone started (Phase 7.8E, Stage 2), settled
  // when the sign-in is known at launch and whenever it changes: a confirmed
  // deletion is finished without a connection; an unconfirmed one is checked
  // only while its own account is signed in online, and if it turns out the
  // account is gone, this phone's training is kept for the athlete to
  // export (src/auth/account-deletion). Never mid-session, so it can't race
  // the Delete Forge account screen's own request or check.
  const signedIn =
    auth.session === undefined ? undefined : (auth.session?.id ?? "");
  const endSession = auth.signOut;
  useEffect(() => {
    if (signedIn === undefined || !client) return;
    let owner: string | undefined;
    try {
      owner = pendingDeletion(repository())?.owner;
    } catch {
      return;
    }
    if (!owner) return;
    void resumeDeletion(repository(), signedIn || undefined, {
      ...cloudDeletion(client, owner, tokenClient),
      signOut: () => endSession({ deleted: true }),
      afterRemove: () => void cancelAllNotifications().catch(() => {}),
    })
      .then((outcome) => {
        if (outcome) useApp.getState().touch();
      })
      // Left as it is: the next launch tries again.
      .catch(() => {});
  }, [signedIn, client, endSession]);
  // Someone signed in after this phone's account was deleted: Welcome's
  // notice about it has done its job.
  useEffect(() => {
    if (!signedIn) return;
    try {
      acknowledgeDeletedAccount(repository());
    } catch {
      // The notice simply stays until the next sign-in.
    }
  }, [signedIn]);
  // Signed out, Welcome says what this phone knows about a deletion: never
  // training, only that the account (or its deletion) exists.
  const deletion =
    entry.kind === "signedOut"
      ? welcomeDeletionText({
          marker: pendingDeletion(r),
          deleted: deletedAccount(r),
        })
      : undefined;
  if (entry.kind === "initializing") return <Loading />;
  return (
    <EntryContext.Provider
      value={{
        entry,
        client,
        finishRecovery: auth.finishRecovery,
        signOut: auth.signOut,
        notice: auth.notice,
        deletion,
        continuation: continuationNotice,
        link: auth.link,
      }}
    >
      <StatusBar style={c.background === dark.background ? "light" : "dark"} />
      <Routes entry={entry.kind} />
    </EntryContext.Provider>
  );
}
function Ready() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();
  // Plays once per JavaScript runtime (a genuine cold start in production).
  const [intro, setIntro] = useState(introPending);
  useEffect(() => onIntroReplay(() => setIntro(true)), []);
  useEffect(() => {
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void initializeRepository()
      .then(() => {
        if (!mounted) return;
        // Deletions interrupted by FORGE closing (D15): expired ones are
        // completed now; the rest at their original deadline. Only at a cold
        // start, so returning from the background never cuts a window short.
        try {
          for (const m of reconcilePendingDeletes(repository()))
            timers.push(
              setTimeout(() => {
                try {
                  if (commitPending(repository(), m.kind, m.id) !== "none")
                    useApp.getState().touch();
                } catch {
                  // The marker stays; the next launch completes it.
                }
              }, remainingMs(m)),
            );
        } catch {
          // Never blocks starting FORGE; markers are retried next launch.
        }
        useApp.getState().touch();
        setReady(true);
      })
      .catch((e) => {
        if (!mounted) return;
        // Recovery must not replay the intro over the error screen.
        finishIntro();
        setError(e instanceof Error ? e : new Error("Database startup failed"));
      });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && mounted) {
        void initializeRepository()
          .then(() => {
            if (mounted) useApp.getState().touch();
          })
          .catch((e) => {
            if (mounted) setError(e);
          });
      }
    });
    return () => {
      mounted = false;
      sub.remove();
      timers.forEach(clearTimeout);
    };
  }, []);
  if (error) throw error;
  return (
    <>
      {ready ? <Navigation /> : <Loading />}
      {intro && (
        <ForgeSplash
          ready={ready}
          onFinish={() => {
            finishIntro();
            setIntro(false);
          }}
        />
      )}
    </>
  );
}
export default function Root() {
  const c = useColors();
  // The in-app intro's first frame matches the native launch screen, so the
  // native splash can hide as soon as the root has committed.
  useEffect(() => {
    nativeSplash(() => SplashScreen.hideAsync());
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <Ready />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
