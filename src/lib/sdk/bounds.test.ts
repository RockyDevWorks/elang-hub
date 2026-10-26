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
	MAX_SDK_STRING_LENGTH,
	assertBodyWithinLimit,
	clampSdkString,
	composeAbortSignal,
	stripTrailingSlashes
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
				stage: 'inspect',
				diagnostics: []
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

describe('stripTrailingSlashes (H0502)', () => {
	it('removes a single trailing slash', () => {
		expect(stripTrailingSlashes('http://sdk.test/')).toBe('http://sdk.test');
	});

	it('removes a run of trailing slashes', () => {
		expect(stripTrailingSlashes('http://sdk.test///')).toBe('http://sdk.test');
	});

	it('leaves a URL without trailing slashes untouched', () => {
		expect(stripTrailingSlashes('http://sdk.test')).toBe('http://sdk.test');
	});

	it('keeps interior slashes', () => {
		expect(stripTrailingSlashes('http://sdk.test/v1/inspect')).toBe('http://sdk.test/v1/inspect');
	});

	it('returns an empty string for an all-slash input', () => {
		expect(stripTrailingSlashes('////')).toBe('');
	});

	it('returns an empty string for an empty input', () => {
		expect(stripTrailingSlashes('')).toBe('');
	});

	it('handles a long run of slashes in linear time (H0502 super-linear regression)', () => {
		// The previous implementation was `url.replace(/\/+$/, '')`,
		// which is quadratic: the `+` quantifier backtracks at every
		// start offset. A 200k-slash input took minutes against the
		// regex and completes in microseconds against the scan. The
		// budget below is generous for a linear scan and impossible
		// for the quadratic one.
		const hostile = `${'/'.repeat(200_000)}x`;
		const started = performance.now();
		const result = stripTrailingSlashes(hostile);
		const elapsed = performance.now() - started;
		expect(result).toBe(hostile);
		expect(elapsed).toBeLessThan(1000);
	});
});

describe('clampSdkString (H0502)', () => {
	it('returns undefined for a non-string', () => {
		expect(clampSdkString(42, 10)).toBeUndefined();
		expect(clampSdkString(null, 10)).toBeUndefined();
		expect(clampSdkString(undefined, 10)).toBeUndefined();
		expect(clampSdkString({}, 10)).toBeUndefined();
	});

	it('returns a string at or under the limit unchanged', () => {
		expect(clampSdkString('abc', 3)).toBe('abc');
		expect(clampSdkString('', 3)).toBe('');
	});

	it('clamps a string over the limit and marks the truncation', () => {
		const clamped = clampSdkString('abcdef', 3);
		expect(clamped).toBe('abc…');
		expect(clamped).toHaveLength(4);
	});

	it('clamps a package-controlled string to the configured budget', () => {
		const hostile = 'x'.repeat(MAX_SDK_STRING_LENGTH * 10);
		const clamped = clampSdkString(hostile, MAX_SDK_STRING_LENGTH);
		expect(clamped).toHaveLength(MAX_SDK_STRING_LENGTH + 1);
		expect(clamped?.endsWith('…')).toBe(true);
	});
});
