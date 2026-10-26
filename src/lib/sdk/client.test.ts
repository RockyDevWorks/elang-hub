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
import { MAX_SDK_BODY_BYTES } from './bounds';

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
