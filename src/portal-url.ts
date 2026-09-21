/**
 * The redirect a system performs when it finds no session.
 *
 * Systems do not render a sign-in screen and do not call `signInWithOAuth`.
 * They send the browser to the portal and say where to come back to.
 */

/**
 * How many times an application may bounce to the portal before it stops and
 * shows an error instead.
 *
 * If the portal and a system disagree about the cookie by so much as a flag,
 * the portal sees a valid session, the system sees none, and they redirect to
 * each other until the browser gives up with a message that names nothing
 * useful. Three is enough to absorb a genuine race — a token refreshing
 * exactly as the guard reads it — and small enough that the loop surfaces as a
 * diagnosis rather than a hang.
 */
export const MAX_PORTAL_BOUNCES = 3;

const BOUNCE_KEY = 'r10-portal-bounces';

export interface PortalSignInUrlOptions {
  /** e.g. `https://region10.systems` */
  portalOrigin: string;
  /** Defaults to the current location. */
  next?: string | undefined;
}

export function portalSignInUrl(options: PortalSignInUrlOptions): string {
  const next =
    options.next ?? (typeof window === 'undefined' ? '' : window.location.href);

  const url = new URL('/signin', options.portalOrigin);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}

/**
 * Records a bounce and reports whether this application should keep
 * redirecting.
 *
 * `sessionStorage` rather than a cookie: the counter is per-tab and must not
 * be shared across the estate, or one system's redirect loop would stop
 * another system from signing in at all.
 */
export function registerPortalBounce(): { shouldRedirect: boolean; count: number } {
  if (typeof sessionStorage === 'undefined') return { shouldRedirect: true, count: 0 };

  let count = 0;
  try {
    count = Number(sessionStorage.getItem(BOUNCE_KEY) ?? '0');
    if (!Number.isFinite(count) || count < 0) count = 0;
    count += 1;
    sessionStorage.setItem(BOUNCE_KEY, String(count));
  } catch {
    // Private browsing, blocked site data, or a quota error. A counter we
    // cannot keep must not be allowed to block sign-in.
    return { shouldRedirect: true, count: 0 };
  }

  return { shouldRedirect: count <= MAX_PORTAL_BOUNCES, count };
}

/** Called once a session is established, so the next genuine sign-in starts clean. */
export function clearPortalBounces(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(BOUNCE_KEY);
  } catch {
    // Nothing to do: the counter expires with the tab regardless.
  }
}
