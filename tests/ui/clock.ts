// Pins "now" so date-dependent screens (calendars, "Yesterday") behave the
// same whatever day the tests run. Only Date is faked; rendering timers stay
// real. Undo with jest.useRealTimers() when the test ends.
export function pinClock(at: string) {
  jest.useFakeTimers({
    now: new Date(at),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
}
