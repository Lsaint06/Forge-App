// Cold-start tracking for the cinematic intro.
//
// Module state lives exactly as long as the JavaScript runtime. A production
// cold start creates a new runtime, so the intro is eligible again; resuming
// from the background, navigation, re-renders and remounts of the root layout
// keep the same runtime, so it does not replay. There is deliberately no
// persisted "seen" flag: every genuine new app process may play it.
let finished = false;
const listeners = new Set<() => void>();

export function introPending() {
  return !finished;
}
export function finishIntro() {
  finished = true;
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
