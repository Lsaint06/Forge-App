import React from "react";
import { router } from "expo-router";
import { ForgeEmpty, ForgeSubScreen } from "../../components/reforge";
import { useEntry } from "../../auth/session";
import {
  legalLinks,
  manageMembership,
  membershipEnabled,
} from "../../billing/runtime";
import { goBack } from "../../navigation";
import type { MembershipStep as Step } from "../onboarding/Flow";
import type { PremiumPath } from "../../domain/onboarding/premium";
import { PaywallScreen } from "./Paywall";
import type { Arrival } from "./Premium";
import { usePaywall } from "./usePaywall";

// Forge Premium's screens (Phase 9.3), behind the development opt-in
// (src/billing/config.ts):
// - the membership step after the Forge Path reveal (docs/ONBOARDING.md,
//   audit section 10, screen E), the next chapter of setup: Forge opens once
//   the membership is verified, or without one;
// - the same paywall from You → Account (/membership), to subscribe, restore
//   or see the membership. The expired screen that replaces Forge for a
//   lapsed member is Phase 9.4's gate, not built here.

function Paywall({
  userId,
  onBack,
  onDone,
  account,
  error,
  banner,
  path,
  arrival = "settle",
  standalone = false,
}: {
  userId?: string;
  onBack: () => void;
  onDone: () => void;
  account?: Parameters<Step>[0]["account"];
  error?: string;
  banner?: React.ReactNode;
  path?: PremiumPath;
  arrival?: Arrival;
  /** You → Account: Done and Apple's settings instead of setup's way on. */
  standalone?: boolean;
}) {
  const p = usePaywall(userId);
  return (
    <PaywallScreen
      state={p.state}
      simulated={p.simulated}
      legal={legalLinks()}
      path={path}
      arrival={arrival}
      onBack={onBack}
      account={account}
      banner={banner}
      error={error}
      onPurchase={() => void p.purchase()}
      onRestore={() => void p.restore()}
      onCheck={() => void p.check()}
      onRetry={() => void p.load()}
      onEnter={onDone}
      enterTitle={standalone ? "Done" : "Enter Forge"}
      onDecline={standalone ? undefined : onDone}
      onManage={standalone ? () => void manageMembership() : undefined}
    />
  );
}

/** Setup's step after the reveal, for the account being set up. */
export function membershipStep(userId: string): Step {
  return function MembershipStepScreen(props) {
    return <Paywall userId={userId} {...props} />;
  };
}

/** /membership: Forge Premium from You → Account. */
export default function MembershipScreen() {
  const { entry } = useEntry();
  const back = () => goBack("/account");
  if (!membershipEnabled())
    return (
      <ForgeSubScreen title="Forge Premium" onBack={() => router.back()}>
        <ForgeEmpty
          title="Not in this build"
          detail="Forge Premium isn't available in this version of Forge yet."
        />
      </ForgeSubScreen>
    );
  return (
    <Paywall
      userId={entry.kind === "ready" ? entry.user.id : undefined}
      onBack={back}
      onDone={back}
      standalone
    />
  );
}
