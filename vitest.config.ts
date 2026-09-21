import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us a real document.cookie, which is the whole point: the
    // chunking bugs this package exists to prevent only appear against an
    // actual cookie jar, not a Map pretending to be one.
    environment: 'jsdom',
    environmentOptions: {
      // Secure cookies need a trustworthy origin. Without this jsdom silently
      // drops every cookie we write and the tests pass for the wrong reason.
      jsdom: { url: 'https://portal.region10.systems/' },
    },
    include: ['src/**/*.test.ts'],
  },
});
