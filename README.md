# @region10/auth

Shared Supabase session across `*.region10.systems`.

One sign-in at the portal, and every system on the parent domain is signed in — no second redirect, and a global sign-out that actually reaches all of them.

`CLAUDE.md` in this repo is authoritative for the cookie contract. Read it before changing any value in `src/constants.ts`.

## Install

```bash
npm install @region10/auth
```

Pin it exactly — no `^`. Portal and systems must run the identical version, because a disagreement about the cookie shows up as a redirect loop, not an error.

## Use it in a system (HRIS, CORE, REAMS)

```ts
import { createClient } from '@supabase/supabase-js';
import { createSharedCookieStorage, R10_STORAGE_KEY } from '@region10/auth';
import type { Database } from '@/types/database.types';

export const supabase = createClient<Database, 'system_hris'>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    db: { schema: 'system_hris' },
    auth: {
      storage: createSharedCookieStorage(),
      storageKey: R10_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // only the portal completes an OAuth flow
      flowType: 'pkce',
    },
  },
);
```

`storageKey` must be set explicitly. supabase-js otherwise derives it from the project ref, which agrees across apps by accident today and stops agreeing the moment one app points somewhere else.

`detectSessionInUrl` is `false` everywhere except the portal. A system never lands an OAuth redirect.

### The route guard

```ts
import { portalSignInUrl, registerPortalBounce } from '@region10/auth';

if (!session) {
  const { shouldRedirect } = registerPortalBounce();
  if (!shouldRedirect) {
    // Portal and this app disagree about the cookie. Redirecting again just
    // hides it behind a hang — show the error instead.
    return <SessionErrorPage />;
  }
  window.location.replace(portalSignInUrl({ portalOrigin: 'https://region10.systems' }));
}
```

Call `clearPortalBounces()` once a session is established.

### Signing out

```ts
import { clearSharedSession } from '@region10/auth';

await supabase.auth.signOut({ scope: 'global' }); // revokes server-side
clearSharedSession();                             // drops the local chunks
```

`clearSharedSession` alone is not a sign-out. The refresh token stays valid until the server is told.

## Use it in the portal

Same client setup, plus `detectSessionInUrl: true` — the portal is the only place that completes a PKCE exchange — and `isAllowedReturnOrigin` to validate `next` before redirecting:

```ts
import { isAllowedReturnOrigin } from '@region10/auth';

const systems = await fetchSystems();            // identity.systems
const allowed = systems.map((s) => s.base_url).filter(Boolean);

if (next && isAllowedReturnOrigin(next, allowed)) {
  window.location.replace(next);
} else {
  navigate('/');                                  // the tile dashboard
}
```

The allowlist comes from the database, never a constant, so registering a system and trusting a redirect target are the same act.

## Local development

There is no parent domain on `localhost`, so pass `domain: undefined` for a host-only cookie:

```ts
createSharedCookieStorage({ domain: import.meta.env.DEV ? undefined : undefined });
```

Cross-system SSO cannot be exercised this way — for that, run the apps behind `*.localtest.me`, which resolves to `127.0.0.1` and gives you a real parent domain.

## Scripts

| | |
|---|---|
| `npm test` | Vitest against a jsdom cookie jar |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | ESM + CJS + `.d.ts` via tsup |

## Why this is a package and not a copied file

The cookie contract must be byte-identical everywhere. Copied into four apps, one flag drifts and the failure is an infinite redirect loop between the portal and the system the user wanted — no error message, no clue which side is wrong.

It also carries the chunking rules, and the chunking bug that matters is silent: a session that shrinks leaves an orphaned chunk behind, the next read splices it onto current data, and the users affected are the ones with the most roles. See `CLAUDE.md` §4.
