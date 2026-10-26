import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Vite configuration for ELANG Hub.
 *
 * SvelteKit 3 removed `svelte.config.js` — all framework configuration
 * is now passed through the `sveltekit(...)` plugin below.
 *
 * `tailwindcss()` is the Tailwind 4 Vite plugin. It resolves
 * `@import 'tailwindcss'` in the entry stylesheet before Vite's
 * own `@import` resolution kicks in, so the PostCSS pipeline
 * never sees a raw `tailwindcss` file path. Tailwind 4 dropped
 * the JS config in favour of CSS-first `@theme` directives; the
 * legacy `tailwind.config.js` is kept for compatibility with
 * `main` but Tailwind 4 ignores it unless the CSS file references
 * it with `@config`.
 */
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			/**
			 * SvelteKit 3 removed the built-in `$lib` alias. The
			 * `alias` option is the documented migration bridge and
			 * keeps the import surface identical to `main`, so the
			 * two lines can be reconciled without a 45-file rename.
			 */
			alias: { $lib: 'src/lib' },
			// Node containers bake in their browser-facing origin for URL construction
			// and CSRF checks. Cloudflare continues to derive it from the request.
			paths: {
				origin: process.env.BUILD_TARGET === 'node' ? process.env.HUB_ORIGIN : undefined
			},
			/**
			 * Deployment target.
			 *
			 * SvelteKit 3 builds exactly one adapter per invocation,
			 * so this single source tree ships to two runtimes from
			 * two scripts:
			 *
			 *   - `cloudflare` (default) — the v0.1.0 production target:
			 *     the Worker bundle that Cloudflare serves. Unchanged
			 *     by the Docker work; produced by `npm run build`.
			 *   - `node` — the container target: a standalone Node
			 *     HTTP server built with `@sveltejs/adapter-node` and
			 *     run by the Dockerfile. Selected by either
			 *     `BUILD_TARGET=node` (env, what CI uses) or
			 *     `npm run build:node` (which sets the env via the
			 *     npm-script prefix).
			 *
			 * The two adapters share all upstream SvelteKit/Vite
			 * configuration — CSP, preprocess, alias, Tailwind — so a
			 * change here is a single diff with one source of truth.
			 */
			adapter:
				process.env.BUILD_TARGET === 'node'
					? adapterNode({ out: 'build' })
					: adapterCloudflare({
							routes: {
								include: ['/*'],
								exclude: ['<all>']
							}
						}),
			/**
			 * H0502 — Content Security Policy.
			 *
			 * The Hub renders package-controlled strings (language
			 * names, IPA, romanization, diagnostic messages) that
			 * originate in an untrusted `.elang` archive. Svelte
			 * escapes them at the template layer, so they are inert
			 * as text — but a CSP is the belt-and-braces control that
			 * keeps a future rendering bug from becoming script
			 * execution.
			 *
			 * `script-src 'self'` forbids inline and third-party
			 * script entirely: SvelteKit injects its own bootstrap
			 * scripts with a per-request nonce (or a hash, when
			 * prerendered), so the app needs no `unsafe-inline`.
			 *
			 * `style-src` allows `'unsafe-inline'` because Svelte
			 * injects component styles inline. It is scoped to the
			 * document and does not permit script execution.
			 *
			 * `font-src` and `style-src` allow the Google Fonts
			 * origins the IPA typography stack (H0406) is served
			 * from. The `app.html` link is the only external
			 * stylesheet the app loads.
			 *
			 * `connect-src 'self'` restricts XHR/fetch targets to
			 * this origin — the page talks to `/api/phonemes` on the
			 * same origin and never to a third party.
			 *
			 * `object-src 'none'` and `frame-ancestors 'none'`
			 * forbid plugin content and embedding.
			 */
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'img-src': ['self', 'data:'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});
