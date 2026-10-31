// Whether Supabase Auth will send a sign-in back to a return address (Phase
// 7.7B.1 fix). Supabase refuses any address whose host is an IP address other
// than loopback, before it even reads the redirect allow list, and silently
// uses the project's Site URL instead (supabase/auth,
// internal/utilities/request.go: IsRedirectURLValid). Expo Go on a local
// network returns to exp://<the computer's IP>:8081/--/…, so a sign-in started
// there would end on the Site URL. Hostnames are left to the allow list.

export type ReturnUrlRefusal = "unreadable" | "ip-address";

/** Why Supabase would refuse to return to this address, if it would. */
export function returnUrlRefusal(url: string): ReturnUrlRefusal | undefined {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "unreadable";
  }
  host = host.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  // A build's own scheme (forge:///welcome) has no host: the allow list decides.
  if (!host) return undefined;
  // A whole IP address written as one number is refused outright.
  if (/^[0-9]+$/.test(host)) return "ip-address";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
    return host.split(".")[0] === "127" ? undefined : "ip-address";
  // IPv6 literals: only loopback.
  if (host.includes(":")) return host === "::1" ? undefined : "ip-address";
  return undefined;
}

export const supabaseAcceptsReturnUrl = (url: string) => !returnUrlRefusal(url);
