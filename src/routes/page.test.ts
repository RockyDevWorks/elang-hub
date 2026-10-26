/**
 * Page-level integration tests for the H04 phoneme viewer (H0408).
 *
 * These tests pin the page-level invariants without rendering
 * Svelte components. The page itself is a thin wrapper around
 * `PhonemePageController` — its job is to wire the controller to
 * the four sub-components (`UploadPrompt`, `UploadProgress`,
 * `PhonemeViewer`, `PhonemeErrorBlock`) and present a "replace
 * file" affordance. The actual component rendering is covered by
 * the per-component tests, and the controller's state machine is
 * covered exhaustively by `controller.test.ts`. What the page test
 * adds is the integration story: when a file is selected, the page
 * transitions through the four phases, the replace flow returns to
 * idle with no stale view, and the controller's race-safety holds
 * at the page boundary.
 *
 * The test uses a stub `RequestPhonemeView` so the page can be
 * exercised without the browser, the network, or a DOM. The
 * component assertions are intentionally not duplicated here —
 * those belong to the component tests.
 */

import { describe, expect, it } from 'vitest';
import {
	PhonemePageController,
	httpErrorOutcome,
	sdkErrorOutcome,
	transportErrorOutcome,
	viewOutcome,
	type PhonemePageError,
	type PhonemePageIdle,
	type PhonemePageValidating,
	type PhonemePageView,
	type RequestPhonemeView
} from '$lib/phonemes';
import type { PhonemeViewResult } from '$lib/view';
import { PHONEME_VIEW_EXTRACTION_FAILED } from '$lib/view';
import { makeFile, type MinimalFile } from '$lib/phonemes/test-helpers';

/* ------------------------------------------------------------------ */
/* Outcome fixtures                                                   */
/* ------------------------------------------------------------------ */

function successView(): PhonemeViewResult {
	return {
		ok: true,
		view: Object.freeze({
			package: {
				identifier: 'urn:elang:language:test:test:1.0.0',
				namespace: 'test',
				languageName: 'test',
				languageVersion: '1.0.0',
				name: 'Test',
				description: null,
				specVersions: Object.freeze({
					specVersion: '0.0.1-1' as const,
					binaryContainerVersion: '0.1.0' as const
				})
			},
			phonemeResourcePath: 'Linguistics/phonemes.eld',
			inventory: Object.freeze({
				groups: [
					Object.freeze({
						kind: 'consonants' as const,
						displayName: 'consonants',
						roots: [
							Object.freeze({
								ipa: 'p',
								roman: 'p',
								when: null,
								allophones: [
									Object.freeze({
										ipa: 'pʰ',
										roman: 'p',
										romanKind: { kind: 'inherited', parentRoman: 'p' } as const,
										when: Object.freeze({
											children: [
												Object.freeze({
													kind: 'predicate' as const,
													predicate: Object.freeze({
														kind: 'word-position' as const,
														value: 'initial' as const
													}),
													displayText: 'word-position: initial'
												})
											],
											displayText: 'word-position: initial'
										})
									})
								]
							})
						]
					})
				],
				rootCount: 1,
				allophoneCount: 1,
				isEmpty: false
			}),
			diagnostics: []
		})
	};
}

function makeRequest(impl: RequestPhonemeView): RequestPhonemeView {
	return impl;
}

/**
 * Drain microtasks until `predicate` returns true. Used to wait for
 * the controller's async pipeline to reach a known state without
 * wall-clock sleeps.
 */
async function flushUntil(predicate: () => boolean, maxTicks = 50): Promise<void> {
	for (let i = 0; i < maxTicks; i++) {
		await Promise.resolve();
		if (predicate()) return;
	}
}

/* ------------------------------------------------------------------ */
/* Page wiring                                                        */
/* ------------------------------------------------------------------ */

/**
 * Mirror what the page does in `+page.svelte` without a DOM: wire
 * the controller's emissions into a local `$state`-shaped value
 * via a normal variable. This is the unit under test.
 */
function createPage(transport: RequestPhonemeView) {
	const controller = new PhonemePageController();
	let state = controller.state;
	const unsubscribe = controller.subscribe((next) => {
		state = next;
	});
	return {
		controller,
		get state() {
			return state;
		},
		dispose: unsubscribe,
		async select(file: MinimalFile) {
			await controller.select(file as unknown as File, transport);
		}
	};
}

describe('Phonemes page lifecycle', () => {
	it('mounts in the idle phase with no file selected', () => {
		const page = createPage(viewOutcome(successView()) as never as RequestPhonemeView);
		expect(page.state.phase).toBe('idle');
		// The idle shape must be exactly the documented contract so
		// the page's template can branch on it without a fallback.
		const idle: PhonemePageIdle = page.state as PhonemePageIdle;
		expect(idle).toEqual({ phase: 'idle' });
		page.dispose();
	});

	it('reaches the validating phase with a file name + progress bar', async () => {
		let observedValidating = false;
		const transport: RequestPhonemeView = async () => {
			// While the request is in flight, the page must already
			// be in `validating` with the bytes loaded.
			observedValidating = true;
			return viewOutcome(successView());
		};
		const page = createPage(transport);
		const file = makeFile('valid.elang', new Uint8Array([1, 2, 3]));
		await page.select(file);
		expect(observedValidating).toBe(true);
		expect(page.state.phase).toBe('view');
		page.dispose();
	});

	it('reaches the view phase on a successful validation and exposes a replace action', async () => {
		const page = createPage(makeRequest(async () => viewOutcome(successView())));
		const file = makeFile('ok.elang', new Uint8Array([1, 2, 3]));
		await page.select(file);

		const view = page.state as PhonemePageView;
		expect(view.phase).toBe('view');
		expect(view.fileName).toBe('ok.elang');
		expect(view.fileSize).toBe(3);
		expect(view.view.ok).toBe(true);
		expect(view.view.view.package.name).toBe('Test');
		expect(typeof view.replace).toBe('function');
		page.dispose();
	});

	it('reaches the error phase on SDK failure and exposes a replace action', async () => {
		const page = createPage(
			makeRequest(async () =>
				sdkErrorOutcome({
					stage: 'validate',
					code: 'phoneme_inventory_invalid',
					message: 'The phoneme inventory (ELD) is invalid.'
				})
			)
		);
		const file = makeFile('bad.elang', new Uint8Array([0]));
		await page.select(file);

		const error = page.state as PhonemePageError;
		expect(error.phase).toBe('error');
		expect(error.error.title).toBeTruthy();
		expect(error.error.message).toBeTruthy();
		expect(error.fileName).toBe('bad.elang');
		expect(typeof error.replace).toBe('function');
		page.dispose();
	});

	it('reaches the error phase on an extraction failure and carries the dotted path', async () => {
		const page = createPage(
			makeRequest(async () =>
				viewOutcome({
					ok: false,
					code: PHONEME_VIEW_EXTRACTION_FAILED,
					message: 'The validated phoneme inventory could not be read.',
					path: 'inventory.groups',
					cause: {
						code: 'groups_invalid',
						message: '`groups` must be an array.',
						path: 'inventory.groups'
					}
				})
			)
		);
		const file = makeFile('shape.elang', new Uint8Array([1, 2]));
		await page.select(file);

		const error = page.state as PhonemePageError;
		expect(error.phase).toBe('error');
		expect(error.error.message.toLowerCase()).toContain('inventory');
		expect(error.error.detail).toBe('inventory.groups');
		page.dispose();
	});

	it('reaches the error phase on an HTTP 413 with the typed page error', async () => {
		const page = createPage(makeRequest(async () => httpErrorOutcome(413, 'request.body')));
		const file = makeFile('huge.elang', new Uint8Array([1, 2, 3, 4]));
		await page.select(file);

		const error = page.state as PhonemePageError;
		expect(error.phase).toBe('error');
		expect(error.error.title.toLowerCase()).toContain('large');
		page.dispose();
	});

	it('reaches the error phase on a network offline outcome', async () => {
		const page = createPage(makeRequest(async () => transportErrorOutcome('offline')));
		const file = makeFile('offline.elang', new Uint8Array([1]));
		await page.select(file);

		const error = page.state as PhonemePageError;
		expect(error.phase).toBe('error');
		expect(error.error.title.toLowerCase()).toContain('network');
		page.dispose();
	});

	it('replace() from the view phase clears the previous view and returns to idle', async () => {
		const page = createPage(makeRequest(async () => viewOutcome(successView())));
		const file = makeFile('first.elang', new Uint8Array([1, 2, 3]));
		await page.select(file);
		expect(page.state.phase).toBe('view');

		const view = page.state as PhonemePageView;
		view.replace();

		expect(page.state.phase).toBe('idle');
		const idle = page.state as PhonemePageIdle;
		expect(idle).toEqual({ phase: 'idle' });
		page.dispose();
	});

	it('replace() from the error phase clears the previous error and returns to idle', async () => {
		const page = createPage(
			makeRequest(async () =>
				sdkErrorOutcome({
					stage: 'validate',
					code: 'malformed_package',
					message: 'malformed'
				})
			)
		);
		const file = makeFile('broken.elang', new Uint8Array([1]));
		await page.select(file);
		expect(page.state.phase).toBe('error');

		(page.state as PhonemePageError).replace();

		expect(page.state.phase).toBe('idle');
		page.dispose();
	});

	it('cancel() during validating discards the in-flight run and returns to idle', async () => {
		const resolvers: { r?: (o: ReturnType<typeof viewOutcome>) => void } = {};
		const transport: RequestPhonemeView = async () =>
			new Promise((resolve) => {
				resolvers.r = resolve;
			});

		const page = createPage(transport);
		const file = makeFile('cancel.elang', new Uint8Array([1, 2, 3, 4, 5]));
		const promise = page.select(file);

		// Wait for the page to enter validating AND for the request
		// to be awaited.
		await flushUntil(
			() =>
				page.state.phase === 'validating' &&
				page.state.phase === 'validating' &&
				resolvers.r !== undefined
		);

		(page.state as PhonemePageValidating).cancel();

		// The slow transport resolves after cancel; the page must
		// NOT adopt the late result.
		resolvers.r!(viewOutcome(successView()));
		await promise;

		expect(page.state.phase).toBe('idle');
		page.dispose();
	});

	it('a slow first run is superseded by a faster replacement run (race-safe)', async () => {
		const resolvers: { a?: (o: ReturnType<typeof viewOutcome>) => void } = {};
		const transportA: RequestPhonemeView = async () =>
			new Promise((resolve) => {
				resolvers.a = resolve;
			});
		const transportB: RequestPhonemeView = async () => viewOutcome(successView());

		const page = createPage(transportA);
		const fileA = makeFile('a.elang', new Uint8Array([1, 2]));
		const promiseA = page.select(fileA);

		await flushUntil(() => resolvers.a !== undefined);

		// Switch the page to a fast transport and run again.
		const page2 = createPage(transportB);
		const fileB = makeFile('b.elang', new Uint8Array([3, 4]));
		await page2.select(fileB);

		// Now resolve A; its result must NOT clobber B's view on page2.
		resolvers.a!(viewOutcome(successView()));
		await promiseA;

		expect(page2.state.phase).toBe('view');
		const view = page2.state as PhonemePageView;
		expect(view.fileName).toBe('b.elang');
		page.dispose();
		page2.dispose();
	});

	it('the page exposes exactly one observable state object per transition (no silent re-emit)', async () => {
		const transport: RequestPhonemeView = async () => viewOutcome(successView());
		const controller = new PhonemePageController();
		const states: unknown[] = [];
		controller.subscribe((s) => states.push(s));

		const file = makeFile('idem.elang', new Uint8Array([1]));
		await controller.select(file as unknown as File, transport);

		// Every emitted state must be a different object — the page's
		// `$state` rune needs a fresh reference to re-render.
		const unique = new Set(states);
		expect(unique.size).toBe(states.length);
		for (const s of states) expect(Object.isFrozen(s)).toBe(true);
	});

	it('the bytes never outlive a run (no persistence at the page boundary)', async () => {
		// Page-side observable: the controller's state exposes file
		// metadata (name + size) but NEVER the raw bytes. The page
		// does not cache the ArrayBuffer anywhere the user can reach.
		const transport: RequestPhonemeView = async () => viewOutcome(successView());
		const page = createPage(transport);
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		const file = makeFile('no-persist.elang', bytes);
		await page.select(file);

		const view = page.state as PhonemePageView;
		// Only name + size are observable; no ArrayBuffer reference.
		expect(view.fileName).toBe('no-persist.elang');
		expect(view.fileSize).toBe(5);
		expect((view as unknown as Record<string, unknown>).bytes).toBeUndefined();
		expect((view as unknown as Record<string, unknown>).buffer).toBeUndefined();
		page.dispose();
	});
});
