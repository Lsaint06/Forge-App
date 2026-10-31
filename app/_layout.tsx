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
import { entryState } from "../src/auth/entry";
import { EntryContext, authClient, useAuthSession } from "../src/auth/session";
import {
  claimIfEmpty,
  dataOwner,
  hasLocalData,
  hasSyncHistory,
  recordOwnerHint,
} from "../src/data/ownership";
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
  const owner = user ? dataOwner(r) : undefined;
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
  });
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
  if (entry.kind === "initializing") return <Loading />;
  return (
    <EntryContext.Provider
      value={{
        entry,
        client,
        finishRecovery: auth.finishRecovery,
        signOut: auth.signOut,
        notice: auth.notice,
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
