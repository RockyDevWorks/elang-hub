/**
 * Environment variables (SvelteKit 3).
 *
 * SvelteKit 3 replaced `$env/dynamic/private` with a typed,
 * explicit list of named imports from `$app/env/private`. The list
 * is declared here and consumed by the endpoint. SvelteKit's
 * `svelte-kit sync` step reads this file, generates a server-only
 * accessor module under `.svelte-kit/generated/env/private/`, and
 * injects the values from the runtime environment.
 *
 * `schema` is a function rather than a Standard-Schema validator
 * here because we want the absent-value path to be a typed
 * `string | undefined`, not a thrown startup error. The endpoint
 * reports 503 when the URL is unconfigured — that is louder and
 * more useful than failing to boot. The SDK service URL is a
 * deployment setting; an empty deployment must still serve the
 * static page even though validation is unavailable.
 */
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	/**
	 * Base URL of the ELANG SDK validation service (REQ-HUB-003).
	 * The browser page never sees this value — it lives in the
	 * server-side endpoint that proxies opaque package bytes.
	 */
	SDK_SERVICE_URL: {
		// `static: false` (default) → value read at app start from
		// `process.env` (Node) or platform bindings (Cloudflare).
		schema: (value) => value
	}
});
