/**
 * App-wide ambient type declarations.
 *
 * The Hub v0.1.0 has no per-request locals and ships no page data,
 * so `App.Locals` and `App.PageData` are intentionally empty. The
 * server endpoint reads runtime configuration through SvelteKit's
 * `$env/dynamic/private` (adapter-neutral: `process.env` under Node,
 * Cloudflare platform bindings in production), so we do not need
 * to extend `App.Platform` here.
 *
 * If a future phase adds per-request state (auth, session, request
 * id), populate `App.Locals` and document the contract.
 */

declare global {
	namespace App {
		// interface Error {}
		// SvelteKit requires `Locals` and `PageData` to be declared
		// for `event.locals` and `data` to type-check. They are
		// intentionally empty in v0.1.0 — the Hub has no per-request
		// locals and ships no page data. The `// eslint-disable-next-line`
		// on the immediately-following lines is required because
		// `no-empty-object-type` rejects empty interfaces.
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface Locals {}
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
