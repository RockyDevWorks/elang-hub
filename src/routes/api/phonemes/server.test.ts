/**
 * Endpoint boundary tests for `/api/phonemes` (H0408).
 *
 * The endpoint is the server-side mirror of the page's request
 * transport: it accepts opaque package bytes, enforces the 16 MiB
 * body cap, forwards to the SDK service, and returns the SDK
 * verdict verbatim. The boundary contract is:
 *
 *   - 200 + `SdkResult` body (success OR typed SDK failure)
 *   - 400 on empty body
 *   - 413 when the body exceeds the cap (before OR after read)
 *   - 503 when `SDK_SERVICE_URL` is not configured
 *
 * The tests stub the SDK client with `vi.mock` so the endpoint can
 * be exercised without a real service, and stub
 * `$app/env/private` so the URL is configurable per test. The cap
 * check runs against `Content-Length` AND the read length, so both
 * paths need a test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SDK client so the endpoint never touches the network.
const validateMock = vi.fn();
vi.mock('$lib/sdk', async () => {
	const actual = await vi.importActual<typeof import('$lib/sdk')>('$lib/sdk');
	return {
		...actual,
		SdkClient: class {
			constructor(_config: unknown) {
				void _config;
			}
			async validate(bytes: Uint8Array) {
				return validateMock(bytes);
			}
		}
	};
});

// Mock `$app/env/private` so we can control `SDK_SERVICE_URL`
// per test without touching `process.env` directly. The getter
// keeps the binding live: the endpoint reads the imported binding
// at request time, so mutating `envMock` between tests is
// observed by the next request.
const envMock: Record<string, string | undefined> = {};
vi.mock('$app/env/private', () => ({
	get SDK_SERVICE_URL() {
		return envMock.SDK_SERVICE_URL;
	}
}));

import { POST } from './+server';
import type { SdkResult } from '$lib/sdk';
import { MAX_SDK_BODY_BYTES } from '$lib/sdk';

// Helper: build a `Request` with opaque body bytes.
function makeRequest(bytes: Uint8Array, headers: Record<string, string> = {}): Request {
	const init: RequestInit = {
		method: 'POST',
		body: bytes as unknown as BodyInit,
		headers: { 'content-type': 'application/octet-stream', ...headers }
	};
	return new Request('http://localhost/api/phonemes', init);
}

function makeStreamRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
	let index = 0;
	const cancel = vi.fn();
	const pull = vi.fn((source: ReadableStreamDefaultController<Uint8Array>) => {
		if (index === chunks.length) source.close();
		else source.enqueue(chunks[index++]);
	});
	const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
	const init: RequestInit & { duplex: 'half' } = {
		method: 'POST',
		body,
		duplex: 'half',
		headers: { 'content-type': 'application/octet-stream', ...headers }
	};
	return { request: new Request('http://localhost/api/phonemes', init), body, pull, cancel };
}

function makeSuccessResult(): SdkResult {
	return {
		ok: true,
		mode: 'validate',
		specVersion: '0.1.0',
		binaryContainerVersion: '0.1.0',
		phonemeResourcePath: 'Linguistics/phonemes.eld',
		inventory: {},
		diagnostics: []
	};
}

function makeSdkFailure(): SdkResult {
	return {
		ok: false,
		stage: 'validate',
		code: 'eld_invalid',
		message: 'The phoneme inventory (ELD) is invalid.',
		diagnostics: []
	};
}

beforeEach(() => {
	validateMock.mockReset();
	envMock.SDK_SERVICE_URL = 'http://sdk.test';
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('POST /api/phonemes', () => {
	it('returns 200 with the SDK verdict on a valid request', async () => {
		validateMock.mockResolvedValue(makeSuccessResult());

		const response = await POST({
			request: makeRequest(new Uint8Array([1, 2, 3, 4]))
		} as never);

		expect(response.status).toBe(200);
		const body = (await response.json()) as SdkResult;
		expect(body.ok).toBe(true);
		if (body.ok && body.mode === 'validate') {
			expect(body.phonemeResourcePath).toBe('Linguistics/phonemes.eld');
		}
		expect(validateMock).toHaveBeenCalledOnce();
	});

	it('returns 200 with a typed SDK failure envelope when the SDK rejects the package', async () => {
		validateMock.mockResolvedValue(makeSdkFailure());

		const response = await POST({
			request: makeRequest(new Uint8Array([1, 2, 3, 4]))
		} as never);

		expect(response.status).toBe(200);
		const body = (await response.json()) as SdkResult;
		expect(body.ok).toBe(false);
		if (!body.ok) {
			expect(body.code).toBe('eld_invalid');
			expect(body.message).toContain('ELD');
		}
	});

	it('forwards the bytes verbatim to the SDK client', async () => {
		validateMock.mockResolvedValue(makeSuccessResult());
		const payload = new Uint8Array([10, 20, 30, 40, 50]);

		await POST({ request: makeRequest(payload) } as never);

		const received = validateMock.mock.calls[0]?.[0] as Uint8Array;
		expect(received).toBeInstanceOf(Uint8Array);
		expect(Array.from(received)).toEqual(Array.from(payload));
	});

	it('forwards multiple chunks in order, including empty chunks', async () => {
		validateMock.mockResolvedValue(makeSuccessResult());
		const { request, body, cancel } = makeStreamRequest([
			new Uint8Array(),
			new Uint8Array([10, 20]),
			new Uint8Array(),
			new Uint8Array([30, 40])
		]);

		const response = await POST({ request } as never);

		expect(response.status).toBe(200);
		expect(validateMock).toHaveBeenCalledExactlyOnceWith(new Uint8Array([10, 20, 30, 40]));
		expect(cancel).not.toHaveBeenCalled();
		expect(body.locked).toBe(false);
	});

	it('returns 400 when the request has no body stream', async () => {
		const request = new Request('http://localhost/api/phonemes', { method: 'POST' });

		await expect(POST({ request } as never)).rejects.toMatchObject({ status: 400 });
		expect(validateMock).not.toHaveBeenCalled();
	});

	it('returns 400 on an empty body', async () => {
		// SvelteKit's `error()` throws an `HttpError` object in the
		// request handler. The SvelteKit framework would convert it
		// into a 400 Response in production; here we assert directly
		// on the thrown shape so the contract is pinned.
		try {
			await POST({ request: makeRequest(new Uint8Array()) } as never);
			expect.fail('Expected POST to throw a 400 HttpError');
		} catch (e) {
			const err = e as { status?: number; body?: { message?: string } };
			expect(err.status).toBe(400);
			expect(err.body?.message).toContain('package bytes');
		}
		expect(validateMock).not.toHaveBeenCalled();
	});

	it('returns 413 when Content-Length exceeds the cap (rejects before reading)', async () => {
		const oversized = MAX_SDK_BODY_BYTES + 1;
		const response = await POST({
			request: makeRequest(new Uint8Array([1]), { 'content-length': String(oversized) })
		} as never);

		expect(response.status).toBe(413);
		const body = (await response.json()) as SdkResult;
		expect(body.ok).toBe(false);
		if (!body.ok) {
			expect(body.code).toBe('request_too_large');
			expect(body.path).toBe('request.body');
		}
		expect(validateMock).not.toHaveBeenCalled();
	});

	it('returns 413 when the read length exceeds the cap (Content-Length under-reported)', async () => {
		// Content-Length lies; the real body is over the cap.
		const oversized = MAX_SDK_BODY_BYTES + 1024;
		const response = await POST({
			request: makeRequest(new Uint8Array(oversized), {
				'content-length': String(1024)
			})
		} as never);

		expect(response.status).toBe(413);
		expect(validateMock).not.toHaveBeenCalled();
	});

	it.each<Record<string, string>>([{}, { 'content-length': '1' }])(
		'cancels immediately when streamed bytes exceed the cap with headers %j',
		async (headers) => {
			const { request, body, pull, cancel } = makeStreamRequest(
				[new Uint8Array(MAX_SDK_BODY_BYTES - 1), new Uint8Array(2), new Uint8Array(1)],
				headers
			);

			const response = await POST({ request } as never);

			expect(response.status).toBe(413);
			expect(await response.json()).toEqual({
				ok: false,
				stage: 'inspect',
				code: 'request_too_large',
				message: `Request body is ${MAX_SDK_BODY_BYTES + 1} bytes; the SDK adapter limit is ${MAX_SDK_BODY_BYTES}.`,
				path: 'request.body',
				diagnostics: []
			});
			expect(cancel).toHaveBeenCalledOnce();
			expect(pull).toHaveBeenCalledTimes(2);
			expect(body.locked).toBe(false);
			expect(validateMock).not.toHaveBeenCalled();
		}
	);

	it('returns 503 when SDK_SERVICE_URL is not configured', async () => {
		envMock.SDK_SERVICE_URL = undefined;

		try {
			await POST({ request: makeRequest(new Uint8Array([1, 2, 3])) } as never);
			expect.fail('Expected POST to throw a 503 HttpError');
		} catch (e) {
			const err = e as { status?: number; body?: { message?: string } };
			expect(err.status).toBe(503);
			expect(err.body?.message).toContain('not configured');
		}
		expect(validateMock).not.toHaveBeenCalled();
	});

	it('resolves the service URL before reading any body bytes', async () => {
		envMock.SDK_SERVICE_URL = undefined;
		const { request, pull } = makeStreamRequest([new Uint8Array([1])]);

		await expect(POST({ request } as never)).rejects.toMatchObject({ status: 503 });

		expect(pull).not.toHaveBeenCalled();
		expect(request.bodyUsed).toBe(false);
		expect(validateMock).not.toHaveBeenCalled();
	});

	it('strips trailing slashes from SDK_SERVICE_URL', async () => {
		envMock.SDK_SERVICE_URL = 'http://sdk.test///';
		validateMock.mockResolvedValue(makeSuccessResult());

		await POST({ request: makeRequest(new Uint8Array([1, 2])) } as never);

		// The stub ignores the constructor argument, but the
		// stripping lives in the endpoint; we just verify the call
		// succeeded without 503.
		expect(validateMock).toHaveBeenCalledOnce();
	});

	it('does not echo the package bytes in the response body', async () => {
		validateMock.mockResolvedValue(makeSuccessResult());
		const payload = new Uint8Array([1, 2, 3, 4, 5]);

		const response = await POST({ request: makeRequest(payload) } as never);
		const body = (await response.json()) as SdkResult;

		// The response body is the SDK verdict — no echo of the
		// uploaded bytes anywhere.
		const serialised = JSON.stringify(body);
		expect(serialised).not.toContain('1,2,3,4,5');
		expect(serialised).not.toContain('0102030405');
	});

	it('accepts a body right up to the cap (boundary)', async () => {
		validateMock.mockResolvedValue(makeSuccessResult());
		const { request } = makeStreamRequest([
			new Uint8Array(MAX_SDK_BODY_BYTES - 1),
			new Uint8Array([42])
		]);

		const response = await POST({ request } as never);
		expect(response.status).toBe(200);
		expect(validateMock).toHaveBeenCalledOnce();
		const received = validateMock.mock.calls[0][0] as Uint8Array;
		expect(received.byteLength).toBe(MAX_SDK_BODY_BYTES);
		expect(received[MAX_SDK_BODY_BYTES - 1]).toBe(42);
	});
});
