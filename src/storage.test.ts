import { beforeEach, describe, expect, it } from 'vitest';
import { createSharedCookieStorage, clearSharedSession } from './storage.js';
import { cookieNames, readCookie, writeCookie } from './cookies.js';

// jsdom runs at https://portal.region10.systems, which is a subdomain of the
// real parent, so a cookie written with Domain=.region10.systems is accepted
// exactly as a browser would accept it.
const KEY = 'r10-session';

function wipe(): void {
  for (const name of cookieNames()) {
    document.cookie = `${name}=; Path=/; Max-Age=0; Domain=.region10.systems; Secure; SameSite=Lax`;
    document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
  }
}

/** A session-shaped payload of roughly `bytes` length. */
function payload(bytes: number): string {
  return JSON.stringify({
    access_token: 'a'.repeat(Math.max(0, bytes - 120)),
    refresh_token: 'r'.repeat(64),
    user: { email: 'juan.delacruz@gmail.com' },
  });
}

describe('createSharedCookieStorage', () => {
  beforeEach(wipe);

  const storage = createSharedCookieStorage();

  it('returns null when nothing is stored', () => {
    expect(storage.getItem(KEY)).toBeNull();
  });

  // The conformance requirement in CLAUDE.md §6: round-trip at sizes that
  // straddle the single-cookie limit.
  it.each([1_000, 4_000, 12_000])('round-trips a %i byte session', (size) => {
    const value = payload(size);
    storage.setItem(KEY, value);
    expect(storage.getItem(KEY)).toBe(value);
  });

  it('splits a large session across several chunks', () => {
    storage.setItem(KEY, payload(12_000));
    const chunks = cookieNames().filter((n) => n.startsWith(`${KEY}.`));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves non-ASCII content across a chunk boundary', () => {
    // Encoding before splitting is what makes this work. Slicing the raw JSON
    // could cut a multi-byte character in half, and the only users affected
    // would be the ones whose names carry accents.
    const value = JSON.stringify({ name: 'Ñoño Dela Peña ' + 'é'.repeat(4_000) });
    storage.setItem(KEY, value);
    expect(storage.getItem(KEY)).toBe(value);
  });

  it('clears orphaned chunks when a session shrinks', () => {
    storage.setItem(KEY, payload(12_000));
    const before = cookieNames().filter((n) => n.startsWith(`${KEY}.`)).length;
    expect(before).toBeGreaterThan(1);

    storage.setItem(KEY, payload(200));

    const after = cookieNames().filter((n) => n.startsWith(`${KEY}.`));
    expect(after).toHaveLength(1);
    expect(storage.getItem(KEY)).toBe(payload(200));
  });

  it('treats a gap in the chunk sequence as no session at all', () => {
    // .0 and .2 present, .1 missing — a truncated write. Returning the
    // concatenation would hand supabase-js a half-session.
    writeCookie(`${KEY}.0`, 'aaa', { domain: '.region10.systems' });
    writeCookie(`${KEY}.2`, 'ccc', { domain: '.region10.systems' });

    expect(storage.getItem(KEY)).toBeNull();
    // and it cleans up rather than leaving the fragments to be found again
    expect(cookieNames().filter((n) => n.startsWith(`${KEY}.`))).toHaveLength(0);
  });

  it('ignores a neighbouring key with the same prefix', () => {
    // The PKCE verifier lives at `<key>-code-verifier` and must not be read
    // as a chunk of the session.
    storage.setItem(KEY, payload(200));
    storage.setItem(`${KEY}-code-verifier`, 'verifier-value');

    expect(storage.getItem(KEY)).toBe(payload(200));
    expect(storage.getItem(`${KEY}-code-verifier`)).toBe('verifier-value');
  });

  it('removeItem deletes every chunk', () => {
    storage.setItem(KEY, payload(12_000));
    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
    expect(cookieNames().filter((n) => n.startsWith(`${KEY}.`))).toHaveLength(0);
  });

  it('writes Secure and SameSite=Lax', () => {
    storage.setItem(KEY, payload(200));
    // jsdom exposes no attributes through document.cookie, so assert the
    // observable consequence instead: the cookie was accepted at all. A
    // cookie jar on an https origin accepts Secure; one that dropped the
    // flag would still be readable, so this is a smoke check, and the real
    // guarantee is that cookies.ts has no branch that can omit it.
    expect(readCookie(`${KEY}.0`)).not.toBeNull();
  });
});

describe('clearSharedSession', () => {
  beforeEach(wipe);

  it('drops the session and the PKCE verifier together', () => {
    const storage = createSharedCookieStorage();
    storage.setItem(KEY, payload(8_000));
    storage.setItem(`${KEY}-code-verifier`, 'verifier-value');

    clearSharedSession();

    expect(storage.getItem(KEY)).toBeNull();
    expect(storage.getItem(`${KEY}-code-verifier`)).toBeNull();
  });
});
