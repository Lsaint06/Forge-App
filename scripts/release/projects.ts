// The Supabase project each environment's builds may use (Phase 8.4B),
// pinned by the SHA-256 of its project ref so this public repository never
// names a project. A build whose values aren't the pinned project stops on
// the EAS builder (`npm run release:check -- --builder`), before any
// JavaScript is bundled.
//
// production is deliberately unpinned: every production build fails until
// the founder approves production release readiness and the production
// project's fingerprint is added here in a reviewed commit
// (`npm run release:check -- --fingerprint <env file>` prints it without
// printing the ref). It's the second of two locks: since Phase 8.4C-0
// eas.json has no production profile at all, so EAS CLI stops before any
// build number, credential or upload. Both are lifted together at 8.4F:
// docs/RELEASE.md §6.

import { createHash } from "node:crypto";
import type { ForgeEnvironment } from "../../src/cloud/environment";

export const PROJECT_FINGERPRINTS: Readonly<
  Record<ForgeEnvironment, string | null>
> = {
  // FORGE DEV (Phase 8.2): used by FORGE Dev and FORGE Preview.
  development:
    "79bb28e88c8060732a9a5044657514d3f3257e0708e5f67e829767a88dd2d516",
  // Locked until production release approval.
  production: null,
};

/** A project ref's fingerprint: SHA-256, hex. */
export const fingerprint = (ref: string) =>
  createHash("sha256").update(ref.trim()).digest("hex");
