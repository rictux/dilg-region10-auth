import { describe, expect, it } from 'vitest';
import { isAllowedReturnOrigin } from './return-origin.js';
import { portalSignInUrl } from './portal-url.js';

const ALLOWED = [
  'https://hris.region10.systems',
  'https://core.region10.systems/',
];

describe('isAllowedReturnOrigin', () => {
  it('accepts a registered system, including a deep path', () => {
    expect(isAllowedReturnOrigin('https://hris.region10.systems', ALLOWED)).toBe(true);
    expect(
      isAllowedReturnOrigin('https://hris.region10.systems/leave/applications/123', ALLOWED),
    ).toBe(true);
  });

  it('accepts a base_url written with a trailing slash', () => {
    expect(isAllowedReturnOrigin('https://core.region10.systems/dashboard', ALLOWED)).toBe(true);
  });

  // The attacks this function exists for.
  it.each([
    ['suffix-confusion domain', 'https://region10.systems.attacker.example/'],
    ['lookalike subdomain', 'https://hris.region10.systems.attacker.example/'],
    ['unregistered subdomain', 'https://staging.region10.systems/'],
    ['protocol downgrade', 'http://hris.region10.systems/'],
    ['protocol-relative', '//evil.example'],
    ['bare path', '/leave/applications/123'],
    ['javascript scheme', 'javascript:alert(document.cookie)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['empty', ''],
    ['whitespace', '   '],
  ])('rejects %s', (_label, value) => {
    expect(isAllowedReturnOrigin(value, ALLOWED)).toBe(false);
  });

  it('rejects everything when the allowlist is empty', () => {
    expect(isAllowedReturnOrigin('https://hris.region10.systems', [])).toBe(false);
  });

  it('survives a malformed row in identity.systems', () => {
    // A bad base_url must not throw and take the whole sign-in down; it
    // simply matches nothing.
    const withJunk = ['not a url', 'https://hris.region10.systems'];
    expect(isAllowedReturnOrigin('https://hris.region10.systems/x', withJunk)).toBe(true);
    expect(isAllowedReturnOrigin('https://evil.example', withJunk)).toBe(false);
  });
});

describe('portalSignInUrl', () => {
  it('encodes the return target as a query parameter', () => {
    const url = portalSignInUrl({
      portalOrigin: 'https://region10.systems',
      next: 'https://hris.region10.systems/leave/applications/123',
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://region10.systems');
    expect(parsed.pathname).toBe('/signin');
    expect(parsed.searchParams.get('next')).toBe(
      'https://hris.region10.systems/leave/applications/123',
    );
  });

  it('omits next when there is nothing to return to', () => {
    const url = portalSignInUrl({ portalOrigin: 'https://region10.systems', next: '' });
    expect(new URL(url).searchParams.has('next')).toBe(false);
  });
});
