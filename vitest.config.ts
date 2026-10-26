import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Unit tests for the SDK adapter (`src/lib/sdk/*.test.ts`) run in
 * the default `node` environment — no DOM, no browser globals — so
 * the adapter contract can be exercised with a stub `fetch`.
 */
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
		// The Hub builds for the Cloudflare adapter; Vitest's default
		// to Vite's resolve order keeps `vite` out of the test path.
		exclude: ['node_modules', '.svelte-kit', 'build', 'dist']
	}
});
