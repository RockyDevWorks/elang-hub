/**
 * Shared harness for the route-level page suites.
 *
 * `src/routes/upload-flow.test.ts` (H0505) and
 * `src/routes/budgets.test.ts` (H0506) both wire the real
 * `PhonemePageController` end-to-end and stub `fetch` at the
 * browser hop. Without a shared harness the two suites duplicated
 * the JSON response constructor, the fetch-stub install/restore
 * and the SDK envelope shell — SonarCloud's duplication gate
 * flagged the overlap at 3.2% of new code.
 *
 * The harness is intentionally small: only the helpers the two
 * suites genuinely need in common. Anything used by one suite
 * belongs in that suite, not here — a bigger shared surface makes
 * the next change riskier because every edit to the harness
 * affects every suite.
 *
 * The module is plain test infrastructure. It is not itself a test
 * (no `.test.` in the filename) so Vitest does not run it; it
 * sits under `src/lib` so the coverage report includes it. The
 * privacy-audit scan treats it as shipped code — so this file is
 * written to satisfy every rule that scan enforces: no logging, no
 * client-side storage, no beacon or socket, no filesystem access,
 * and no hardcoded third-party fetch URL. All it does is install and
 * restore `globalThis.fetch`.
 */

import type { InventoryPayload } from '../view/inventory';
import type { SdkDiagnostic } from '../sdk/contract';

/** A minimal `Response` carrying a JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** A handler that the harness dispatches a browser `fetch` call to. */
export type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

/**
 * Install a `fetch` stub that delegates every call to `handler`.
 *
 * Returns a `restore` function that puts the original `fetch` back.
 * Tests typically stash the restore in `beforeEach` and invoke it
 * in `afterEach`, so a leaked test never escapes into the next one.
 */
export function stubBrowserFetch(handler: FetchHandler): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		return handler(url, init ?? {});
	}) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

/** A minimal but valid package block — passes `narrowPackage` exactly. */
const EMPTY_PACKAGE = {
	identifier: 'urn:elang:language:x:x:1.0.0',
	namespace: 'x',
	languageName: 'x',
	languageVersion: '1.0.0',
	name: 'x',
	description: null
} as const;

/** The supported wire versions — pinned by the SDK contract tests. */
const SPEC_VERSIONS = {
	specVersion: '0.0.1-1' as const,
	binaryContainerVersion: '0.1.0' as const
};

/** The default resource path for tests that do not exercise that field. */
export const DEFAULT_RESOURCE_PATH = 'Linguistics/aelith.eld';

/** An empty-but-conformant inventory payload. */
export function emptyInventory(): InventoryPayload {
	return { package: EMPTY_PACKAGE, inventory: { groups: [] } };
}

/** Optional fields the suite may want to vary on the validate envelope. */
export interface EnvelopeOptions {
	readonly phonemeResourcePath?: string;
	readonly diagnostics?: readonly SdkDiagnostic[];
}

/**
 * Wrap an inventory in the SDK-conformant `SdkValidateResult` envelope.
 *
 * The envelope is the shape `parseSdkResult` accepts; the envelope
 * builder used to live in each route-level suite, duplicated. Centralising
 * it here means a change to the envelope shape (a new required field, a
 * renamed key) is a single edit instead of two.
 */
export function validateEnvelope(
	inventory: InventoryPayload,
	opts: EnvelopeOptions = {}
): Record<string, unknown> {
	return {
		ok: true,
		mode: 'validate',
		...SPEC_VERSIONS,
		phonemeResourcePath: opts.phonemeResourcePath ?? DEFAULT_RESOURCE_PATH,
		inventory,
		diagnostics: opts.diagnostics ?? []
	};
}
