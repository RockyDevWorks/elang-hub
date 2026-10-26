import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Unit tests for the SDK adapter (`src/lib/sdk/*.test.ts`) run in
 * the default `node` environment — no DOM, no browser globals — so
 * the adapter contract can be exercised with a stub `fetch`.
 *
 * Coverage is enabled via `npm run coverage` (not the default
 * `npm test`) so day-to-day test runs stay fast. The provider is
 * V8 — the same runtime that ships with Node — which avoids the
 * `istanbul` Babel dependency tree. Test files are excluded; only
 * `src/lib/**` (and future `src/routes/**`) are measured.
 */
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
		// The Hub builds for the Cloudflare adapter; Vitest's default
		// to Vite's resolve order keeps `vite` out of the test path.
		exclude: ['node_modules', '.svelte-kit', 'build', 'dist'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'json-summary'],
			// Codecov reads `lcov` and reports at PR time.
			// `json-summary` is for the optional `coverage.yml` upload.
			include: ['src/lib/**'],
			exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts']
		}
	}
});
