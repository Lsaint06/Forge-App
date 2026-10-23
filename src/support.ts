// Forge's support contact. There is no dedicated address yet: set
// EXPO_PUBLIC_SUPPORT_EMAIL (see .env.example) when one exists. Until then
// no contact is shown, rather than a placeholder that reaches nobody.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function supportEmail(): string | undefined {
  // A plain property read, like the Supabase settings, so Expo inlines it.
  const configured = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  const value = configured ? configured.trim() : "";
  return EMAIL.test(value) ? value : undefined;
}

/** A pre-filled support email about a startup or data error. */
export function supportMailto(email: string, details: string) {
  const subject = encodeURIComponent("FORGE couldn't open");
  const body = encodeURIComponent(
    `What happened:\n\n\nError details (from FORGE):\n${details}`,
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}
