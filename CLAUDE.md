# CLAUDE.md — @region10/auth

Loaded automatically every session. **This file is authoritative** for the session cookie contract. Where any consuming repo's documentation disagrees about a cookie name, flag, domain or chunking rule, this file wins and the other repo is wrong.

Sibling repos: `dilg-region10-portal` (the portal and sign-in), `eghris` (HRIS).

---

## 1. What this is

A small, framework-agnostic TypeScript library that lets several separate browser applications on `*.region10.systems` share one Supabase session.

It is **a library, not a service.** It has no domain, no deployment, no server and no runtime of its own. It is published to a package registry and imported.

It exists because the cookie contract below must be byte-identical in every application that participates. Copied into each app by hand, one flag drifts and the failure mode is not an error message — it is an infinite redirect loop between the portal and the system the user was trying to open (§6).

## 2. What this is NOT

Keep these out, permanently. Each one drags a framework, a secret, or a policy decision into a package whose whole value is that it has none of them.

- Not a Supabase client factory. Each app builds its own client with its own schema and its own generated `Database` type. This supplies `auth.storage` and nothing else.
- Not a place for authorization. It knows nothing about roles, systems, `system_access`, or who may open what. That is the portal's job, and each system's.
- Not a UI library. No React, no Angular, no components, no peer dependency on either. Both are consumers.
- Not a home for URLs, project refs, anon keys or any environment value. The consumer passes what it needs.

## 3. The cookie contract

These values are load-bearing. Changing any of them signs out every user in every system at once, so a change is a coordinated release, never a patch.

| Property | Value | Why |
|---|---|---|
| Base name | `r10-session` | One name, all systems |
| Chunk names | `r10-session.0`, `r10-session.1`, … | §4 |
| `Domain` | `.region10.systems` | The parent domain is what makes it shared |
| `Path` | `/` | |
| `Secure` | always | No exceptions, including local dev over HTTPS |
| `SameSite` | `Lax` | `Strict` breaks the return leg of the OAuth redirect. `None` is never correct here — nothing embeds these apps cross-site |
| `HttpOnly` | **not set** | These are SPAs; supabase-js must read the token in JavaScript. Stated explicitly so nobody "fixes" it later and breaks every app |
| Encoding | `encodeURIComponent` of the JSON session | |

`HttpOnly` being absent is the real cost of this design, and this is the honest place to record it: a successful XSS in any one of these applications steals a session valid in all of them. That is why every consuming app carries a strict CSP with no `unsafe-inline`, and why that CSP is not negotiable in any of them.

## 4. Chunking is mandatory

Browsers cap a single cookie at ~4KB. A Supabase session holding an access token, a refresh token and the user object is usually well under that — until a Custom Access Token Hook adds role claims, and a user with several scoped grants goes over.

The failure is silent and lands on exactly the wrong people: the most privileged users, whose sessions vanish without an error, on a system that works fine for everyone else. Reproducing it requires an account with many roles, which is why it survives testing.

Rules:

- **Write:** serialize, then split at **3600 bytes** per chunk (headroom for the name, attributes and encoding overhead).
- **Read:** gather `r10-session.N` from `N = 0` upward until the first gap, then concatenate. A gap means a truncated write; treat the whole session as absent rather than parsing a fragment.
- **Remove:** delete every chunk found, not just `.0`.
- **Shrinking sessions must clear the chunks they no longer occupy.** A stale `.1` left behind after a shorter session is written corrupts the next read. This is the bug that gets written first and found last.

## 5. API surface

Keep it this small. Everything here has two or more consumers; anything with one belongs in that consumer.

```ts
// The storage adapter handed to createClient({ auth: { storage } }).
export function createSharedCookieStorage(opts?: {
  domain?: string;      // default '.region10.systems'
  name?: string;        // default 'r10-session'
  chunkSize?: number;   // default 3600
}): SupabaseStorage;

// Build the URL that an unauthenticated system sends the browser to.
// Encodes the current location as `next` so the portal can return the user to
// the deep link they actually asked for, not to the portal dashboard.
export function portalSignInUrl(opts: {
  portalOrigin: string;   // 'https://region10.systems'
  next?: string;          // defaults to window.location.href
}): string;

// Exact-origin allowlist check. Used by the PORTAL to validate `next` before
// redirecting, and exported here so the rule has one implementation.
export function isAllowedReturnOrigin(next: string, allowedBaseUrls: string[]): boolean;

// Clears every chunk locally. Does NOT revoke server-side; the caller pairs
// this with supabase.auth.signOut({ scope: 'global' }).
export function clearSharedSession(opts?: { domain?: string; name?: string }): void;
```

`isAllowedReturnOrigin` compares `new URL(x).origin` for exact equality against each entry. It must never be reimplemented as a suffix test: `endsWith('.region10.systems')` also matches `region10.systems.attacker.example`, which turns the portal's sign-in page into a credible phishing redirect that starts on the real domain.

## 6. The failure mode to protect against

Portal and system must agree on the cookie exactly. If they do not:

1. System reads no session, redirects to the portal with `next`
2. Portal reads a valid session, redirects back to `next`
3. Go to 1

The browser stops after ~20 hops with a generic error naming nothing useful.

Guard rails, all required:

- A conformance test both consumers run: write with this library, read with this library, assert round-trip through a cookie jar at 1KB, 4KB and 12KB session sizes.
- The version is pinned exactly (no `^`) in every consumer, and they are upgraded together.
- The guard helper in each app counts its own bounces (a `sessionStorage` counter) and after **3** shows a real error page instead of redirecting again. A loop must surface as a diagnosis, not a hang.

## 7. Stack

TypeScript strict · `tsup` → ESM + CJS + `.d.ts` · **zero runtime dependencies** · Vitest + `jsdom`. Node 20+.

Zero runtime dependencies is a rule, not an observation. This package is imported by an Angular app and two Vite apps; a dependency here is a dependency in all of them, and a supply-chain compromise here is a stolen session in every system at once.

## 8. Consumers

| Repo | Uses |
|---|---|
| `dilg-region10-portal` | storage adapter (writes the session), `isAllowedReturnOrigin` |
| `eghris` — HRIS, React 18 + Vite | storage adapter (reads), `portalSignInUrl`, `clearSharedSession` |
| `dilg-region10-reams` — REAMS, React 19 + Vite | same as HRIS |
| `dilg-region10-core` — CORE, Angular 20 | same as HRIS |

All three are confirmed Supabase apps, so all three are integration class A and all three import this package.

Both REAMS and CORE currently run their own username/password identity with self-registration — REAMS compares a `bcryptjs` hash in the browser. Adopting this package means **deleting** those logins, not wrapping them. See `dilg-dilg-dilg-region10-portal/CLAUDE.md` §3.

A system with its own backend and its own user table does **not** use this package — IMS (`regional-supplies-assets`, FastAPI + MariaDB) validates the portal's JWT against the Supabase JWKS endpoint, server-side. That is class B.

Angular note: this package is plain TypeScript with no framework imports, so CORE consumes it unchanged. Only `auth.storage` comes from here; CORE keeps its own client, and the hardcoded URL and anon key in `src/supabase.config.ts` move to environment configuration as part of that work.

## 9. Definition of done

- [ ] Round-trip tests at 1KB / 4KB / 12KB session sizes
- [ ] Chunk-shrink test: a large session replaced by a small one leaves no orphaned `.N` chunk
- [ ] Gap test: `.0` and `.2` present, `.1` missing, reads as absent
- [ ] `isAllowedReturnOrigin` rejects `https://region10.systems.attacker.example`, `//evil.example`, `javascript:` and a bare path
- [ ] No runtime dependencies in `package.json`
- [ ] Builds ESM + CJS + types; imports cleanly from a Vite app and an Angular app
