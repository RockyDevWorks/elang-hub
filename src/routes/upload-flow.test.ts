/**
 * Complete upload-to-viewer integration tests (H0505).
 *
 * Every other suite in the repo tests one seam at a time:
 *
 *   - `controller.test.ts` drives the page state machine with
 *     pre-built outcomes.
 *   - `client.test.ts` drives the page transport with a stub `fetch`.
 *   - `server.test.ts` drives the endpoint with a stubbed `SdkClient`.
 *
 * None of them exercises the chain as a user actually triggers it, and
 * none of them uses a fixture that comes from the SDK contract. This
 * suite closes that gap by wiring the real pieces together:
 *
 *   file selection
 *     → `PhonemePageController`      (real)
 *     → `requestPhonemeView`         (real page transport)
 *     → `POST /api/phonemes`         (real endpoint handler)
 *     → `SdkClient.validate`         (real SDK client)
 *     → validation service           (stubbed at the HTTP boundary)
 *     → `extractPhonemeView`         (real view extractor)
 *     → `PhonemeViewer.svelte`       (real component, rendered)
 *
 * The only stub is at the two network boundaries: the browser's
 * `fetch` and the validation service's `fetch`. The browser-side stub
 * routes into the real endpoint handler, so the endpoint, the SDK
 * client, the SDK contract and the view extractor all run for real.
 *
 * The fixtures are the two kinds H0505 calls for:
 *
 *   - **SDK-conformant** — a payload that satisfies every clause of
 *     `SdkValidateResult` and narrows cleanly to an `InventoryPayload`.
 *   - **malicious** — a service that lies, truncates, misreports its
 *     stage, returns hostile strings, or goes away mid-flight.
 *
 * Every failure stage of the pipeline is exercised, and each one
 * asserts the user-visible outcome, not just an internal code.
 */

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

/**
 * The endpoint reads `SDK_SERVICE_URL` from the adapter-neutral
 * runtime env. Mock it with a live getter so the value is read at
 * request time, exactly as the real binding behaves.
 */
const envMock: Record<string, string | undefined> = { SDK_SERVICE_URL: 'http://sdk.test' };
vi.mock('$app/env/private', () => ({
	get SDK_SERVICE_URL() {
		return envMock.SDK_SERVICE_URL;
	}
}));

import { POST } from './api/phonemes/+server';
import { requestPhonemeView } from '$lib/phonemes/client';
import {
	PhonemePageController,
	type PhonemePageError,
	type PhonemePageState,
	type PhonemePageValidating,
	type PhonemePageView
} from '$lib/phonemes';
import PhonemeViewer from '$lib/components/PhonemeViewer.svelte';
import { makeBrokenFile, makeFile, type MinimalFile } from '$lib/phonemes/test-helpers';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

const originalFetch = globalThis.fetch;

/** Handler for the browser → Hub hop. Defaults to the real endpoint. */
let browserHandler: FetchHandler = (_url, init) => callEndpoint(init);

/** Handler for the Hub → validation service hop. */
let sdkHandler: FetchHandler = () => jsonResponse(conformantSdkResult());

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/**
 * Route a browser-side fetch into the real endpoint handler.
 *
 * `error(status, body)` from `@sveltejs/kit` THROWS inside a handler;
 * the framework's request pipeline is what turns the throw into a
 * response. This helper reproduces that conversion so the page sees
 * the same status codes it would in production.
 */
async function callEndpoint(init: RequestInit): Promise<Response> {
	const request = new Request('http://localhost/api/phonemes', {
		method: 'POST',
		body: init.body as BodyInit | undefined,
		headers: init.headers as HeadersInit | undefined,
		signal: init.signal ?? undefined
	});
	try {
		return await POST({ request } as never);
	} catch (e) {
		const status =
			typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number'
				? (e as { status: number }).status
				: 500;
		const rawBody = (e as { body?: unknown }).body;
		const body =
			typeof rawBody === 'object' && rawBody !== null
				? rawBody
				: { message: 'The request could not be processed.' };
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	}
}

beforeEach(() => {
	envMock.SDK_SERVICE_URL = 'http://sdk.test';
	browserHandler = (_url, init) => callEndpoint(init);
	sdkHandler = () => jsonResponse(conformantSdkResult());

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const requestInit: RequestInit = init ?? {};
		if (url.endsWith('/api/phonemes')) {
			return browserHandler(url, requestInit);
		}
		return sdkHandler(url, requestInit);
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** Run the real controller against the real transport, end to end. */
async function runFlow(file: MinimalFile): Promise<PhonemePageState> {
	const controller = new PhonemePageController();
	await controller.select(file as unknown as File, requestPhonemeView);
	return controller.state;
}

/** Drain microtasks until `predicate` holds — no wall-clock sleeps. */
async function flushUntil(predicate: () => boolean, maxTicks = 100): Promise<void> {
	for (let i = 0; i < maxTicks; i++) {
		await Promise.resolve();
		if (predicate()) return;
	}
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * An SDK-conformant `validate` verdict.
 *
 * Every field satisfies the `SdkValidateResult` contract, and the
 * inventory payload satisfies every clause of `narrowInventoryPayload`:
 * the URN prefix, the SemVer shape, the reserved group kinds, the
 * custom group name grammar, and the condition tree shape.
 */
function conformantSdkResult(): Record<string, unknown> {
	return {
		ok: true,
		mode: 'validate',
		specVersion: '0.0.1-1',
		binaryContainerVersion: '0.1.0',
		phonemeResourcePath: 'Linguistics/aelith.eld',
		inventory: {
			package: {
				identifier: 'urn:elang:language:rocky:aelith:1.0.0',
				namespace: 'rocky',
				languageName: 'aelith',
				languageVersion: '1.0.0',
				name: 'Aelith',
				description: 'A language used by the H0505 integration suite.'
			},
			inventory: {
				groups: [
					{
						kind: 'consonants',
						roots: [
							{
								ipa: 'p',
								roman: 'p',
								when: null,
								allophones: [
									{ ipa: 'pʰ', roman: 'ph', when: null },
									{ ipa: 'pʰ', roman: null, when: null }
								]
							},
							{ ipa: 't', roman: 't', when: null, allophones: [] }
						]
					},
					{
						kind: 'vowels',
						roots: [
							{
								ipa: 'a',
								roman: 'a',
								when: {
									children: [
										{
											kind: 'predicate',
											predicate: { kind: 'word-position', value: 'initial' }
										}
									]
								},
								allophones: []
							}
						]
					},
					{
						kind: { name: 'clicks' },
						roots: [
							{
								ipa: 'ʘ',
								roman: 'ǀ',
								when: null,
								allophones: [
									{
										ipa: 'ʘ',
										roman: null,
										when: {
											children: [
												{
													kind: 'predicate',
													predicate: { kind: 'syllable-position', value: 'onset' }
												}
											]
										}
									}
								]
							}
						]
					}
				]
			}
		},
		diagnostics: []
	};
}

/** An SDK-conformant failure verdict at a given stage. */
function sdkFailureAt(stage: 'inspect' | 'verify' | 'validate'): Record<string, unknown> {
	const codes = {
		inspect: 'malformed_container',
		verify: 'integrity_check_failed',
		validate: 'eld_invalid'
	} as const;
	return {
		ok: false,
		stage,
		code: codes[stage],
		message: `The package failed at the ${stage} stage.`,
		diagnostics: []
	};
}

/* ------------------------------------------------------------------ */
/* The success path                                                    */
/* ------------------------------------------------------------------ */

describe('upload-to-viewer flow (H0505)', () => {
	it('carries an SDK-conformant package from selection through to the rendered viewer', async () => {
		const state = await runFlow(makeFile('aelith.elang', new Uint8Array([1, 2, 3, 4])));

		expect(state.phase).toBe('view');
		const page = state as PhonemePageView;
		expect(page.fileName).toBe('aelith.elang');
		expect(page.fileSize).toBe(4);

		const view = page.view;
		expect(view.ok).toBe(true);
		expect(view.view.package.name).toBe('Aelith');
		expect(view.view.package.identifier).toBe('urn:elang:language:rocky:aelith:1.0.0');
		expect(view.view.phonemeResourcePath).toBe('Linguistics/aelith.eld');

		// The inventory survived the whole chain: three groups, four
		// roots, three allophones, and the canonical group order.
		expect(view.view.inventory.isEmpty).toBe(false);
		expect(view.view.inventory.rootCount).toBe(4);
		expect(view.view.inventory.allophoneCount).toBe(3);
		expect(view.view.inventory.groups.map((g) => g.displayName)).toEqual([
			'consonants',
			'vowels',
			'clicks'
		]);

		// And the real component renders it.
		const { getByRole, container } = render(PhonemeViewer, { props: { view } });
		expect(getByRole('heading', { level: 1 }).textContent).toBe('Aelith');
		expect(container.textContent).toContain('pʰ');
		// The custom group slug is title-cased for display.
		expect(container.textContent).toContain('Clicks');
	});

	it('resolves an allophone romanization inherited from its parent root', async () => {
		const state = await runFlow(makeFile('inherit.elang', new Uint8Array([1])));
		const page = state as PhonemePageView;
		const clicks = page.view.view.inventory.groups.find((g) => g.displayName === 'clicks');
		const root = clicks?.roots[0];
		expect(root?.roman).toBe('ǀ');
		// `roman: null` in the payload means "inherit the parent's".
		expect(root?.allophones[0]?.roman).toBe('ǀ');
		expect(root?.allophones[0]?.romanKind.kind).toBe('inherited');
	});

	it('forwards the package bytes to the validation service verbatim', async () => {
		const seen: Uint8Array[] = [];
		sdkHandler = (_url, init) => {
			seen.push(init.body as Uint8Array);
			return jsonResponse(conformantSdkResult());
		};

		await runFlow(makeFile('bytes.elang', new Uint8Array([9, 8, 7, 6, 5])));

		expect(seen).toHaveLength(1);
		expect(Array.from(seen[0] ?? [])).toEqual([9, 8, 7, 6, 5]);
	});
});

/* ------------------------------------------------------------------ */
/* The browser-side stages                                             */
/* ------------------------------------------------------------------ */

describe('upload flow — browser-side stages (H0505)', () => {
	it('rejects an oversized selection before reading a byte or making a request', async () => {
		let networkCalls = 0;
		browserHandler = () => {
			networkCalls++;
			return jsonResponse(conformantSdkResult());
		};

		const oversized: MinimalFile = {
			name: 'huge.elang',
			size: 16 * 1024 * 1024 + 1,
			stream: () => {
				throw new Error('the oversize branch must never read the file');
			}
		};
		const state = await runFlow(oversized);

		expect(state.phase).toBe('error');
		const error = state as PhonemePageError;
		expect(error.error.title).toBe('That package is too large');
		expect(error.error.message).toContain('16');
		expect(networkCalls).toBe(0);
	});

	it('surfaces a local read failure without contacting the service', async () => {
		let networkCalls = 0;
		browserHandler = () => {
			networkCalls++;
			return jsonResponse(conformantSdkResult());
		};

		const state = await runFlow(makeBrokenFile('broken.elang', 100));

		expect(state.phase).toBe('error');
		expect((state as PhonemePageError).error.title).toBe('Could not read the file');
		expect(networkCalls).toBe(0);
	});

	it('returns to idle when the user cancels while the request is in flight', async () => {
		// The Hub endpoint is slow. Cancelling must abort the browser
		// request and leave the page idle — not in an error state.
		browserHandler = (_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init.signal;
				if (signal?.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}
				signal?.addEventListener('abort', () => {
					reject(new DOMException('Aborted', 'AbortError'));
				});
			});

		const controller = new PhonemePageController();
		const promise = controller.select(
			makeFile('slow.elang', new Uint8Array([1, 2, 3])) as unknown as File,
			requestPhonemeView
		);

		await flushUntil(() => controller.state.phase === 'validating');
		(controller.state as PhonemePageValidating).cancel();
		await promise;

		expect(controller.state.phase).toBe('idle');
	});
});

/* ------------------------------------------------------------------ */
/* The service-level stages                                            */
/* ------------------------------------------------------------------ */

interface ServiceFailureCase {
	readonly name: string;
	readonly handler: FetchHandler;
	readonly expectedTitle: string;
	readonly expectedMessage: string;
}

const serviceFailureCases: readonly ServiceFailureCase[] = [
	{
		name: 'the service rejects the package at the inspect stage',
		handler: () => jsonResponse(sdkFailureAt('inspect')),
		expectedTitle: 'Package structure invalid',
		expectedMessage: 'not a valid ELANG package'
	},
	{
		name: 'the service rejects the package at the verify stage',
		handler: () => jsonResponse(sdkFailureAt('verify')),
		expectedTitle: 'Integrity check failed',
		expectedMessage: 'failed integrity verification'
	},
	{
		name: 'the service rejects the package at the validate stage',
		handler: () => jsonResponse(sdkFailureAt('validate')),
		expectedTitle: 'Validation failed',
		expectedMessage: 'phoneme inventory (ELD) is invalid'
	},
	{
		name: 'the service is unreachable',
		handler: () => {
			throw new TypeError('Failed to fetch');
		},
		expectedTitle: 'Validation service unavailable',
		expectedMessage: 'validation service is currently unavailable'
	},
	{
		name: 'the service answers 503',
		handler: () => new Response('upstream down', { status: 503 }),
		expectedTitle: 'Validation service unavailable',
		expectedMessage: 'validation service is currently unavailable'
	},
	{
		name: 'the service times out',
		handler: () => new Response('gateway timeout', { status: 504 }),
		expectedTitle: 'Validation timed out',
		expectedMessage: 'took too long to validate'
	},
	{
		name: 'the service reports the request as too large',
		handler: () => new Response('too large', { status: 413 }),
		expectedTitle: 'Package too large',
		expectedMessage: 'larger than the 16 MiB limit'
	},
	{
		name: 'the service returns a body that is not JSON',
		handler: () => new Response('<html>proxy error</html>', { status: 200 }),
		expectedTitle: 'Unexpected failure',
		expectedMessage: 'internal error prevented validation'
	},
	{
		name: 'the service returns a JSON value that is not an object',
		handler: () => jsonResponse('not-a-result'),
		expectedTitle: 'Unexpected failure',
		expectedMessage: 'internal error prevented validation'
	},
	{
		name: 'the service returns a result with no ok flag',
		handler: () => jsonResponse({ mode: 'validate' }),
		expectedTitle: 'Unexpected failure',
		expectedMessage: 'internal error prevented validation'
	},
	{
		name: 'the service reports an unsupported spec version',
		handler: () =>
			jsonResponse({
				ok: false,
				stage: 'inspect',
				code: 'unsupported_spec_version',
				message: 'Unsupported spec version.',
				diagnostics: []
			}),
		expectedTitle: 'Unsupported package version',
		expectedMessage: 'version that ELANG Hub v0.1.0 does not support'
	},
	{
		name: 'the service claims success but sends an inventory that is not an object',
		handler: () =>
			jsonResponse({
				...conformantSdkResult(),
				inventory: 'not-an-object'
			}),
		expectedTitle: 'Could not read the validated inventory',
		expectedMessage: 'could not be read'
	}
];

describe('upload flow — validation-service stages (H0505)', () => {
	for (const testCase of serviceFailureCases) {
		it(`surfaces the failure when ${testCase.name}`, async () => {
			sdkHandler = testCase.handler;

			const state = await runFlow(makeFile('bad.elang', new Uint8Array([1, 2, 3])));

			expect(state.phase).toBe('error');
			const error = state as PhonemePageError;
			expect(error.error.title).toBe(testCase.expectedTitle);
			expect(error.error.message.toLowerCase()).toContain(testCase.expectedMessage.toLowerCase());
		});
	}
});

/* ------------------------------------------------------------------ */
/* Hostile content                                                     */
/* ------------------------------------------------------------------ */

describe('upload flow — hostile content (H0505)', () => {
	it('renders a hostile advisory as text, never as markup', async () => {
		sdkHandler = () =>
			jsonResponse({
				...conformantSdkResult(),
				diagnostics: [
					{
						stage: 'validate',
						code: 'eld_invalid',
						message: '<script>globalThis.__pwned = true;</script>'
					}
				]
			});

		const state = await runFlow(makeFile('hostile.elang', new Uint8Array([1])));
		expect(state.phase).toBe('view');

		const page = state as PhonemePageView;
		const { container } = render(PhonemeViewer, { props: { view: page.view } });

		// The advisory is present as literal text…
		expect(container.textContent).toContain('<script>globalThis.__pwned = true;</script>');
		// …and no script element was created from it.
		expect(container.querySelector('script')).toBeNull();
		expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
	});

	it('drops an advisory whose message is not a string rather than rendering it', async () => {
		sdkHandler = () =>
			jsonResponse({
				...conformantSdkResult(),
				diagnostics: [
					{ stage: 'validate', code: 'eld_invalid', message: { nested: true } },
					{ stage: 'validate', code: 'eld_invalid', message: 'a real advisory' }
				]
			});

		const state = await runFlow(makeFile('odd.elang', new Uint8Array([1])));
		expect(state.phase).toBe('view');

		const page = state as PhonemePageView;
		expect(page.view.view.diagnostics).toHaveLength(1);
		expect(page.view.view.diagnostics[0]?.message).toBe('a real advisory');

		const { container } = render(PhonemeViewer, { props: { view: page.view } });
		expect(container.textContent).toContain('a real advisory');
	});

	it('bounds an advisory message that the service padded out', async () => {
		const padded = 'x'.repeat(5000);
		sdkHandler = () =>
			jsonResponse({
				...conformantSdkResult(),
				diagnostics: [{ stage: 'validate', code: 'eld_invalid', message: padded }]
			});

		const state = await runFlow(makeFile('padded.elang', new Uint8Array([1])));
		expect(state.phase).toBe('view');

		const page = state as PhonemePageView;
		const message = page.view.view.diagnostics[0]?.message ?? '';
		expect(message.length).toBeLessThan(padded.length);
		expect(message.endsWith('…')).toBe(true);
	});
});
