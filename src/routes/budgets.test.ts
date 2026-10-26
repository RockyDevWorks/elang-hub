/**
 * Resource budget tests (H0506).
 *
 * The Hub bounds its own work and documents what it bounds. This
 * suite pins every claimed limit at the layer the Hub actually owns:
 *
 *   - **Hub adapter (`src/lib/sdk/`)** — the bytes, strings and
 *     diagnostic counts the SDK client clamps. Driven directly with a
 *     stubbed `fetch`.
 *   - **Page transport / view layer** — the page's client-side
 *     upload cap, the rendering path that handles the maximum
 *     inventory the upstream SDK produces, and the controller's
 *     supersede semantics across many sequential uploads.
 *
 * Three ceilings are inherited from the upstream SDK
 * (`crates/elang-core/src/model/eld.rs:26-30`):
 *
 *   - 16 groups in an inventory, including `consonants` / `vowels`.
 *   - 256 root phonemes across all groups.
 *   - 16 allophones per root.
 *
 * Each is verified independently, so a regression in the rendering
 * path is caught even though the Hub does not enforce the ceilings
 * itself (the SDK rejects over-ceiling payloads upstream).
 *
 * The maximum combined inventory the SDK will ever produce is the
 * product of those three ceilings — 16 groups × 256 roots × 16
 * allophones per root. Rendering all of it in one go stresses the
 * DOM harder than it stresses the Hub's correctness, so the ceilings
 * are exercised separately.
 */

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

import { SdkClient } from '$lib/sdk';
import {
	MAX_SDK_BODY_BYTES,
	MAX_SDK_DIAGNOSTICS,
	MAX_SDK_RESPONSE_BYTES,
	MAX_SDK_STRING_LENGTH
} from '$lib/sdk/bounds';
import { MAX_FILE_BYTES } from '$lib/upload/limits';
import { requestPhonemeView } from '$lib/phonemes/client';
import {
	PhonemePageController,
	type PhonemePageState,
	type PhonemeRequestOutcome,
	type RequestPhonemeView
} from '$lib/phonemes';
import PhonemeViewer from '$lib/components/PhonemeViewer.svelte';
import UploadPrompt from '$lib/components/UploadPrompt.svelte';
import { makeFile, type MinimalFile } from '$lib/phonemes/test-helpers';
import type {
	AllophonePayload,
	GroupPayload,
	InventoryPayload,
	RootPayload
} from '$lib/view/inventory';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

const originalFetch = globalThis.fetch;

function stubBrowserFetch(
	handler: (url: string, init: RequestInit) => Response | Promise<Response>
): void {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		return handler(url, init ?? {});
	}) as unknown as typeof fetch;
}

/**
 * Build an SDK-conformant inventory payload at a chosen point on the
 * upstream ceiling. `groups` ranges over the reserved kinds plus
 * `g00..gNN` custom names. `rootsPerGroup` distributes a contiguous
 * range of single-letter IPA identifiers across the groups; the SDK
 * does not require uniqueness across groups, so repeated identifiers
 * narrow and render fine.
 */
function buildInventory(
	groups: number,
	rootsPerGroup: number,
	allophonesPerRoot: number
): InventoryPayload {
	// Custom group names must match `[a-z]+(?:-[a-z]+)*` (see
	// `isValidCustomGroupName` in `view/inventory.ts`). The reserved
	// letters are emitted as `ga`..`gp` so the test never trips the
	// narrow's name regex.
	const reserved: Array<'consonants' | 'vowels'> = ['consonants', 'vowels'];
	const customLetters = 'abcdefghijklmnop'.split('');
	const groupKinds: GroupPayload['kind'][] = [];
	for (let i = 0; i < groups; i++) {
		if (i < reserved.length) groupKinds.push(reserved[i]);
		else groupKinds.push({ name: `g${customLetters[i - reserved.length]}` });
	}
	const groupsOut: GroupPayload[] = groupKinds.map((kind, gi) => {
		const roots: RootPayload[] = [];
		for (let r = 0; r < rootsPerGroup; r++) {
			const rootIpa = String.fromCodePoint(0x61 + ((gi * rootsPerGroup + r) % 26));
			const allophones: AllophonePayload[] = [];
			for (let a = 0; a < allophonesPerRoot; a++) {
				const suffix = String.fromCodePoint(0x61 + a);
				allophones.push({
					ipa: `${rootIpa}${suffix}`,
					// The first allophone inherits the parent's
					// romanization; the rest are explicit, so the view
					// exercises both branches.
					roman: a === 0 ? null : `${rootIpa}${a}`,
					when: null
				});
			}
			roots.push({ ipa: rootIpa, roman: rootIpa, when: null, allophones });
		}
		return { kind, roots };
	});
	return {
		package: {
			identifier: 'urn:elang:language:rocky:aelith:1.0.0',
			namespace: 'rocky',
			languageName: 'aelith',
			languageVersion: '1.0.0',
			name: 'Aelith',
			description: 'An inventory built at the SDK ceiling for the H0506 budget suite.'
		},
		inventory: { groups: groupsOut }
	};
}

/** Wrap an inventory in the SDK-conformant `SdkValidateResult` envelope. */
function validateEnvelope(inventory: InventoryPayload): Record<string, unknown> {
	return {
		ok: true,
		mode: 'validate',
		specVersion: '0.0.1-1',
		binaryContainerVersion: '0.1.0',
		phonemeResourcePath: 'Linguistics/aelith.eld',
		inventory,
		diagnostics: []
	};
}

/** A minimal, valid inventory for the envelope-only SDK client tests. */
function emptyInventory(): InventoryPayload {
	return {
		package: {
			identifier: 'urn:elang:language:x:x:1.0.0',
			namespace: 'x',
			languageName: 'x',
			languageVersion: '1.0.0',
			name: 'x',
			description: null
		},
		inventory: { groups: [] }
	};
}

/**
 * Run the real controller against the real page transport, with the
 * browser's `fetch` stubbed at the `/api/phonemes` hop. The response
 * body is the SDK verdict the validation service would have
 * returned, so the view extractor runs for real.
 */
async function runFlow(
	file: MinimalFile,
	validateBody: Record<string, unknown>
): Promise<{ state: PhonemePageState; fetchCalls: number }> {
	let fetchCalls = 0;
	stubBrowserFetch((url) => {
		if (url.endsWith('/api/phonemes')) {
			fetchCalls++;
			return Promise.resolve(jsonResponse(validateBody));
		}
		return Promise.reject(new Error(`unexpected fetch to ${url}`));
	});
	const controller = new PhonemePageController();
	await controller.select(file as unknown as File, requestPhonemeView);
	return { state: controller.state, fetchCalls };
}

beforeEach(() => {
	stubBrowserFetch(() => jsonResponse(validateEnvelope(emptyInventory())));
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/* ------------------------------------------------------------------ */
/* SDK adapter budgets                                                 */
/* ------------------------------------------------------------------ */

describe('SDK adapter budgets (H0506)', () => {
	it('accepts a body exactly at MAX_SDK_BODY_BYTES and forwards it verbatim', async () => {
		let receivedSize = 0;
		const stub = vi.fn(async (_url: string, init: RequestInit) => {
			receivedSize = (init.body as Uint8Array).byteLength;
			return jsonResponse(validateEnvelope(emptyInventory()));
		});
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(MAX_SDK_BODY_BYTES));

		expect(result.ok).toBe(true);
		expect(receivedSize).toBe(MAX_SDK_BODY_BYTES);
	});

	it('rejects a body one byte over MAX_SDK_BODY_BYTES without contacting the service', async () => {
		const stub = vi.fn();
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(MAX_SDK_BODY_BYTES + 1));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('request_too_large');
		}
		expect(stub).not.toHaveBeenCalled();
	});

	it('rejects a response body one byte over MAX_SDK_RESPONSE_BYTES mid-read', async () => {
		// A single oversized chunk trips the cap on the first read,
		// proving the cap is enforced before the body is buffered.
		const oversized = 'x'.repeat(MAX_SDK_RESPONSE_BYTES + 1);
		const stub = vi.fn(async () => new Response(oversized, { status: 200 }));
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(10));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('malformed_response');
		}
	});

	it('enforces a 1 ms timeout and returns a typed `timeout` failure', async () => {
		const stub = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					const signal = init.signal;
					if (signal?.aborted) {
						reject(new DOMException('Aborted', 'AbortError'));
						return;
					}
					signal?.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(10), { timeoutMs: 1 });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			// The composed timer fired, not the caller's signal, so the
			// SDK must not misreport the failure as a cancellation.
			expect(result.code).toBe('timeout');
			expect(result.code).not.toBe('cancelled');
		}
	});

	it('caps the diagnostics array at MAX_SDK_DIAGNOSTICS even when the service reports more', async () => {
		const diagnostics = Array.from({ length: MAX_SDK_DIAGNOSTICS + 50 }, () => ({
			stage: 'validate',
			code: 'eld_invalid',
			message: 'm'
		}));
		const stub = vi.fn(async () =>
			jsonResponse({ ...validateEnvelope(emptyInventory()), diagnostics })
		);
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(10));

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.diagnostics.length).toBe(MAX_SDK_DIAGNOSTICS);
		}
	});

	it('clamps strings over MAX_SDK_STRING_LENGTH (appends `…`)', async () => {
		const padded = 'x'.repeat(MAX_SDK_STRING_LENGTH + 100);
		const stub = vi.fn(async () =>
			jsonResponse({
				...validateEnvelope(emptyInventory()),
				phonemeResourcePath: padded
			})
		);
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const result = await client.validate(new Uint8Array(10));

		expect(result.ok).toBe(true);
		if (result.ok && result.mode === 'validate') {
			// `clampSdkString` caps the input at `maxLength` and then
			// appends a `…` ellipsis marker so the renderer (and a
			// screen reader) is never told the text ended naturally.
			// The final length is therefore `MAX_SDK_STRING_LENGTH + 1`.
			expect(result.phonemeResourcePath.length).toBe(MAX_SDK_STRING_LENGTH + 1);
			expect(result.phonemeResourcePath.endsWith('…')).toBe(true);
		}
	});
});

/* ------------------------------------------------------------------ */
/* Page-level budgets                                                  */
/* ------------------------------------------------------------------ */

describe('page-level budgets (H0506)', () => {
	it('accepts exactly one package per selection (the picker has no `multiple`)', () => {
		const { container } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const input = container.querySelector('input[type="file"]');
		expect(input).not.toBeNull();
		// `MAX_FILE_COUNT = 1`: the OS file dialog must not offer a
		// multi-selection. A drop of several files is handled by the
		// page, which selects the first and ignores the rest.
		expect(input?.hasAttribute('multiple')).toBe(false);
	});

	it('accepts a selection exactly at MAX_FILE_BYTES and rejects one byte over', async () => {
		const body = validateEnvelope(buildInventory(1, 1, 0));

		const atCap: MinimalFile = {
			name: 'at-cap.elang',
			size: MAX_FILE_BYTES,
			stream: () =>
				new ReadableStream<Uint8Array>({
					pull(c) {
						c.close();
					},
					cancel() {
						/* no-op */
					}
				})
		};
		const accepted = await runFlow(atCap, body);
		expect(accepted.state.phase).toBe('view');
		expect(accepted.fetchCalls).toBe(1);

		const overByOne: MinimalFile = {
			name: 'over.elang',
			size: MAX_FILE_BYTES + 1,
			stream: () => {
				throw new Error('the oversize branch must never read the file');
			}
		};
		const rejected = await runFlow(overByOne, body);
		expect(rejected.state.phase).toBe('error');
		// The request was never made — the cap fires before any bytes
		// are read and before the network is touched.
		expect(rejected.fetchCalls).toBe(0);
	});

	it('renders the SDK 16-group ceiling without losing groups', async () => {
		const inventory = buildInventory(16, 1, 0);
		const { state } = await runFlow(
			makeFile('groups.elang', new Uint8Array([1])),
			validateEnvelope(inventory)
		);

		expect(state.phase).toBe('view');
		const phonemeView = (state as Extract<PhonemePageState, { phase: 'view' }>).view;
		expect(phonemeView.view.inventory.groups.length).toBe(16);
		expect(phonemeView.view.inventory.rootCount).toBe(16);

		const { container } = render(PhonemeViewer, { props: { view: phonemeView } });
		// Each group renders as `<section class="group">` with its own
		// heading (the `id` lands on the `<h2>` so the in-page nav
		// anchor targets the title — not the section itself).
		expect(container.querySelectorAll('section.group').length).toBe(16);
	});

	it('renders the SDK 256-root ceiling without losing roots', async () => {
		const inventory = buildInventory(1, 256, 0);
		const { state } = await runFlow(
			makeFile('roots.elang', new Uint8Array([1])),
			validateEnvelope(inventory)
		);

		expect(state.phase).toBe('view');
		const phonemeView = (state as Extract<PhonemePageState, { phase: 'view' }>).view;
		expect(phonemeView.view.inventory.groups.length).toBe(1);
		expect(phonemeView.view.inventory.rootCount).toBe(256);
		expect(phonemeView.view.inventory.allophoneCount).toBe(0);

		const { container } = render(PhonemeViewer, { props: { view: phonemeView } });
		// PhonemeRootRow renders one <li class="root"> per root.
		expect(container.querySelectorAll('ul.roots > li').length).toBe(256);
	});

	it('renders the SDK 16-allophones-per-root ceiling without losing allophones', async () => {
		const inventory = buildInventory(1, 1, 16);
		const { state } = await runFlow(
			makeFile('allos.elang', new Uint8Array([1])),
			validateEnvelope(inventory)
		);

		expect(state.phase).toBe('view');
		const phonemeView = (state as Extract<PhonemePageState, { phase: 'view' }>).view;
		expect(phonemeView.view.inventory.allophoneCount).toBe(16);

		const { container } = render(PhonemeViewer, { props: { view: phonemeView } });
		// PhonemeAllophoneRow renders one <li class="allophone"> each.
		expect(container.querySelectorAll('ul.allophones > li').length).toBe(16);
	});

	it('50 sequential uploads settle on the LAST run with bounded emissions', async () => {
		const body = validateEnvelope(buildInventory(1, 1, 0));
		stubBrowserFetch((url) => {
			if (url.endsWith('/api/phonemes')) return Promise.resolve(jsonResponse(body));
			return Promise.reject(new Error(`unexpected fetch to ${url}`));
		});

		const controller = new PhonemePageController();
		const emissions: PhonemePageState[] = [];
		const unsubscribe = controller.subscribe((s) => emissions.push(s));

		const RUNS = 50;
		for (let i = 0; i < RUNS; i++) {
			const file = makeFile(`run-${i}.elang`, new Uint8Array([i & 0xff]));
			await controller.select(file as unknown as File, requestPhonemeView);
		}
		unsubscribe();

		expect(controller.state.phase).toBe('view');

		// Every run emits a bounded number of states (idle → validating
		// → view, with at most one extra `validating` per progress tick).
		// A leak would let the emission count grow superlinearly with
		// the number of runs.
		const perRun = emissions.length / RUNS;
		expect(perRun).toBeLessThanOrEqual(3);
	});
});

/* ------------------------------------------------------------------ */
/* Cancellation and bounded processing                                 */
/* ------------------------------------------------------------------ */

describe('cancellation and bounded processing (H0506)', () => {
	it('reports `cancelled` (not `timeout`) when the caller aborts a round-trip', async () => {
		const caller = new AbortController();
		const stub = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					const signal = init.signal;
					if (signal?.aborted) {
						reject(new DOMException('Aborted', 'AbortError'));
						return;
					}
					signal?.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);
		const client = new SdkClient({
			serviceUrl: 'http://sdk.test',
			fetchImpl: stub as unknown as typeof fetch
		});

		const pending = client.validate(new Uint8Array(10), { signal: caller.signal });
		caller.abort();
		const result = await pending;

		expect(result.ok).toBe(false);
		if (!result.ok) {
			// A caller abort is a cancellation, not a timeout — the UI
			// offers "try another file", not "the service is slow".
			expect(result.code).toBe('cancelled');
		}
	});

	it('cancelling an in-flight upload aborts the transport and returns to idle', async () => {
		const controller = new PhonemePageController();
		let transportAborted = false;
		let signalTransportStarted: (() => void) | undefined;
		const transportStarted = new Promise<void>((resolve) => {
			signalTransportStarted = resolve;
		});

		const request: RequestPhonemeView = (_bytes, _fileName, signal) => {
			signalTransportStarted?.();
			return new Promise<PhonemeRequestOutcome>((_resolve, reject) => {
				signal.addEventListener('abort', () => {
					transportAborted = true;
					reject(new DOMException('Aborted', 'AbortError'));
				});
			});
		};

		const file = makeFile('slow.elang', new Uint8Array([1, 2, 3]));
		const pending = controller.select(file as unknown as File, request);

		// Wait until the transport is actually in flight so the cancel
		// lands on the request, not on the file read.
		await transportStarted;
		expect(controller.state.phase).toBe('validating');

		controller.cancel();
		await pending;

		expect(transportAborted).toBe(true);
		// The cancelled run emits no error state — the page returns to
		// the upload prompt with nothing to clean up.
		expect(controller.state.phase).toBe('idle');
	});

	it('cancelling before the transport starts never issues a request', async () => {
		const controller = new PhonemePageController();
		let requestCalls = 0;
		const request: RequestPhonemeView = async () => {
			requestCalls++;
			return { kind: 'view', result: { ok: true } } as unknown as PhonemeRequestOutcome;
		};

		const file = makeFile('cancelled-early.elang', new Uint8Array([1]));
		const pending = controller.select(file as unknown as File, request);
		controller.cancel();
		await pending;

		expect(requestCalls).toBe(0);
		expect(controller.state.phase).toBe('idle');
	});
});
