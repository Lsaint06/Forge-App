import { sessionStorage } from "../platform/sessionStorage";
import { entitlementCache } from "./cache";

// In Forge's builds the entitlement cache lives in the secure store (the iOS
// Keychain, Android's Keystore), chunked like the account session. One cache
// for the whole app, so every caller shares its queue and its memory. Nothing
// uses it before the gate is wired (Phase 9.4).
export const secureEntitlementCache = entitlementCache(sessionStorage);
