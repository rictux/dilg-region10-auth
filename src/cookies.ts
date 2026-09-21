/**
 * The thin layer over `document.cookie`.
 *
 * Nothing here knows about sessions or chunking — that is `storage.ts`. This
 * file exists so that exactly one place in the estate formats a `Set-Cookie`
 * attribute string, because a dropped `Secure` or a mistyped `Domain` is
 * invisible until it is a security incident.
 */

export interface CookieAttributes {
  /**
   * Omit for a host-only cookie. Local development has no parent domain to
   * share across, so it passes `undefined` and gets a cookie scoped to
   * `localhost` — which is correct, not a workaround.
   */
  domain?: string | undefined;
  maxAgeSeconds?: number | undefined;
}

/** True when this code can reach a cookie jar at all. */
export function cookiesAvailable(): boolean {
  return typeof document !== 'undefined' && typeof document.cookie === 'string';
}

/**
 * Every cookie name currently visible, in no particular order.
 *
 * Used to find chunks by prefix rather than probing indexes one at a time,
 * which is what makes orphan detection reliable when the indexes have a gap.
 */
export function cookieNames(): string[] {
  if (!cookiesAvailable()) return [];

  const names: string[] = [];
  for (const pair of document.cookie.split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    if (name.length > 0) names.push(name);
  }
  return names;
}

export function readCookie(name: string): string | null {
  if (!cookiesAvailable()) return null;

  for (const pair of document.cookie.split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    if (pair.slice(0, eq).trim() !== name) continue;
    return pair.slice(eq + 1).trim();
  }
  return null;
}

export function writeCookie(name: string, value: string, attrs: CookieAttributes = {}): void {
  if (!cookiesAvailable()) return;

  const parts = [`${name}=${value}`, 'Path=/'];

  if (attrs.domain !== undefined) parts.push(`Domain=${attrs.domain}`);
  if (attrs.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.floor(attrs.maxAgeSeconds)}`);

  // Both are unconditional. `Secure` is permitted on http://localhost by every
  // current browser, so development does not need an exception — and an
  // exception is exactly how a production cookie ends up without it.
  //
  // `SameSite=Lax` and not `Strict`: the browser arrives back from Google
  // through a cross-site redirect, and `Strict` withholds the cookie on that
  // navigation, so the user lands signed out on the page that just signed them
  // in. `None` is never right here — nothing embeds these apps cross-site.
  parts.push('Secure', 'SameSite=Lax');

  document.cookie = parts.join('; ');
}

export function deleteCookie(name: string, attrs: CookieAttributes = {}): void {
  if (!cookiesAvailable()) return;

  const parts = [`${name}=`, 'Path=/', 'Max-Age=0'];
  // The delete must echo the Domain the cookie was written with. A deletion
  // sent without it targets a host-only cookie of the same name, silently
  // leaves the shared one in place, and the session refuses to die.
  if (attrs.domain !== undefined) parts.push(`Domain=${attrs.domain}`);
  parts.push('Secure', 'SameSite=Lax');

  document.cookie = parts.join('; ');
}
