/// <reference types="vitest" />
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			alias: { $lib: 'src/lib' },
			adapter: adapter({
				routes: {
					include: ['/*'],
					exclude: ['<all>']
				}
			})
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom',
		globals: false,
		setupFiles: ['./vitest.setup.ts']
	}
});
