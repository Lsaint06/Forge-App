// Cold-start tracking for the cinematic intro.
//
// Module state lives exactly as long as the JavaScript runtime. A production
// cold start creates a new runtime, so the intro is eligible again; resuming
// from the background, navigation, re-renders and remounts of the root layout
// keep the same runtime, so it does not replay. There is deliberately no
// persisted "seen" flag: every genuine new app process may play it.
let finished = false;
const listeners = new Set<() => void>();
const finishers = new Set<() => void>();

export function introPending() {
  return !finished;
}
export function finishIntro() {
  finished = true;
  finishers.forEach((listener) => listener());
}

/**
 * Runs `listener` each time the intro finishes (it has faded out), so a
 * screen underneath can begin its own motion only once it is seen. Phase
 * 9.2's brand welcome continues from the intro's last frame this way.
 */
export function onIntroFinished(listener: () => void) {
  finishers.add(listener);
  return () => {
    finishers.delete(listener);
  };
}

// Development-only replay for visual testing. Production builds ignore it.
export function replayIntro() {
  if (!__DEV__) return;
  finished = false;
  listeners.forEach((listener) => listener());
}
export function onIntroReplay(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
