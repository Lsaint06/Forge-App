import React, { useState } from "react";
import Welcome from "../entry/Welcome";
import { useRepo } from "../../state";
import { useEntry } from "../../auth/session";
import { authLinkStatus } from "../../auth/links";
import { dataOwner, hasLocalData, hasSyncHistory } from "../../data/ownership";
import { INTRO_KEY, introDue } from "../../domain/onboarding/journey";
import { Intro } from "./Intro";
import { Entrance } from "./motion";

// The /welcome route (Phase 9.2). On a fresh phone, the brand intro and
// Discover Forge come first; leaving them by any way leads to Welcome, the
// account screen (unchanged), and is remembered on this phone so a restart
// goes straight there. Established phones, and anything Welcome must say (a
// sign-out, a deletion, a workout to return to, an email link), skip the
// intro, as before.
export default function WelcomeRoute() {
  const r = useRepo();
  const { entry, notice, deletion, continuation, link } = useEntry();
  const message = !!(
    notice ||
    deletion ||
    continuation ||
    authLinkStatus(link)
  );
  const [intro, setIntro] = useState(() => {
    try {
      return introDue({
        signedOut: entry.kind === "signedOut",
        owner: dataOwner(r),
        hasLocalData: hasLocalData(r),
        syncHistory: hasSyncHistory(r),
        seen: !!r.setting(INTRO_KEY),
        message,
      });
    } catch {
      return false;
    }
  });
  const [fromIntro, setFromIntro] = useState(false);
  // Once Welcome has had something to say, the intro stays away for this
  // visit, even after the message is gone.
  if (intro && message) setIntro(false);
  function leave() {
    try {
      r.setSetting(INTRO_KEY, "seen");
    } catch {
      // Not remembered: the intro may show once more after a restart.
    }
    setIntro(false);
    setFromIntro(true);
  }
  if (intro && entry.kind === "signedOut") return <Intro onAccount={leave} />;
  return fromIntro ? (
    <Entrance distance={16} style={{ flex: 1 }}>
      <Welcome />
    </Entrance>
  ) : (
    <Welcome />
  );
}
