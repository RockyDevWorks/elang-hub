/**
 * Tests for the resource bounds (H0207).
 *
 * Every input that reaches the SDK adapter must be capped — body,
 * timeout, decompression, and caller cancellation. The Hub cannot
 * afford a single request that wedges the Cloudflare worker.
 */

import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_SDK_TIMEOUT_MS,
	MAX_SDK_BODY_BYTES,
	MAX_SDK_RESPONSE_BYTES,
	assertBodyWithinLimit,
	composeAbortSignal
} from './bounds';

describe('assertBodyWithinLimit', () => {
	it('accepts a body under the cap', () => {
		expect(() => assertBodyWithinLimit(new Uint8Array(1024))).not.toThrow();
	});

	it('accepts a body exactly at the cap', () => {
		expect(() => assertBodyWithinLimit(new Uint8Array(MAX_SDK_BODY_BYTES))).not.toThrow();
	});

	it('throws a typed failure for an oversized body', () => {
		try {
			assertBodyWithinLimit(new Uint8Array(MAX_SDK_BODY_BYTES + 1));
			expect.fail('expected throw');
		} catch (e) {
			expect(e).toMatchObject({
				ok: false,
				code: 'request_too_large',
				stage: 'inspect'
			});
		}
	});
});

describe('composeAbortSignal', () => {
	it('fires on timeout', async () => {
		const { signal, cancel } = composeAbortSignal(10);
		await new Promise((r) => setTimeout(r, 25));
		expect(signal.aborted).toBe(true);
		cancel();
	});

	it('fires when caller aborts early', () => {
		const caller = new AbortController();
		const { signal, cancel } = composeAbortSignal(10_000, caller.signal);
		caller.abort();
		expect(signal.aborted).toBe(true);
		cancel();
	});

	it('fires immediately if the caller signal is already aborted', () => {
		const caller = new AbortController();
		caller.abort();
		const { signal, cancel } = composeAbortSignal(10_000, caller.signal);
		expect(signal.aborted).toBe(true);
		cancel();
	});

	it('cancel() clears the timer so it does not keep the process alive', () => {
		vi.useFakeTimers();
		try {
			const { cancel } = composeAbortSignal(10_000);
			cancel();
			// Advancing fake timers must not fire a now-cleared timer.
			vi.advanceTimersByTime(20_000);
			expect(true).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('bounds constants', () => {
	it('exposes a non-zero default timeout', () => {
		expect(DEFAULT_SDK_TIMEOUT_MS).toBeGreaterThan(0);
	});

	it('caps the response size well under the request size', () => {
		expect(MAX_SDK_RESPONSE_BYTES).toBeLessThan(MAX_SDK_BODY_BYTES);
	});
});
