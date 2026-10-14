import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryTokens } from "../src/cloud/recovery";
test("recovery callback parses tokens only for the application account route", () => {
  assert.deepEqual(
    recoveryTokens(
      "forge://account#type=recovery&access_token=access&refresh_token=refresh",
    ),
    { access_token: "access", refresh_token: "refresh" },
  );
  assert.equal(
    recoveryTokens(
      "https://attacker.example/account#type=recovery&access_token=a&refresh_token=r",
    ),
    null,
  );
  assert.equal(
    recoveryTokens(
      "forge://account#type=signup&access_token=a&refresh_token=r",
    ),
    null,
  );
  assert.equal(
    recoveryTokens("forge://account#type=recovery&access_token=a"),
    null,
  );
});
test("Expo Go recovery route supports development callback without logging tokens", () => {
  assert.deepEqual(
    recoveryTokens(
      "exp://192.168.0.2:8081/--/account#type=recovery&access_token=a&refresh_token=r",
    ),
    { access_token: "a", refresh_token: "r" },
  );
});
