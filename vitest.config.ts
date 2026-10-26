import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration.
 *
 * Unit tests for the SDK adapter (`src/lib/sdk/*.test.ts`) and the
 * page-level tests (`src/routes/page.test.ts`, `src/routes/api/**`)
 * run in the default `node` environment — no DOM, no browser
 * globals — so the adapter contract can be exercised with a stub
 * `fetch` and the page state machine can be wired without a
 * browser.
 *
 * The `$lib` alias is sourced from SvelteKit's generated
 * `.svelte-kit/tsconfig.json` so tests and source share the same
 * module resolution. Coverage is enabled via `npm run coverage`
 * (not the default `npm test`) so day-to-day test runs stay fast.
 * The provider is V8 — the same runtime that ships with Node —
 * which avoids the `istanbul` Babel dependency tree. Test files
 * are excluded; only `src/lib/**` is measured.
 */
export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
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
