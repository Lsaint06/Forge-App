import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nativeStackStatusBarStyle,
  statusBarStyleFor,
} from "../src/domain/presentation/status-bar";

// Phase 8.4C-1: the status bar follows Forge's theme, not the phone's, and
// only Forge's own iOS builds have the native stack state it.

test("icons follow Forge's background; the intro is always light", () => {
  assert.equal(
    statusBarStyleFor({ darkBackground: true, intro: false }),
    "light",
  );
  assert.equal(
    statusBarStyleFor({ darkBackground: false, intro: false }),
    "dark",
  );
  assert.equal(
    statusBarStyleFor({ darkBackground: true, intro: true }),
    "light",
  );
  assert.equal(
    statusBarStyleFor({ darkBackground: false, intro: true }),
    "light",
  );
});

test("only Forge's own iOS builds have the native stack state the style", () => {
  for (const style of ["light", "dark"] as const) {
    assert.equal(
      nativeStackStatusBarStyle(style, { platform: "ios", expoGo: false }),
      style,
    );
    // Expo Go keeps UIViewControllerBasedStatusBarAppearance off.
    assert.equal(
      nativeStackStatusBarStyle(style, { platform: "ios", expoGo: true }),
      undefined,
    );
    for (const platform of ["android", "web"])
      for (const expoGo of [false, true])
        assert.equal(
          nativeStackStatusBarStyle(style, { platform, expoGo }),
          undefined,
          `${platform} ${expoGo}`,
        );
  }
});
