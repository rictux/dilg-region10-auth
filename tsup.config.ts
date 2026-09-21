import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // CORE is Angular 20, HRIS and REAMS are Vite. ES2020 is comfortably within
  // what all three target, and keeps the output readable when someone is
  // debugging a session that did not survive a redirect.
  target: 'es2020',
  treeshake: true,
});
