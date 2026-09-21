/**
 * Validation of the `next` parameter the portal redirects to after sign-in.
 *
 * This is the estate's open-redirect defence and it has exactly one
 * implementation on purpose. An attacker who can choose where the portal sends
 * a freshly authenticated browser has a phishing link that begins on the real
 * government domain, shows a real Google consent screen, and ends wherever
 * they like.
 */

/**
 * True only when `next` is an absolute http(s) URL whose origin exactly
 * matches one of `allowedBaseUrls`.
 *
 * The allowlist comes from `identity.systems.base_url` — the database, not a
 * constant — so registering a system and trusting a redirect target are the
 * same act and cannot drift apart.
 *
 * Never reimplement this as a suffix test. `endsWith('.region10.systems')`
 * also accepts `https://region10.systems.attacker.example`, and it quietly
 * converts any future subdomain takeover into an authentication redirect.
 */
export function isAllowedReturnOrigin(next: string, allowedBaseUrls: readonly string[]): boolean {
  let target: URL;
  try {
    // Deliberately parsed without a base. A relative value such as
    // `/leave/123` or a protocol-relative `//evil.example` throws here, and
    // both should: the portal's contract is an absolute URL naming a system.
    target = new URL(next);
  } catch {
    return false;
  }

  // `new URL` happily parses `javascript:alert(1)` and `data:text/html,…`,
  // whose origin is the string "null" — which would compare equal to another
  // opaque origin if we only compared origins.
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;

  for (const base of allowedBaseUrls) {
    let allowed: URL;
    try {
      allowed = new URL(base);
    } catch {
      // A malformed row in identity.systems must not throw here and take the
      // whole sign-in down; it simply matches nothing.
      continue;
    }
    if (allowed.origin === target.origin) return true;
  }

  return false;
}
