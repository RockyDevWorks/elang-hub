/**
 * Tests for the page-side request transport (H0401, H0408).
 *
 * `requestPhonemeView` is the only module the page uses to talk to
 * the server. It converts fetch round-trips into a closed
 * `PhonemeRequestOutcome` union so the controller is HTTP-agnostic.
 * The transport:
 *
 *   - maps network failures (DNS, offline) to `transport_error`
 *   - maps aborts (caller signal) to `transport_error: aborted`
 *   - maps non-2xx responses to `http_error`
 *   - extracts a typed `PhonemeViewResult` on 2xx + `{ok:true}`
 *   - converts SDK failures (2xx + `{ok:false}`) to a `HubError`
 *
 * The tests use a stub `fetch` so the transport can be exercised
 * without a real server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestPhonemeView } from './client';
import type { PhonemeViewResult } from '../view';
import { PHONEME_VIEW_EXTRACTION_FAILED } from '../view';
import { asSdkErrorCode, type SdkDiagnostic, type SdkErrorCode } from '../sdk/contract';

const originalFetch = globalThis.fetch;

function makeFetch(
	response: Response | ((url: string, init: RequestInit) => Response | Promise<Response>)
): ReturnType<typeof vi.fn> {
	const stub = vi.fn();
	if (typeof response === 'function') {
		stub.mockImplementation((url: string, init: RequestInit) =>
			Promise.resolve(response(url, init))
		);
	} else {
		stub.mockResolvedValue(response);
	}
	globalThis.fetch = stub as unknown as typeof fetch;
	return stub;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function successBody(): Record<string, unknown> {
	return {
		ok: true,
		mode: 'validate',
		specVersion: '0.0.1-1',
		binaryContainerVersion: '0.1.0',
		phonemeResourcePath: 'Linguistics/phonemes.eld',
		inventory: {
			package: {
				identifier: 'urn:elang:language:test:test:1.0.0',
				namespace: 'test',
				languageName: 'test',
				languageVersion: '1.0.0',
				name: 'Test',
				description: null
			},
			inventory: { groups: [] }
		},
		diagnostics: []
	};
}

function failureBody(): Record<string, unknown> {
	return {
		ok: false,
		stage: 'validate',
		code: 'eld_invalid',
		message: 'The phoneme inventory (ELD) is invalid.',
		diagnostics: []
	};
}

beforeEach(() => {
	// Reset to a no-op fetch between tests so a missing stub fails
	// loudly rather than leaking across tests.
	globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('requestPhonemeView', () => {
	it('POSTs to /api/phonemes with octet-stream content-type', async () => {
		const stub = makeFetch(() => jsonResponse(successBody()));
		const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
		await requestPhonemeView(bytes, 'x.elang', new AbortController().signal, () => {});

		expect(stub).toHaveBeenCalledOnce();
		const [url, init] = stub.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/phonemes');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>)['content-type']).toBe(
			'application/octet-stream'
		);
		expect(init.body).toBe(bytes);
	});

	it('forwards the AbortSignal to fetch', async () => {
		const stub = makeFetch(() => jsonResponse(successBody()));
		const controller = new AbortController();
		await requestPhonemeView(new Uint8Array([1]).buffer, 'x.elang', controller.signal, () => {});
		expect((stub.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal);
	});

	it('returns view(kind: view, ok: true) on a 200 success', async () => {
		makeFetch(() => jsonResponse(successBody()));
		const outcome = await requestPhonemeView(
			new Uint8Array([1, 2, 3]).buffer,
			'ok.elang',
			new AbortController().signal,
			() => {}
		);

		expect(outcome.kind).toBe('view');
		if (outcome.kind !== 'view') throw new Error('unreachable');
		const view = outcome.result as Extract<PhonemeViewResult, { ok: true }>;
		expect(view.ok).toBe(true);
		expect(view.view.phonemeResourcePath).toBe('Linguistics/phonemes.eld');
	});

	it('returns view(kind: view, ok: false) with PHONEME_VIEW_EXTRACTION_FAILED when the payload does not narrow', async () => {
		// Body has ok:true but `inventory` is malformed — the SDK
		// would never do this, but the transport must defend against
		// hostile or misconfigured services.
		const hostile = {
			ok: true,
			mode: 'validate',
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0',
			phonemeResourcePath: 'Linguistics/phonemes.eld',
			inventory: 'not-an-object',
			diagnostics: []
		};
		makeFetch(() => jsonResponse(hostile));

		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'x.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('view');
		if (outcome.kind !== 'view') throw new Error('unreachable');
		const view = outcome.result as Extract<PhonemeViewResult, { ok: false }>;
		expect(view.ok).toBe(false);
		expect(view.code).toBe(PHONEME_VIEW_EXTRACTION_FAILED);
	});

	it('returns sdk_error on a 200 + {ok:false} body', async () => {
		makeFetch(() => jsonResponse(failureBody()));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'bad.elang',
			new AbortController().signal,
			() => {}
		);

		expect(outcome.kind).toBe('sdk_error');
		if (outcome.kind !== 'sdk_error') throw new Error('unreachable');
		expect(outcome.error.stage).toBe('validate');
		expect(outcome.error.code).toBe('phoneme_inventory_invalid');
		expect(outcome.error.message).toContain('ELD');
	});

	it('returns http_error with the status and an optional detail on a non-2xx response', async () => {
		makeFetch(() => jsonResponse({ detail: 'request.body' }, 413));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'big.elang',
			new AbortController().signal,
			() => {}
		);

		expect(outcome.kind).toBe('http_error');
		if (outcome.kind !== 'http_error') throw new Error('unreachable');
		expect(outcome.status).toBe(413);
		expect(outcome.detail).toBe('request.body');
	});

	it('returns http_error without a detail when the body is not JSON', async () => {
		makeFetch(
			() =>
				new Response('upstream blew up', {
					status: 500,
					headers: { 'content-type': 'text/plain' }
				})
		);
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'server.elang',
			new AbortController().signal,
			() => {}
		);

		expect(outcome.kind).toBe('http_error');
		if (outcome.kind !== 'http_error') throw new Error('unreachable');
		expect(outcome.status).toBe(500);
		expect(outcome.detail).toBeUndefined();
	});

	it('returns transport_error(aborted) when the caller signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		// A real `fetch` would throw `AbortError` on an aborted
		// signal; the stub reproduces that so the transport's abort
		// branch is exercised end-to-end.
		makeFetch((input, init) => {
			if ((init as RequestInit | undefined)?.signal?.aborted) {
				throw new DOMException('Aborted', 'AbortError');
			}
			return jsonResponse(successBody());
		});

		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'cancel.elang',
			controller.signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('aborted');
	});

	it('returns transport_error(offline) on a fetch TypeError', async () => {
		makeFetch(() => {
			throw new TypeError('Failed to fetch');
		});
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'offline.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('offline');
	});

	it('returns transport_error(unknown) on a non-TypeError fetch throw', async () => {
		makeFetch(() => {
			throw new Error('something exploded');
		});
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'unknown.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('unknown');
	});

	it('returns transport_error(unknown) when the response is not valid JSON', async () => {
		makeFetch(() => new Response('not-json', { status: 200 }));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'junk.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('unknown');
	});

	it('returns transport_error(unknown) when the body is not a JSON object', async () => {
		makeFetch(() => jsonResponse(['array', 'not', 'object']));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'weird.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('unknown');
	});

	it('returns transport_error(unknown) when the body lacks the ok flag', async () => {
		makeFetch(() => jsonResponse({ message: 'no ok flag' }));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'no-ok.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('transport_error');
		if (outcome.kind !== 'transport_error') throw new Error('unreachable');
		expect(outcome.cause).toBe('unknown');
	});

	it('returns http_error without a detail when the JSON detail is not a string', async () => {
		makeFetch(() => jsonResponse({ detail: 42 }, 413));
		const outcome = await requestPhonemeView(
			new Uint8Array([1]).buffer,
			'odd.elang',
			new AbortController().signal,
			() => {}
		);
		expect(outcome.kind).toBe('http_error');
		if (outcome.kind !== 'http_error') throw new Error('unreachable');
		expect(outcome.status).toBe(413);
		expect(outcome.detail).toBeUndefined();
	});
});

// Keep an explicit sanity reference to the SDK contract types we
// consume indirectly — so a contract change shows up here too.
type _Diagnostics = SdkDiagnostic;
type _Code = SdkErrorCode;
type _Coded = ReturnType<typeof asSdkErrorCode>;
void (0 as unknown as _Diagnostics);
void (0 as unknown as _Code);
void (0 as unknown as _Coded);
