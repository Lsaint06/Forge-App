import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../src/platform/alert";
import * as Linking from "expo-linking";
import { recoveryTokens } from "../src/cloud/recovery";
import { signInMethods } from "../src/auth/methods";
import { authErrorText, useEntry } from "../src/auth/session";
import { router } from "expo-router";
import { useColors } from "../src/components/ui";
import {
  CtaButton,
  FText,
  ForgeCard,
  ForgeField,
  ForgeSegments,
  ForgeSubScreen,
  OutlineButton,
  SectionLabel,
} from "../src/components/reforge";
import { goBack } from "../src/navigation";
import { useRepo, useApp, confirm } from "../src/state";
import { cloudClient, transport } from "../src/cloud/client";
import { synchronize } from "../src/cloud/sync";
import {
  AboutForge,
  DangerRow,
  DataPrivacy,
  DeleteLocalData,
  MembershipCard,
} from "../src/screens/you/account";
import { conflictTitle, pendingText } from "../src/domain/presentation/account";
import { forge } from "../src/theme";
const MODES = [
  { value: "Login", label: "Sign in" },
  { value: "Register", label: "Create account" },
  { value: "Reset password", label: "Reset password" },
];

// Account & privacy (REFORGE since Phase 7.5G.3): the account, cloud sync,
// data and privacy, membership, About and, apart from everything else, the
// two irreversible deletions. Presentation only: the auth, sync, conflict,
// backup and deletion handling is protected and unchanged. States shown are
// only those the app can verify; an empty outbox is never called "backed up".
export default function Account() {
  const r = useRepo();
  const client = cloudClient();
  // Signed in, from the entry gate: right from the first frame, and while
  // offline on the stored session (Phase 7.7C). Supabase's own lookup below
  // only fills in when the screen is shown outside the gate.
  const { entry, signOut: endSession } = useEntry();
  const entryUser = entry.kind === "ready" ? entry.user : undefined;
  const offline = entry.kind === "ready" && entry.offline;
  const hasEntryUser = !!entryUser;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{
    id: string;
    email?: string;
    app_metadata?: { provider?: unknown; providers?: unknown };
  }>();
  const [mode, setMode] = useState("Login");
  const [recovery, setRecovery] = useState(false);
  const incoming = Linking.useURL();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data, error }) => {
      if (!error) setUser(data.session?.user);
      else if (!hasEntryUser)
        setStatus(authErrorText(error, "Forge couldn't check your sign-in."));
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, [client, hasEntryUser]);
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
  async function signOutNow() {
    if (!client) return;
    setBusy(true);
    try {
      if (endSession) await endSession();
      else {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        setStatus("Signed out. Your local records remain on this device.");
      }
    } catch (e) {
      setStatus(authErrorText(e, "Forge couldn't sign you out. Try again."));
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!client || !shown) return;
    setBusy(true);
    try {
      const result = await synchronize(
        r,
        transport(client, shown.id),
        shown.id,
      );
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
  const c = useColors();
  const shown = entryUser ?? user;
  const methods = entryUser?.methods ?? (user ? signInMethods(user) : []);
  const pending = r.outbox().length;
  const conflicts = r.conflicts();
  return (
    <ForgeSubScreen
      title="Account & privacy"
      eyebrow="You"
      onBack={() => goBack("/(tabs)/profile")}
    >
      <Section title="Account">
        {!client ? (
          <ForgeCard testID="account-guest" gap={8}>
            <State icon="phone-portrait-outline" text="On this phone only" />
            <FText variant="cardTitle" weight="700" header>
              Guest mode is active
            </FText>
            <FText variant="label" tone="secondary">
              Cloud accounts aren&apos;t available in this version, so your
              training data stays on this phone. Export a backup regularly from
              Data &amp; privacy below and keep the file somewhere safe.
            </FText>
          </ForgeCard>
        ) : shown ? (
          <ForgeCard testID="account-signed-in" gap={10}>
            <State
              icon={offline ? "cloud-offline-outline" : "person-circle-outline"}
              text={offline ? "Signed in · offline" : "Signed in"}
              tone="accent"
            />
            <FText variant="cardTitle" weight="700" header>
              {shown.email ?? "Signed-in account"}
            </FText>
            {methods.length > 0 && (
              <FText variant="label" tone="secondary">
                {`Signs in with ${methods.join(" · ")}`}
              </FText>
            )}
            {offline && (
              <FText variant="label" tone="secondary">
                {
                  "You're offline. Forge reconnects to your account when you're back online; synchronizing needs a connection."
                }
              </FText>
            )}
            {recovery && (
              <>
                <ForgeField
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
                <CtaButton
                  title="Set new password"
                  compact
                  disabled={busy}
                  onPress={() => void updatePassword()}
                />
              </>
            )}
            <OutlineButton
              title="Sign out"
              compact
              disabled={busy}
              onPress={() => void signOutNow()}
            />
            <FText variant="label" tone="secondary">
              Signing out keeps everything on this phone.
            </FText>
          </ForgeCard>
        ) : (
          <ForgeCard testID="account-sign-in" gap={12}>
            <State icon="person-outline" text="Not signed in" />
            <FText variant="label" tone="secondary">
              Your training data is on this phone. Sign in to synchronize it
              with your account; sync runs only when you choose.
            </FText>
            <ForgeSegments
              accessibilityLabel="Account action"
              options={MODES}
              value={mode}
              onChange={setMode}
            />
            <ForgeField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {mode !== "Reset password" && (
              <ForgeField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            )}
            <CtaButton
              title={
                busy
                  ? "Working…"
                  : (MODES.find((m) => m.value === mode)?.label ?? mode)
              }
              compact
              disabled={busy}
              onPress={() => void auth()}
            />
          </ForgeCard>
        )}
        {!!status && (
          <View
            testID="account-status"
            accessible
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              gap: 10,
              padding: forge.spacing.cardPadding,
              borderRadius: forge.radii.card,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: c.cardRaised,
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={c.text2}
            />
            <FText variant="body" style={{ flex: 1 }}>
              {status}
            </FText>
          </View>
        )}
      </Section>

      {client && (
        <Section title="Cloud sync">
          <ForgeCard testID="account-sync" padding={0} gap={0}>
            <Fact label="On this phone" value={pendingText(pending)} />
            <Fact
              label="Conflicts"
              value={
                conflicts.length
                  ? `${conflicts.length} waiting for your choice`
                  : "None"
              }
              divider
            />
            <View
              style={{
                padding: forge.spacing.cardPadding,
                gap: 12,
                borderTopWidth: forge.border.card,
                borderTopColor: c.cardDivider,
              }}
            >
              <FText variant="label" tone="secondary">
                {shown
                  ? "Sync sends your local training and lifestyle data to your configured Supabase project. It runs only when requested. Export a backup before your first sync."
                  : "Sign in above to synchronize. Nothing is uploaded until you sync."}
              </FText>
              {shown && (
                <CtaButton
                  title={busy ? "Working…" : "Synchronize now"}
                  icon="sync"
                  compact
                  disabled={busy}
                  onPress={() => void sync()}
                />
              )}
            </View>
          </ForgeCard>
          {conflicts.map((cf) => (
            <ForgeCard key={cf.id} gap={10}>
              <State
                icon="git-compare-outline"
                text="Sync conflict"
                tone="accent"
                header
              />
              <FText variant="cardTitle" weight="700">
                {conflictTitle(cf.remote)}
              </FText>
              <FText variant="label" tone="secondary">
                The cloud record changed since this device last synchronized.
                Your local record remains intact. Keeping local explicitly
                replaces the cloud version on the next sync. Export a backup
                first.
              </FText>
              <OutlineButton
                title="Keep local version"
                compact
                onPress={() =>
                  confirm(
                    "Keep local version?",
                    "This authorizes replacing the currently conflicting cloud version on your next sync.",
                    () => r.keepLocal(cf.id),
                    { action: "Keep local version", destructive: false },
                  )
                }
              />
              <OutlineButton
                title="Use cloud version"
                compact
                onPress={() =>
                  confirm(
                    "Use cloud version?",
                    "Export first. This replaces the local record with the preserved cloud version.",
                    () => {
                      const row = JSON.parse(
                        cf.remote,
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
            </ForgeCard>
          ))}
        </Section>
      )}

      <DataPrivacy />

      <Section title="Membership">
        <MembershipCard />
      </Section>

      <AboutForge />

      <Section title="Delete">
        <ForgeCard padding={0} gap={0}>
          <DeleteLocalData />
          {client && shown && (
            <DangerRow
              title="Delete cloud account"
              description="Permanently deletes your account and every cloud record. Data on this phone stays."
              divider
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
          )}
        </ForgeCard>
      </Section>
    </ForgeSubScreen>
  );
}

/** A section label over its content. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: forge.spacing.tight }}>
      <SectionLabel title={title} />
      {children}
    </View>
  );
}

/** A state stated in words with a small icon (never by colour alone). */
function State({
  icon,
  text,
  tone = "secondary",
  header = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  tone?: "secondary" | "accent";
  header?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons
        name={icon}
        size={16}
        color={tone === "accent" ? c.emberHot : c.text2}
      />
      <FText variant="overline" tone={tone} header={header}>
        {text}
      </FText>
    </View>
  );
}

/** A label and its value on one row (wraps under large text). */
function Fact({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        minHeight: 48,
        paddingHorizontal: forge.spacing.cardPadding,
        paddingVertical: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 12,
        borderTopWidth: divider ? forge.border.card : 0,
        borderTopColor: c.cardDivider,
      }}
    >
      <FText variant="body" tone="secondary">
        {label}
      </FText>
      <FText variant="body" weight="600">
        {value}
      </FText>
    </View>
  );
}
