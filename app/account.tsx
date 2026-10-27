import React, { useEffect, useState } from "react";
import { Alert } from "../src/platform/alert";
import * as Linking from "expo-linking";
import { recoveryTokens } from "../src/cloud/recovery";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  SegmentedControl,
} from "../src/components/ui";
import { goBack } from "../src/navigation";
import { useRepo, useApp, confirm } from "../src/state";
import { cloudClient, transport } from "../src/cloud/client";
import { synchronize } from "../src/cloud/sync";
import {
  AboutForge,
  DataPrivacy,
  MembershipCard,
} from "../src/screens/you/account";
const MODES = [
  { value: "Login", label: "Sign in" },
  { value: "Register", label: "Create account" },
  { value: "Reset password", label: "Reset password" },
];

// Account & privacy: account and sync, then (Phase 7.5D) membership, data
// and privacy, and About, moved here from the You tab unchanged. The auth,
// sync and conflict handling below is protected and unchanged; this screen's
// redesign is Phase 7.5G.
export default function Account() {
  const r = useRepo();
  const client = cloudClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ id: string; email?: string }>();
  const [mode, setMode] = useState("Login");
  const [recovery, setRecovery] = useState(false);
  const incoming = Linking.useURL();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setStatus(error.message);
      else setUser(data.session?.user);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!client || !incoming) return;
    const tokens = recoveryTokens(incoming);
    if (!tokens) return;
    let active = true;
    void client.auth.setSession(tokens).then(({ error }) => {
      if (!active) return;
      if (error) setStatus(error.message);
      else {
        setRecovery(true);
        setStatus("Recovery session verified. Enter a new password below.");
      }
    });
    return () => {
      active = false;
    };
  }, [client, incoming]);
  async function updatePassword() {
    if (!client) return;
    setBusy(true);
    try {
      if (password.length < 8) throw new Error("Use at least 8 characters");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setRecovery(false);
      setStatus("Password updated.");
      router.replace("/account");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Password update failed");
    } finally {
      setBusy(false);
    }
  }
  async function auth() {
    if (!client) return;
    setBusy(true);
    try {
      if (!email.trim() || (!password && mode !== "Reset password"))
        throw new Error("Enter your email and password");
      const result =
        mode === "Register"
          ? await client.auth.signUp({ email: email.trim(), password })
          : mode === "Reset password"
            ? await client.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: Linking.createURL("/account"),
              })
            : await client.auth.signInWithPassword({
                email: email.trim(),
                password,
              });
      if (result.error) throw result.error;
      setPassword("");
      setStatus(
        mode === "Register"
          ? "Registration submitted. Check email if confirmation is enabled."
          : mode === "Reset password"
            ? "Password-reset email requested. Use the secure link to set a new password."
            : "Signed in. Synchronization remains opt-in.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!client || !user) return;
    setBusy(true);
    try {
      const result = await synchronize(r, transport(client, user.id), user.id);
      useApp.getState().touch();
      setStatus(
        `${result.uploaded} uploaded · ${result.downloaded} downloaded · ${result.pending} pending · ${result.conflicts} conflicts${result.errors.length ? "\n" + result.errors.join("\n") : ""}`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Account & privacy" onBack={() => goBack("/(tabs)/profile")}>
      {!client ? (
        <Card>
          <Txt variant="headline" header>
            Guest mode is active
          </Txt>
          <Txt tone="secondary">
            Cloud accounts aren&apos;t available in this version, so your
            training data stays on this phone. Export a backup regularly from
            Data &amp; privacy below and keep the file somewhere safe.
          </Txt>
        </Card>
      ) : user ? (
        <Card>
          <Txt variant="headline" header>
            {user.email ?? "Signed-in account"}
          </Txt>
          {recovery && (
            <>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Button
                title="Set new password"
                disabled={busy}
                onPress={() => void updatePassword()}
              />
            </>
          )}
          <Txt tone="secondary">
            Sync sends your local training and lifestyle data to your configured
            Supabase project. It runs only when requested. Export a backup
            before your first sync.
          </Txt>
          <Button
            title={busy ? "Working…" : "Synchronize now"}
            disabled={busy}
            onPress={() => void sync()}
          />
          <Button
            title="Log out"
            secondary
            disabled={busy}
            onPress={() => {
              void client.auth.signOut().then(({ error }) => {
                if (error) setStatus(error.message);
                else
                  setStatus(
                    "Signed out. Your local records remain on this device.",
                  );
              });
            }}
          />
          <Button
            title="Delete cloud account"
            danger
            disabled={busy}
            onPress={() =>
              confirm(
                "Delete account permanently?",
                "This permanently deletes your account and every cloud record. It can't be undone. Records on this phone stay until you delete them in You.",
                () => {
                  void client
                    .rpc("forge_delete_account")
                    .then(async ({ error }) => {
                      if (error) {
                        Alert.alert("Account deletion failed", error.message);
                        return;
                      }
                      await client.auth.signOut({ scope: "local" });
                      r.setSetting("cloudAccountDeleted", "true");
                      setStatus(
                        "Cloud account deleted. Export then clear local data before using a different account.",
                      );
                    });
                },
                { action: "Delete account" },
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <SegmentedControl
            label="Account action"
            options={MODES}
            value={mode}
            onChange={setMode}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          {mode !== "Reset password" && (
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          )}
          <Button
            title={
              busy
                ? "Working…"
                : (MODES.find((m) => m.value === mode)?.label ?? mode)
            }
            disabled={busy}
            onPress={() => void auth()}
          />
        </Card>
      )}
      {status && (
        <Card>
          <Txt>{status}</Txt>
        </Card>
      )}
      {r.conflicts().map((c) => (
        <Card key={c.id}>
          <Txt variant="headline" header>
            Sync conflict
          </Txt>
          <Txt variant="caption" tone="secondary">
            {`Record ${c.id}`}
          </Txt>
          <Txt tone="secondary">
            The cloud record changed since this device last synchronized. Your
            local record remains intact. Keeping local explicitly replaces the
            cloud version on the next sync. Export a backup first.
          </Txt>
          <Button
            title="Keep local version"
            secondary
            onPress={() =>
              confirm(
                "Keep local version?",
                "This authorizes replacing the currently conflicting cloud version on your next sync.",
                () => r.keepLocal(c.id),
                { action: "Keep local version", destructive: false },
              )
            }
          />
          <Button
            title="Use cloud version"
            secondary
            onPress={() =>
              confirm(
                "Use cloud version?",
                "Export first. This replaces the local record with the preserved cloud version.",
                () => {
                  const row = JSON.parse(
                    c.remote,
                  ) as import("../src/cloud/sync").CloudRecord;
                  r.transaction(() => {
                    r.applyRemote(
                      row.id,
                      row.kind,
                      row.payload,
                      row.revision,
                      row.deleted,
                    );
                    r.db.run("DELETE FROM outbox WHERE id=?", [row.id]);
                    r.db.run("DELETE FROM conflicts WHERE id=?", [row.id]);
                  });
                  useApp.getState().touch();
                },
                { action: "Replace with cloud version" },
              )
            }
          />
        </Card>
      ))}
      <MembershipCard />
      <DataPrivacy />
      <AboutForge />
    </Screen>
  );
}
