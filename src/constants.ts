/**
 * The cookie contract. CLAUDE.md §3 is authoritative for these values; this
 * file is that document expressed as code.
 *
 * Changing any of them signs out every user in every system at once, so a
 * change is a coordinated release across the whole estate, never a patch.
 */

/**
 * The Supabase `storageKey` every participating application must set.
 *
 * supabase-js derives its default storage key from the project ref, which
 * would agree across apps by accident today and stop agreeing the moment one
 * app points at a different project. Setting it explicitly makes the agreement
 * deliberate and visible in each app's client configuration.
 */
export const R10_STORAGE_KEY = 'r10-session';

/** The parent domain that makes the session shared rather than per-origin. */
export const R10_COOKIE_DOMAIN = '.region10.systems';

/**
 * Bytes per cookie chunk.
 *
 * Browsers cap a single cookie at roughly 4096 bytes including the name and
 * every attribute. 3600 leaves room for `r10-session.12=`, a domain, a path,
 * `Secure`, `SameSite` and `Max-Age` without anyone having to do the
 * arithmetic again.
 */
export const R10_CHUNK_SIZE = 3600;

/**
 * Cookie lifetime in seconds. Twelve hours, matching the session cap the
 * estate is meant to enforce.
 *
 * This is NOT that cap. It is refreshed on every write, so it behaves as an
 * idle timeout, and a cookie lifetime is a client-side hint that anyone can
 * edit. The absolute cap is enforced server-side; see the portal's CLAUDE.md
 * §8. This value only stops an abandoned browser from holding a session
 * indefinitely.
 */
export const R10_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
