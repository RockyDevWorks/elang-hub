import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration.
 *
 * Test environments:
 *
 *   - `node` (default) — SDK adapter tests, controller tests,
 *     page-level integration tests (in src/routes), and the
 *     read-only-audit grep test. No DOM, no browser globals — the
 *     adapter is exercised with a stub `fetch` and the page state
 *     machine is wired without a browser.
 *
 *   - `happy-dom` — Svelte component tests under
 *     src/lib/components. Component tests opt into happy-dom with a
 *     per-file `// @vitest-environment happy-dom` directive. The
 *     directive is the supported per-file mechanism in Vitest v4;
 *     the older `environmentMatchGlobs` option was removed.
 *     `happy-dom` covers everything the components do — no
 *     `Canvas`, no `WebGL`, no custom layout engine — and is much
 *     faster than `jsdom`.
 *
 * The `$lib` alias is sourced from SvelteKit's generated
 * `.svelte-kit/tsconfig.json` so tests and source share the same
 * module resolution. Coverage is enabled via `npm run coverage`
 * (not the default `npm test`) so day-to-day test runs stay fast.
 * The provider is V8 — the same runtime that ships with Node —
 * which avoids the `istanbul` Babel dependency tree. Test files
 * are excluded; only `src/lib/` is measured.
 */
export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
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
