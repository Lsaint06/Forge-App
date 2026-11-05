import { useRef, useState } from "react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { defaults, type Profile } from "../../domain/types";
import { profileSchema } from "../../domain/validation";
import { programKey } from "../../domain/programs/model";
import {
  ARRIVAL_KEY,
  ONBOARDING_KEY,
  readProgress,
  revealFor,
  writeArrival,
  writeProgress,
  type Progress,
} from "../../domain/onboarding/journey";
import { programLibrary } from "../../programs";
import { mutate, useApp, useRepo } from "../../state";

// Where first-time setup keeps what the athlete enters (Phase 9.2): the
// profile itself (each value saved the moment it is valid, as setup always
// has) and the onboarding record in local settings. The development preview
// keeps the same things in memory and saves nothing.

export type OnboardingStore = {
  profile: Profile;
  progress: Progress;
  /** Saves values as typed or chosen; false when the profile refuses them. */
  saveProfile: (values: Partial<Profile>) => boolean;
  saveProgress: (progress: Progress) => void;
  /** Setup is done: Forge opens (the preview closes). */
  finish: () => void;
  /** The development preview: nothing is saved. */
  preview?: boolean;
};

/** A light tick for a choice, as everywhere else in Forge. */
export const tick = () => void Haptics.selectionAsync().catch(() => {});

/** A step that can't continue yet. */
export const warn = () => {
  try {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
  } catch {
    // No haptics here: the message on screen says it.
  }
};

/** First-time setup on this phone's profile. */
export function useRepositoryStore(): OnboardingStore {
  const r = useRepo();
  const touch = () => useApp.getState().touch();
  return {
    profile: r.profile(),
    progress: readProgress(r.setting(ONBOARDING_KEY)),
    saveProfile: (values) => {
      try {
        r.saveProfile(values);
        touch();
        return true;
      } catch {
        // Refused (out of range): the field says why; nothing changes.
        return false;
      }
    },
    saveProgress: (progress) => {
      try {
        r.setSetting(ONBOARDING_KEY, writeProgress(progress));
      } catch {
        // Kept on screen; a restart resumes from the profile's answers.
      }
    },
    finish: () => {
      const done = mutate(() =>
        r.transaction(() => {
          // The Forge Path just shown, for Home to remember (nothing starts).
          const shown = revealFor(
            r.profile(),
            readProgress(r.setting(ONBOARDING_KEY)),
            programLibrary,
          );
          r.saveProfile({ onboarded: true });
          r.clearSetting(ONBOARDING_KEY);
          if (shown)
            r.setSetting(ARRIVAL_KEY, writeArrival(programKey(shown.program)));
          return true;
        }),
      );
      if (done) router.replace("/(tabs)");
    },
  };
}

/** The development preview: a new athlete's setup, kept in memory only. */
export function usePreviewStore(onFinish: () => void): OnboardingStore {
  const [state, setState] = useState<{ profile: Profile; progress: Progress }>(
    () => ({ profile: { ...defaults }, progress: { stage: "about" } }),
  );
  const latest = useRef(state.profile);
  return {
    preview: true,
    profile: state.profile,
    progress: state.progress,
    saveProfile: (values) => {
      const parsed = profileSchema.safeParse({ ...latest.current, ...values });
      if (!parsed.success) return false;
      latest.current = parsed.data as Profile;
      setState((s) => ({ ...s, profile: latest.current }));
      return true;
    },
    saveProgress: (progress) => setState((s) => ({ ...s, progress })),
    finish: onFinish,
  };
}
