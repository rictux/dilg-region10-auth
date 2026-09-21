/**
 * The chunked cookie storage adapter handed to supabase-js.
 *
 * supabase-js stores two things through this interface: the session under the
 * configured `storageKey`, and the PKCE code verifier under
 * `<storageKey>-code-verifier`. The adapter is therefore generic over the key
 * it is given and must never hardcode one — hardcoding the session name is how
 * the verifier gets written over the session and the OAuth exchange fails with
 * an error that names neither.
 */

import {
  R10_CHUNK_SIZE,
  R10_COOKIE_DOMAIN,
  R10_COOKIE_MAX_AGE_SECONDS,
  R10_STORAGE_KEY,
} from './constants.js';
import { cookieNames, deleteCookie, readCookie, writeCookie } from './cookies.js';

/**
 * The shape supabase-js expects. Declared here rather than imported so this
 * package keeps zero dependencies — see CLAUDE.md §7.
 */
export interface SupportedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SharedCookieStorageOptions {
  /** Defaults to `.region10.systems`. Pass `undefined` explicitly for host-only cookies in local development. */
  domain?: string | undefined;
  chunkSize?: number | undefined;
  maxAgeSeconds?: number | undefined;
}

/** Matches `key.0`, `key.1`, … and nothing else. */
function chunkIndexes(key: string): number[] {
  const prefix = `${key}.`;
  const indexes: number[] = [];

  for (const name of cookieNames()) {
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    // Strictly numeric. A neighbouring key such as `r10-session-code-verifier`
    // does not start with `r10-session.`, but a future `r10-session.meta`
    // would, and treating it as chunk NaN would corrupt every read.
    if (!/^\d+$/.test(suffix)) continue;
    indexes.push(Number(suffix));
  }

  return indexes.sort((a, b) => a - b);
}

export function createSharedCookieStorage(
  options: SharedCookieStorageOptions = {},
): SupportedStorage {
  const domain = 'domain' in options ? options.domain : R10_COOKIE_DOMAIN;
  const chunkSize = options.chunkSize ?? R10_CHUNK_SIZE;
  const maxAgeSeconds = options.maxAgeSeconds ?? R10_COOKIE_MAX_AGE_SECONDS;
  const attrs = { domain, maxAgeSeconds };

  function removeAll(key: string): void {
    for (const index of chunkIndexes(key)) {
      deleteCookie(`${key}.${index}`, { domain });
    }
  }

  return {
    getItem(key: string): string | null {
      const present = chunkIndexes(key);
      if (present.length === 0) return null;

      // Contiguity is the integrity check. A gap means a write was truncated
      // — the browser refused a chunk, or an older longer session was only
      // partly overwritten. Concatenating what survives yields a string that
      // is not the session but is shaped enough like one to be parsed
      // half-way, so treat the whole thing as absent and clear it. Better a
      // re-authentication than a session object missing its refresh token.
      const contiguous = present.every((value, i) => value === i);
      if (!contiguous) {
        removeAll(key);
        return null;
      }

      const encoded = present.map((i) => readCookie(`${key}.${i}`) ?? '').join('');

      try {
        return decodeURIComponent(encoded);
      } catch {
        // Malformed percent-encoding: same reasoning as a gap.
        removeAll(key);
        return null;
      }
    },

    setItem(key: string, value: string): void {
      // Encode first, then split. The encoded form is pure ASCII, so a slice
      // can never land inside a multi-byte character or split a surrogate
      // pair — which slicing the raw JSON absolutely can, and the resulting
      // corruption only shows up for users whose name carries an accent.
      const encoded = encodeURIComponent(value);

      const parts: string[] = [];
      for (let i = 0; i < encoded.length; i += chunkSize) {
        parts.push(encoded.slice(i, i + chunkSize));
      }
      if (parts.length === 0) parts.push('');

      parts.forEach((part, i) => writeCookie(`${key}.${i}`, part, attrs));

      // Clear what the previous, longer value occupied. Without this a session
      // that shrinks leaves `r10-session.2` behind; the next read sees three
      // contiguous chunks, concatenates two current ones with one stale one,
      // and produces JSON that parses into a session nobody issued. This is
      // the bug this package exists to prevent.
      for (const index of chunkIndexes(key)) {
        if (index >= parts.length) deleteCookie(`${key}.${index}`, { domain });
      }
    },

    removeItem(key: string): void {
      removeAll(key);
    },
  };
}

/**
 * Drops every chunk of the shared session locally.
 *
 * This does not revoke anything. The refresh token remains valid until the
 * server is told otherwise, so callers pair this with
 * `supabase.auth.signOut({ scope: 'global' })` and treat that call, not this
 * one, as the sign-out.
 */
export function clearSharedSession(
  options: { domain?: string | undefined; key?: string | undefined } = {},
): void {
  const domain = 'domain' in options ? options.domain : R10_COOKIE_DOMAIN;
  const key = options.key ?? R10_STORAGE_KEY;

  for (const index of chunkIndexes(key)) {
    deleteCookie(`${key}.${index}`, { domain });
  }
  // The PKCE verifier lives beside the session under its own key and would
  // otherwise survive a sign-out.
  for (const index of chunkIndexes(`${key}-code-verifier`)) {
    deleteCookie(`${key}-code-verifier.${index}`, { domain });
  }
}
