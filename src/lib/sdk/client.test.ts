/**
 * Tests for the SDK HTTP client (H0201, H0202, H0203, H0204).
 *
 * The client is the ONLY place that talks to the validation service;
 * every other module is transport-agnostic. The client must:
 *   - POST opaque bytes with a hard body cap
 *   - respect the caller's timeout and AbortSignal
 *   - parse the response into the typed contract
 *   - reject malformed responses as typed failures
 *   - never present inspect as integrity verification (H0202)
 *
 * A stub `fetch` exercises the contract without needing a real
 * network or the elang-rs SDK.
 */

import { describe, expect, it, vi } from 'vitest';
import { SdkClient, toHubError } from './client';
import { SUPPORTED_BINARY_CONTAINER_VERSION, SUPPORTED_SPEC_VERSION } from './contract';
import { MAX_SDK_BODY_BYTES, MAX_SDK_RESPONSE_BYTES } from './bounds';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('SdkClient.inspect (H0202)', () => {
	it('returns a typed inspect verdict on a 200 response', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				discoveredResources: 5,
				diagnostics: []
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.inspect(new Uint8Array(10));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.mode).toBe('inspect');
			if (result.mode === 'inspect') {
				expect(result.discoveredResources).toBe(5);
			}
		}
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('rejects a malformed inspect response', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.inspect(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('malformed_response');
		}
	});

	it('does not report inspect as integrity verification', async () => {
		// Even when inspect succeeds, the Hub must not promote it to
		// "verified" — that's the contract of H0202. The verifier
		// in version.ts only treats inspect-level failures as
		// `unsupported_*`; here we verify the client itself does
		// not claim `verifiedResources` for inspect.
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				discoveredResources: 3
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.inspect(new Uint8Array(10));
		expect(result.ok).toBe(true);
		if (result.ok && result.mode === 'inspect') {
			expect('verifiedResources' in result).toBe(false);
		}
	});
});

describe('SdkClient.verify (H0203)', () => {
	it('returns a typed verify verdict on a 200 response', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				verifiedResources: 4,
				diagnostics: []
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.verify(new Uint8Array(10));
		expect(result.ok).toBe(true);
		if (result.ok && result.mode === 'verify') {
			expect(result.verifiedResources).toBe(4);
		}
	});

	it('rejects a verify failure from the service', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: false,
				code: 'integrity_check_failed',
				message: 'SHA-256 mismatch on resources/phonemes.eld'
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.verify(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe('verify');
			expect(result.code).toBe('integrity_check_failed');
		}
	});
});

describe('SdkClient.validate (H0204)', () => {
	it('returns a typed validate verdict on a 200 response', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				inventory: { phonemes: [] },
				diagnostics: []
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(true);
		if (result.ok && result.mode === 'validate') {
			expect(result.inventory).toEqual({ phonemes: [] });
		}
	});

	it('maps a service ELD failure to a Hub error', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: false,
				code: 'eld_invalid',
				message: 'ELD has duplicate IPA identifier "a"',
				path: 'eld.phonemes[3].ipa'
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const hub = toHubError(result);
			expect(hub.code).toBe('phoneme_inventory_invalid');
			expect(hub.detail).toBe('eld.phonemes[3].ipa');
		}
	});
});

describe('SdkClient error paths (H0206, H0207)', () => {
	it('refuses an oversized body before contacting the service', async () => {
		const fetchImpl = vi.fn();
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(MAX_SDK_BODY_BYTES + 1));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('request_too_large');
			expect(result.diagnostics).toEqual([]);
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('translates a 503 from the service to service_unavailable', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('service_unavailable');
		}
	});

	it('translates a 504 from the service to timeout', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({}, 504));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('timeout');
		}
	});

	it('translates a 413 from the service to request_too_large', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({}, 413));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('request_too_large');
		}
	});

	it('rejects a non-JSON response as malformed_response', async () => {
		const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('malformed_response');
		}
	});

	it('rejects a response missing the ok flag', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ specVersion: '0.0.1-1' }));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('malformed_response');
		}
	});

	it('returns cancelled when the caller signal is already aborted', async () => {
		const caller = new AbortController();
		caller.abort();
		const fetchImpl = vi.fn(async () => jsonResponse({}));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10), { signal: caller.signal });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			// Caller-aborted requests are reported as cancelled, not
			// timeout — the Hub UI uses that distinction to decide
			// whether to retry.
			expect(result.code).toBe('cancelled');
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('returns cancelled when the caller aborts a pending fetch', async () => {
		const caller = new AbortController();
		const fetchImpl = vi.fn<typeof fetch>(
			async (_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						'abort',
						() => reject(new DOMException('Aborted', 'AbortError')),
						{ once: true }
					);
				})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const pending = client.validate(new Uint8Array(10), { signal: caller.signal });
		expect(fetchImpl).toHaveBeenCalledOnce();
		caller.abort();
		expect(await pending).toMatchObject({ ok: false, stage: 'validate', code: 'cancelled' });
	});

	it.each([
		{ error: new TypeError('fetch failed'), code: 'service_unavailable' },
		{ error: new Error('unexpected failure'), code: 'unknown' }
	])('preserves $code for an unrelated error after cancellation', async ({ error, code }) => {
		const caller = new AbortController();
		const fetchImpl = vi.fn(async () => {
			caller.abort();
			throw error;
		});
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10), { signal: caller.signal });
		expect(result).toMatchObject({ ok: false, stage: 'validate', code });
	});

	it('preserves timeout mapping for an AbortError without caller cancellation', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new DOMException('Aborted', 'AbortError');
		});
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.verify(new Uint8Array(10), {
			signal: new AbortController().signal
		});
		expect(result).toMatchObject({ ok: false, stage: 'verify', code: 'timeout' });
	});

	it('translates a network error to service_unavailable', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('service_unavailable');
		}
	});

	it('coerces an unknown SDK code to the closed set', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				ok: false,
				code: 'some-future-code-the-hub-does-not-know',
				message: 'x'
			})
		);
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('unknown');
			const hub = toHubError(result);
			expect(hub.code).toBe('internal_error');
		}
	});
});

describe.each(['inspect', 'verify', 'validate'] as const)(
	'SdkClient.%s success boundary',
	(mode) => {
		const success = {
			ok: true,
			specVersion: SUPPORTED_SPEC_VERSION,
			binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
			discoveredResources: 3,
			verifiedResources: 3,
			inventory: { phonemes: [] }
		};

		it.each([false, true])(
			'accepts a supported response with explicit mode: %s',
			async (explicit) => {
				const fetchImpl = vi.fn(async () =>
					jsonResponse({ ...success, ...(explicit ? { mode } : {}) })
				);
				const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
				expect(await client[mode](new Uint8Array(10))).toMatchObject({ ok: true, mode });
			}
		);

		it.each(['inspect', 'verify', 'validate', 'unknown', null].filter((value) => value !== mode))(
			'rejects an explicitly mismatched mode %s',
			async (responseMode) => {
				const fetchImpl = vi.fn(async () => jsonResponse({ ...success, mode: responseMode }));
				const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
				expect(await client[mode](new Uint8Array(10))).toMatchObject({
					ok: false,
					stage: mode,
					code: 'malformed_response'
				});
			}
		);

		it.each([
			{ field: 'specVersion', code: 'unsupported_spec_version', path: 'descriptor.spec_version' },
			{
				field: 'binaryContainerVersion',
				code: 'unsupported_binary_container_version',
				path: 'container.header.binary_container_version'
			}
		])('rejects unsupported $field on success', async ({ field, code, path }) => {
			const fetchImpl = vi.fn(async () => jsonResponse({ ...success, [field]: '99.0.0' }));
			const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
			expect(await client[mode](new Uint8Array(10))).toMatchObject({
				ok: false,
				stage: 'inspect',
				code,
				path,
				diagnostics: []
			});
		});
	}
);

describe('SdkClient response byte limit', () => {
	it('accepts exactly the byte limit and decodes UTF-8 split across chunks', async () => {
		const json = JSON.stringify({
			ok: true,
			specVersion: SUPPORTED_SPEC_VERSION,
			binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
			inventory: { label: 'é🙂' }
		});
		const encoded = new TextEncoder().encode(json);
		const body = new Uint8Array(MAX_SDK_RESPONSE_BYTES).fill(32);
		body.set(encoded);
		const split = encoded.indexOf(0xf0) + 1;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(body.subarray(0, split));
				controller.enqueue(body.subarray(split));
				controller.close();
			}
		});
		const fetchImpl = vi.fn(async () => new Response(stream));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		expect(await client.validate(new Uint8Array(10))).toMatchObject({
			ok: true,
			inventory: { label: 'é🙂' }
		});
		expect(stream.locked).toBe(false);
	});

	it('counts multibyte bytes and cancels without reading the rest of an oversized response', async () => {
		const chunk = new TextEncoder().encode('é'.repeat(MAX_SDK_RESPONSE_BYTES / 4));
		const cancel = vi.fn();
		let reads = 0;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					reads++;
					controller.enqueue(reads <= 2 ? chunk : new Uint8Array([32]));
				},
				cancel
			},
			{ highWaterMark: 0 }
		);
		const fetchImpl = vi.fn(async () => new Response(stream));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		expect(await client.verify(new Uint8Array(10))).toMatchObject({
			ok: false,
			stage: 'verify',
			code: 'malformed_response',
			message: 'Service response exceeded the size limit.'
		});
		expect(reads).toBe(3);
		expect(cancel).toHaveBeenCalledOnce();
		expect(stream.locked).toBe(false);
	});

	it('treats an absent response body as malformed JSON', async () => {
		const fetchImpl = vi.fn(async () => new Response(null));
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		expect(await client.inspect(new Uint8Array(10))).toMatchObject({
			ok: false,
			stage: 'inspect',
			code: 'malformed_response'
		});
	});
});
