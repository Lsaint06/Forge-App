import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useColors } from "../../components/ui";
import { FText, ForgeCard, ForgeListRow } from "../../components/reforge";
import { forge } from "../../theme";
import { useEntry } from "../../auth/session";
import { membershipStatus, statusLines } from "../../billing/paywall";
import type { Verification } from "../../billing/service";
import {
  manageMembership,
  membershipDeps,
  watchMembershipSession,
} from "../../billing/runtime";
import { membershipDate } from "./Paywall";

/**
 * You → Account's membership card while membership is enabled (Phase 9.3):
 * what Forge's server verified for this account, with Apple's subscription
 * management and the paywall. It shows only the server's answer, and starts
 * over for each account.
 */
export function MembershipStatusCard() {
  const { entry } = useEntry();
  const userId = entry.kind === "ready" ? entry.user.id : undefined;
  return <StatusCard key={userId ?? ""} userId={userId} />;
}

function StatusCard({ userId }: { userId: string | undefined }) {
  const c = useColors();
  const [verification, setVerification] = useState<Verification>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => watchMembershipSession(), []);
  useEffect(() => {
    const deps = membershipDeps();
    if (!deps || !userId) return;
    let live = true;
    // What this phone holds at once, unless only the server can say; then
    // the server's own record.
    void membershipStatus(deps, userId, "held").then((v) => {
      if (live && v.access.kind !== "unverified")
        setVerification((now) => now ?? v);
    });
    void membershipStatus(deps, userId, "server").then((v) => {
      if (live) setVerification(v);
    });
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  const lines = statusLines(verification, membershipDate);
  const access = verification?.access.kind;
  return (
    <ForgeCard testID="you-membership" padding={0} gap={0}>
      <View style={{ padding: forge.spacing.cardPadding, gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <FText variant="overline" tone="accent">
            Forge Premium
          </FText>
          <View
            style={{
              paddingHorizontal: 10,
              minHeight: 24,
              justifyContent: "center",
              borderRadius: forge.radii.pill,
              borderWidth: forge.border.card,
              borderColor: c.cardBorder,
              backgroundColor: c.cardRaised,
            }}
          >
            <FText variant="label" weight="600">
              {lines.chip}
            </FText>
          </View>
        </View>
        <FText variant="cardTitle" weight="700" header>
          {lines.title}
        </FText>
        <FText variant="label" tone="secondary">
          {lines.detail}
        </FText>
      </View>
      {access === "unverified" && (
        <ForgeListRow
          icon="refresh"
          title="Check again"
          description="Ask Forge's server once more"
          divider
          onPress={() => {
            setVerification(undefined);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      <ForgeListRow
        icon="diamond-outline"
        title="View Forge Premium"
        description={
          access === "granted"
            ? "Your membership"
            : "Subscribe or restore purchases"
        }
        divider
        onPress={() => router.push("/membership")}
      />
      {lines.manage && (
        <ForgeListRow
          icon="card-outline"
          title="Manage subscription"
          description="Apple's subscription settings"
          divider
          onPress={() => void manageMembership()}
        />
      )}
    </ForgeCard>
  );
}
