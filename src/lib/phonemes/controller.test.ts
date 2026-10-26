/**
 * Tests for the page state machine (H0408).
 *
 * The controller is the heart of the page lifecycle. It must:
 *
 *   - transition through the four phases without silent skips
 *   - read the file with progress before sending
 *   - cancel cleanly (no leftover listeners, no state leaks)
 *   - never let a stale supersede overwrite the latest result
 *     (H0408 — supersede is race-safe)
 *   - keep the bytes in memory for exactly one run (no
 *     persistence — REQ-HUB-003)
 *
 * Tests use a `File` stand-in (`MinimalFile`) so they run under
 * Vitest's `node` environment without DOM polyfills.
 */

import { describe, expect, it, vi } from 'vitest';
import { PhonemePageController } from './controller';
import type { PhonemePageError, PhonemePageView } from './controller';
import type { PhonemeRequestOutcome, RequestPhonemeView } from './index';
import { httpErrorOutcome, sdkErrorOutcome, transportErrorOutcome, viewOutcome } from './index';
import type { PhonemeViewResult } from '../view';
import { PHONEME_VIEW_EXTRACTION_FAILED } from '../view';
import { makeBrokenFile, makeFile, successView } from './test-helpers';
import type { MinimalFile } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Outcome builders                                                    */
/* ------------------------------------------------------------------ */

function extractionFailure(): PhonemeViewResult {
	return {
		ok: false,
		code: PHONEME_VIEW_EXTRACTION_FAILED,
		message: 'The validated phoneme inventory could not be read.',
		path: 'inventory.groups',
		cause: {
			code: 'groups_invalid',
			message: '`groups` must be an array.',
			path: 'inventory.groups'
		}
	};
}

function sdkFailureOutcome(): PhonemeRequestOutcome {
	return sdkErrorOutcome({
		stage: 'validate',
		code: 'phoneme_inventory_invalid',
		message: 'The phoneme inventory (ELD) is invalid.'
	});
}

function makeRequest(impl: RequestPhonemeView): {
	request: RequestPhonemeView;
	calls: { bytes: ArrayBuffer; fileName: string; aborted: boolean }[];
} {
	const calls: { bytes: ArrayBuffer; fileName: string; aborted: boolean }[] = [];
	const request: RequestPhonemeView = async (bytes, fileName, signal, _onProgress) => {
		calls.push({ bytes, fileName, aborted: signal.aborted });
		return impl(bytes, fileName, signal, _onProgress);
	};
	return { request, calls };
}

/**
 * Drain microtasks until `predicate` returns true. Used to wait
 * for the controller's async pipeline (read → validate → emit)
 * to reach a known state without resorting to wall-clock sleeps.
 */
async function flushUntil(predicate: () => boolean, maxTicks = 50): Promise<void> {
	for (let i = 0; i < maxTicks; i++) {
		await Promise.resolve();
		if (predicate()) return;
	}
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

describe('PhonemePageController', () => {
	it('starts in the idle phase', () => {
		const controller = new PhonemePageController();
		expect(controller.state.phase).toBe('idle');
		expect(controller.state).toEqual({ phase: 'idle' });
	});

	it('subscribers see every phase transition', async () => {
		const controller = new PhonemePageController();
		const phases: string[] = [];
		controller.subscribe((s) => phases.push(s.phase));

		const file = makeFile('test.elang', new Uint8Array([1, 2, 3, 4]));
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);

		// The validating phase may be re-emitted as progress ticks;
		// collapse to unique phases for the assertion.
		const unique = [...new Set(phases)];
		expect(unique).toEqual(['validating', 'view']);
	});

	it('emits a fresh frozen state object on every transition', async () => {
		const controller = new PhonemePageController();
		const states: unknown[] = [];
		controller.subscribe((s) => states.push(s));

		const file = makeFile('a.elang', new Uint8Array([1]));
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);

		const ids = new Set(states.map((s) => s));
		expect(ids.size).toBe(states.length);
		for (const s of states) expect(Object.isFrozen(s)).toBe(true);
	});

	it('transitions idle → validating → view on success', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('ok.elang', new Uint8Array([9, 9, 9]));
		const { request } = makeRequest(async () => viewOutcome(successView()));

		await controller.select(file as unknown as File, request);

		const final = controller.state;
		expect(final.phase).toBe('view');
		if (final.phase !== 'view') throw new Error('unreachable');
		expect(final.fileName).toBe('ok.elang');
		expect(final.fileSize).toBe(3);
		expect(final.view.ok).toBe(true);
		expect(typeof final.replace).toBe('function');
	});

	it('transitions idle → validating → error on SDK failure', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('bad.elang', new Uint8Array([0]));
		const { request } = makeRequest(async () => sdkFailureOutcome());

		await controller.select(file as unknown as File, request);

		const final = controller.state;
		expect(final.phase).toBe('error');
		if (final.phase !== 'error') throw new Error('unreachable');
		expect(final.error.title).toBeTruthy();
		expect(final.error.message).toBeTruthy();
		expect(final.fileName).toBe('bad.elang');
		expect(typeof final.replace).toBe('function');
	});

	it('transitions idle → validating → error on extraction failure', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('malformed.elang', new Uint8Array([1, 2]));
		const { request } = makeRequest(async () => viewOutcome(extractionFailure()));

		await controller.select(file as unknown as File, request);

		const final = controller.state;
		expect(final.phase).toBe('error');
		if (final.phase !== 'error') throw new Error('unreachable');
		expect(final.error.message).toMatch(/inventory/i);
		expect(final.error.detail).toBe('inventory.groups');
	});

	it('transitions idle → validating → error on HTTP 413', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('huge.elang', new Uint8Array([1, 2, 3, 4]));
		const { request } = makeRequest(async () => httpErrorOutcome(413, 'request.body'));

		await controller.select(file as unknown as File, request);

		const final = controller.state;
		expect(final.phase).toBe('error');
		if (final.phase !== 'error') throw new Error('unreachable');
		expect(final.error.title).toMatch(/large/i);
	});

	it('transitions idle → validating → error on transport offline', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('offline.elang', new Uint8Array([1]));
		const { request } = makeRequest(async () => transportErrorOutcome('offline'));

		await controller.select(file as unknown as File, request);

		const final = controller.state;
		expect(final.phase).toBe('error');
		if (final.phase !== 'error') throw new Error('unreachable');
		expect(final.error.title).toMatch(/network/i);
	});

	it('replace() on a view state returns to idle', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('x.elang', new Uint8Array([1, 2, 3]));
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);
		expect(controller.state.phase).toBe('view');
		(controller.state as PhonemePageView).replace();
		expect(controller.state.phase).toBe('idle');
	});

	it('replace() on an error state returns to idle', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('x.elang', new Uint8Array([1]));
		const { request } = makeRequest(async () => sdkFailureOutcome());
		await controller.select(file as unknown as File, request);
		expect(controller.state.phase).toBe('error');
		(controller.state as PhonemePageError).replace();
		expect(controller.state.phase).toBe('idle');
	});

	it('cancel() during validating discards the in-flight result', async () => {
		const controller = new PhonemePageController();

		// Manual promise so we can resolve from the test AFTER cancel.
		// Resolver is exposed via `resolvers.r` so we can wait until
		// the controller actually calls the request (after the read).
		const resolvers: { r?: (o: PhonemeRequestOutcome) => void } = {};
		const requestImpl: RequestPhonemeView = async () =>
			new Promise<PhonemeRequestOutcome>((resolve) => {
				resolvers.r = resolve;
			});

		const file = makeFile('cancel.elang', new Uint8Array([1, 2, 3, 4, 5]));
		const promise = controller.select(file as unknown as File, requestImpl);

		// Wait until the controller is awaiting the request.
		await flushUntil(() => resolvers.r !== undefined);

		controller.cancel();

		// Resolve the in-flight request now — the controller must
		// have already abandoned it.
		resolvers.r!(viewOutcome(successView()));
		await promise;

		expect(controller.state.phase).toBe('idle');
	});

	it.each(['cancel', 'reset'] as const)(
		'%s during file reading stops the stream',
		async (action) => {
			const controller = new PhonemePageController();
			const cancel = vi.fn();
			let emitted = 0;
			const pull = vi.fn((source: ReadableStreamDefaultController<Uint8Array>) => {
				if (emitted++ < 3) source.enqueue(new Uint8Array([1]));
				else source.close();
			});
			const stream = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
			const file: MinimalFile = { name: 'cancel.elang', size: 3, stream: () => stream };
			controller.subscribe((state) => {
				if (state.phase === 'validating' && state.progress > 0) controller[action]();
			});
			const { request, calls } = makeRequest(async () => viewOutcome(successView()));

			await controller.select(file as unknown as File, request);

			expect(cancel).toHaveBeenCalledOnce();
			expect(pull).toHaveBeenCalledOnce();
			expect(stream.locked).toBe(false);
			expect(calls).toHaveLength(0);
			expect(controller.state.phase).toBe('idle');
		}
	);

	it('discards a chunk that arrives after cancellation while a read is pending', async () => {
		const controller = new PhonemePageController();
		let source!: ReadableStreamDefaultController<Uint8Array>;
		const cancel = vi.fn();
		let reads = 0;
		const pull = vi.fn(() => {
			if (++reads > 1) source.close();
		});
		const stream = new ReadableStream<Uint8Array>(
			{
				start: (value) => {
					source = value;
				},
				pull,
				cancel
			},
			{ highWaterMark: 0 }
		);
		const file: MinimalFile = { name: 'slow.elang', size: 2, stream: () => stream };
		const states: string[] = [];
		controller.subscribe((state) => states.push(state.phase));
		const { request, calls } = makeRequest(async () => viewOutcome(successView()));
		const selected = controller.select(file as unknown as File, request);
		await flushUntil(() => pull.mock.calls.length > 0);

		controller.cancel();
		source.enqueue(new Uint8Array([1]));
		await selected;

		expect(cancel).toHaveBeenCalledOnce();
		expect(pull).toHaveBeenCalledOnce();
		expect(stream.locked).toBe(false);
		expect(calls).toHaveLength(0);
		expect(states).toEqual(['validating', 'idle']);
	});

	it('a slow run is superseded by a faster replacement run (race-safe)', async () => {
		const controller = new PhonemePageController();

		// requestA blocks until the test resolves it manually. The
		// resolver is exposed through `resolvers.a` so the test can
		// `flushUntil` until the request function is actually called
		// (after the controller's read completes).
		const resolvers: { a?: (o: PhonemeRequestOutcome) => void } = {};
		const requestA: RequestPhonemeView = async () =>
			new Promise<PhonemeRequestOutcome>((resolve) => {
				resolvers.a = resolve;
			});
		const fileA = makeFile('a.elang', new Uint8Array([1, 2]));
		const selectA = controller.select(fileA as unknown as File, requestA);

		// Wait until A's read completes AND its request is awaited.
		await flushUntil(() => resolvers.a !== undefined);

		// Run B: fast, replaces A while A is still in flight.
		const fileB = makeFile('b.elang', new Uint8Array([3, 4]));
		const requestB: RequestPhonemeView = async () => viewOutcome(successView());
		const selectB = controller.select(fileB as unknown as File, requestB);
		await selectB;

		// Now resolve A — its result must NOT overwrite B's view.
		resolvers.a!(viewOutcome(successView()));
		await selectA;

		const final = controller.state;
		expect(final.phase).toBe('view');
		if (final.phase !== 'view') throw new Error('unreachable');
		expect(final.fileName).toBe('b.elang');
	});

	it('progress events update the validating state', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('progress.elang', new Uint8Array(64));
		const { request } = makeRequest(async () => viewOutcome(successView()));

		const progressReadings: number[] = [];
		controller.subscribe((s) => {
			if (s.phase === 'validating') progressReadings.push(s.progress);
		});

		await controller.select(file as unknown as File, request);

		expect(progressReadings.length).toBeGreaterThan(0);
		expect(progressReadings[progressReadings.length - 1]).toBe(100);
	});

	it('a request that throws lands in error state with "Unexpected failure" title', async () => {
		const controller = new PhonemePageController();
		const file = makeFile('throw.elang', new Uint8Array([1]));
		const throwing: RequestPhonemeView = async () => {
			throw new Error('boom');
		};
		await controller.select(file as unknown as File, throwing);
		expect(controller.state.phase).toBe('error');
		if (controller.state.phase !== 'error') throw new Error('unreachable');
		// Title is the user-visible label; the message is plain.
		expect(controller.state.error.title).toMatch(/unexpected/i);
	});

	it('replace() on a request-throw error state returns to idle', async () => {
		// The request-catch branch in `select()` emits an error
		// state whose `replace` callback is a closure over
		// `this.reset()`. Invoking it must drop the page back to
		// the idle phase. This is the same contract as the
		// read-failure path, but a distinct code branch — the
		// callback lives in the request-catch, not the read-catch.
		const controller = new PhonemePageController();
		const file = makeFile('throw.elang', new Uint8Array([1]));
		const throwing: RequestPhonemeView = async () => {
			throw new Error('boom');
		};
		await controller.select(file as unknown as File, throwing);
		expect(controller.state.phase).toBe('error');
		(controller.state as PhonemePageError).replace();
		expect(controller.state.phase).toBe('idle');
	});

	it('unsubscribe stops receiving transitions', async () => {
		const controller = new PhonemePageController();
		const local: unknown[] = [];
		const off = controller.subscribe((s) => local.push(s));
		off();

		const file = makeFile('u.elang', new Uint8Array([1]));
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);

		expect(local.length).toBe(0);
	});

	it('emits the full file metadata into the validating state', async () => {
		const controller = new PhonemePageController();
		let captured: { fileName: string; fileSize: number } | null = null;
		controller.subscribe((s) => {
			if (s.phase === 'validating') {
				captured = { fileName: s.fileName, fileSize: s.fileSize };
			}
		});

		const file = makeFile('xyz.elang', new Uint8Array([1, 2, 3, 4, 5]));
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);

		expect(captured).toEqual({ fileName: 'xyz.elang', fileSize: 5 });
	});

	it('cancel() on an idle controller is a no-op', () => {
		const controller = new PhonemePageController();
		controller.cancel();
		expect(controller.state.phase).toBe('idle');
	});

	it('reset() on an idle controller is a no-op', () => {
		const controller = new PhonemePageController();
		controller.reset();
		expect(controller.state.phase).toBe('idle');
	});

	it('a read failure (broken file stream) lands in error state with "Could not read the file" title', async () => {
		const controller = new PhonemePageController();
		const file = makeBrokenFile('broken.elang', 100);
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);

		expect(controller.state.phase).toBe('error');
		if (controller.state.phase !== 'error') throw new Error('unreachable');
		expect(controller.state.error.title).toMatch(/could not read/i);
		expect(controller.state.error.message).toMatch(/different file/i);
		expect(typeof controller.state.replace).toBe('function');
		expect(controller.state.fileName).toBe('broken.elang');
		expect(controller.state.fileSize).toBe(100);
	});

	it('replace() on a read-failure error state returns to idle', async () => {
		const controller = new PhonemePageController();
		const file = makeBrokenFile('broken.elang', 100);
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);
		expect(controller.state.phase).toBe('error');
		(controller.state as PhonemePageError).replace();
		expect(controller.state.phase).toBe('idle');
	});

	it('a read failure that races a cancel lands in idle (signal-aborted branch)', async () => {
		// The select() pipeline catches read failures. When the
		// failure happens AND the signal is already aborted (because
		// cancel() ran before the read rejection landed), the
		// controller emits the idle state instead of the error
		// state. This is the cancellation-wins invariant.
		const controller = new PhonemePageController();
		const file = makeBrokenFile('broken.elang', 100);
		const { request } = makeRequest(async () => viewOutcome(successView()));
		const promise = controller.select(file as unknown as File, request);
		// Cancel synchronously, before the read's rejection microtask
		// lands. The select() promise still awaits its internal
		// catch, which observes `controller.signal.aborted === true`
		// and emits IDLE instead of ERROR.
		controller.cancel();
		await promise;
		expect(controller.state.phase).toBe('idle');
	});

	it('a cancel that races the read pipeline (during progress) lands in idle', async () => {
		// The select() pipeline checks `controller.signal.aborted`
		// after the read completes. When cancel() runs from inside
		// the progress subscriber (between chunk reads), the read
		// still completes normally — the abort only short-circuits
		// the post-read check, which emits IDLE instead of the
		// successful view.
		const controller = new PhonemePageController();
		const file = makeFile('cancel.elang', new Uint8Array([1, 2, 3, 4, 5]));
		let cancelled = false;
		controller.subscribe((s) => {
			if (s.phase === 'validating' && s.progress > 0 && !cancelled) {
				cancelled = true;
				controller.cancel();
			}
		});
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);
		// The request was never called because cancel aborted the
		// pipeline before the request ran.
		expect(cancelled).toBe(true);
		expect(controller.state.phase).toBe('idle');
	});

	it('a cancel issued synchronously on the validating emit aborts the read at entry', async () => {
		// `select()` emits the `validating` state SYNCHRONOUSLY
		// before awaiting the read. If a subscriber calls
		// `controller.cancel()` during that emit (progress === 0),
		// the AbortController is signalled BEFORE
		// `readFileWithProgress` is invoked. The read then throws
		// an AbortError on its first line, the catch sees
		// `signal.aborted === true` with a matching generation,
		// and the controller emits the idle state.
		//
		// This pins:
		//   - controller.ts:254 — `if (signal.aborted) throw`
		//     (true branch, the only way to enter read-fail with
		//     an aborted signal from a fresh AbortController)
		//   - controller.ts:151 — read-catch with aborted signal
		//     and a matching generation (true branch: emit IDLE)
		const controller = new PhonemePageController();
		const file = makeFile('sync-cancel.elang', new Uint8Array([1]));
		let cancelCalled = false;
		controller.subscribe((s) => {
			if (s.phase === 'validating' && s.progress === 0 && !cancelCalled) {
				cancelCalled = true;
				controller.cancel();
			}
		});
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(file as unknown as File, request);
		expect(cancelCalled).toBe(true);
		expect(controller.state.phase).toBe('idle');
	});

	it('a slow first run superseded by a faster second run discards stale progress', async () => {
		// Two concurrent `select()` calls. The first runs against
		// a 64 KiB file (multi-chunk read in happy-dom); the
		// second runs against a small file (single chunk,
		// resolves quickly). The first select's `onProgress`
		// callback may fire AFTER the second select bumps the
		// generation. The controller detects the mismatch and
		// returns early — pinning the
		// `if (generation !== this.#generation) return;`
		// truthy branch at line 144.
		//
		// The exact chunking is happy-dom-internal; the test only
		// requires that progress is reported at least once for
		// the first select BEFORE its read finishes.
		const controller = new PhonemePageController();
		// 64 KiB — happy-dom returns this in many small chunks.
		const big = new Uint8Array(64 * 1024).fill(0x61);
		const small = new Uint8Array(16).fill(0x62);
		const fileA = makeFile('big.elang', big);
		const fileB = makeFile('small.elang', small);

		let firstProgressSeen = 0;
		controller.subscribe((s) => {
			if (s.phase === 'validating' && s.fileName === 'big.elang') {
				firstProgressSeen++;
			}
		});

		const firstPromise = controller.select(fileA as unknown as File, async () =>
			viewOutcome(successView())
		);

		// Yield once so the first select's read starts and
		// emits at least one progress event before the supersede.
		await new Promise((resolve) => setImmediate(resolve));

		const { request: fastRequest } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(fileB as unknown as File, fastRequest);

		// Wait for the first select to fully resolve (its
		// pipeline is now superseded; it should NOT emit
		// anything that overwrites the second select's state).
		await firstPromise;

		// The first select emitted at least one validating state
		// before the supersede (the test framework would have
		// fired the subscription at least once).
		expect(firstProgressSeen).toBeGreaterThanOrEqual(1);
		// The controller's final state reflects the second
		// select's success.
		expect(controller.state.phase).toBe('view');
		if (controller.state.phase !== 'view') throw new Error('unreachable');
		expect(controller.state.fileName).toBe('small.elang');
	});

	it('an empty file (size 0) short-circuits the read to an empty ArrayBuffer', async () => {
		// `readFileWithProgress` has an explicit `if (totalBytes
		// === 0) return new ArrayBuffer(0);` guard. Only a
		// zero-byte file reaches it, so this test pins that
		// branch. The SDK outcome is irrelevant here — the point
		// is that the controller does not stall in `validating`
		// and the request is still invoked with zero bytes.
		const controller = new PhonemePageController();
		const emptyFile = makeFile('empty.elang', new Uint8Array(0));
		let receivedBytes: ArrayBuffer | null = null;
		const { request } = makeRequest(async (bytes) => {
			receivedBytes = bytes;
			return viewOutcome(successView());
		});
		await controller.select(emptyFile as unknown as File, request);
		expect(receivedBytes).not.toBeNull();
		expect((receivedBytes as unknown as ArrayBuffer).byteLength).toBe(0);
		expect(controller.state.phase).toBe('view');
	});
});

describe('PhonemePageController client-side upload cap (H0503)', () => {
	it('rejects an oversized selection without reading any bytes', async () => {
		// A 17 MiB selection would, without the cap, buffer 17 MiB
		// into browser memory before the page could complain. The
		// cap fires before `readFileWithProgress` is even called,
		// so the stub `stream()` (which would throw) is never
		// touched.
		const controller = new PhonemePageController();
		const oversized: MinimalFile = {
			name: 'huge.elang',
			size: 17 * 1024 * 1024,
			stream: () => {
				throw new Error('stream should not be called for an oversized file');
			}
		};
		let requested = false;
		const request = vi.fn(async () => {
			requested = true;
			return viewOutcome(successView());
		});
		await controller.select(oversized as unknown as File, request);
		expect(requested).toBe(false);
		const state = controller.state;
		expect(state.phase).toBe('error');
		if (state.phase === 'error') {
			expect(state.error.title).toMatch(/too large/i);
			expect(state.error.message).toContain('17.0 MiB');
		}
	});

	it('accepts a file exactly at the cap', async () => {
		const controller = new PhonemePageController();
		const atCap = makeFile('at-cap.elang', new Uint8Array([1, 2, 3]));
		(atCap as { size: number }).size = 16 * 1024 * 1024;
		const { request } = makeRequest(async () => viewOutcome(successView()));
		await controller.select(atCap as unknown as File, request);
		expect(controller.state.phase).toBe('view');
	});

	it('accepts a file one byte over the cap (regression boundary)', async () => {
		const controller = new PhonemePageController();
		const overByOne: MinimalFile = {
			name: 'over.elang',
			size: 16 * 1024 * 1024 + 1,
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
		const request = vi.fn(async () => viewOutcome(successView()));
		await controller.select(overByOne as unknown as File, request);
		expect(controller.state.phase).toBe('error');
		expect(request).not.toHaveBeenCalled();
	});

	it('does not emit a stale oversize error when the run is superseded during the abort', async () => {
		// The generation counter exists so a superseded run cannot
		// overwrite the state of a newer one. The oversize branch is
		// the one place where the emit happens synchronously — between
		// the generation bump and the emit there is no `await`, so the
		// only way the run can become stale is a re-entrant state
		// change triggered by the abort of the previous run. That is
		// exactly what happens when the user cancels while the next
		// selection is being processed.
		const controller = new PhonemePageController();
		const phases: string[] = [];
		controller.subscribe((state) => phases.push(state.phase));

		let transportEntered!: () => void;
		const entered = new Promise<void>((resolve) => {
			transportEntered = resolve;
		});

		const inFlight = controller.select(
			makeFile('first.elang', new Uint8Array([1, 2, 3])) as unknown as File,
			(_bytes, _fileName, signal) =>
				new Promise<PhonemeRequestOutcome>((_resolve, reject) => {
					transportEntered();
					signal.addEventListener('abort', () => {
						controller.reset();
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);

		// Wait until the first run is actually in the transport, so the
		// second selection is guaranteed to abort it.
		await entered;

		const oversize: MinimalFile = {
			name: 'huge.elang',
			size: 16 * 1024 * 1024 + 1,
			stream: () => {
				throw new Error('the oversize branch must never read the file');
			}
		};
		const request = vi.fn(async () => viewOutcome(successView()));
		await controller.select(oversize as unknown as File, request);
		await inFlight;

		expect(request).not.toHaveBeenCalled();
		expect(phases).not.toContain('error');
		expect(controller.state.phase).toBe('idle');
	});
});
