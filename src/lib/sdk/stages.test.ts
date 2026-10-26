/**
 * Stage-boundary integration tests (H0208).
 *
 * Per H0208, the Hub must cover malformed containers, corrupted
 * resources, incompatible versions and invalid ELD, and verify that
 * only fully validated packages reach a successful verdict.
 *
 * These tests treat the SDK client as the unit under test and use
 * a stub `fetch` to drive every documented failure mode.
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

interface FakeService {
	readonly client: SdkClient;
	readonly fetchImpl: ReturnType<typeof vi.fn>;
}

function fakeService(respond: (url: string, init: RequestInit) => Promise<Response>): FakeService {
	const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		respond(String(input), init ?? {})
	);
	const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
	return { client, fetchImpl };
}

describe('H0208 — validation stage boundaries', () => {
	it('rejects a malformed container at the inspect stage', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: false,
				stage: 'inspect',
				code: 'malformed_container',
				message: 'Container header is truncated.'
			})
		);
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe('inspect');
			expect(result.code).toBe('malformed_container');
			expect(toHubError(result).code).toBe('malformed_package');
		}
	});

	it('rejects a corrupted resource at the verify stage', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: false,
				stage: 'verify',
				code: 'corrupted_resource',
				message: 'Resource descriptor.eld has an invalid SHA-256.',
				path: 'resources/descriptor.eld'
			})
		);
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.stage).toBe('verify');
			expect(result.code).toBe('corrupted_resource');
		}
	});

	it('rejects an incompatible spec version', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: true,
				specVersion: '0.0.2-1',
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				discoveredResources: 1
			})
		);
		const result = await client.inspect(new Uint8Array(10));
		expect(result).toMatchObject({
			ok: false,
			stage: 'inspect',
			code: 'unsupported_spec_version'
		});
	});

	it('rejects an incompatible binary container version', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: '0.2.0',
				discoveredResources: 1
			})
		);
		const result = await client.inspect(new Uint8Array(10));
		expect(result).toMatchObject({
			ok: false,
			stage: 'inspect',
			code: 'unsupported_binary_container_version'
		});
	});

	it('rejects an invalid ELD', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: false,
				stage: 'validate',
				code: 'eld_invalid',
				message: 'Duplicate IPA identifier "a".',
				path: 'eld.phonemes[3].ipa'
			})
		);
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('eld_invalid');
			expect(toHubError(result).code).toBe('phoneme_inventory_invalid');
		}
	});

	it('rejects an oversized package before any network call', async () => {
		const fetchImpl = vi.fn();
		const client = new SdkClient({ serviceUrl: 'https://svc', fetchImpl });
		const result = await client.validate(new Uint8Array(MAX_SDK_BODY_BYTES + 1));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('request_too_large');
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('returns ok=true only for a fully validated package', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				inventory: { phonemes: [{ ipa: 'a' }] },
				diagnostics: []
			})
		);
		const result = await client.validate(new Uint8Array(10));
		expect(result.ok).toBe(true);
		if (result.ok && result.mode === 'validate') {
			expect(result.specVersion).toBe(SUPPORTED_SPEC_VERSION);
			expect(result.binaryContainerVersion).toBe(SUPPORTED_BINARY_CONTAINER_VERSION);
			expect(result.inventory).toEqual({ phonemes: [{ ipa: 'a' }] });
		} else {
			expect.fail('expected a validate verdict');
		}
	});

	it('does not present inspect alone as a successful validate verdict', async () => {
		const { client } = fakeService(async () =>
			jsonResponse({
				ok: true,
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
				discoveredResources: 1
			})
		);
		const inspect = await client.inspect(new Uint8Array(10));
		expect(inspect.ok).toBe(true);
		if (inspect.ok) {
			// The SDK adapter never claims an inventory for inspect —
			// that is the structural guarantee that prevents a Hub UI
			// from promoting an inspect verdict to a successful validate.
			expect('inventory' in inspect).toBe(false);
		}
		const validate = await client.validate(new Uint8Array(10));
		// The client faithfully reports the verdict the service sent;
		// it does NOT silently rewrite a validate call into an inspect.
		// The Hub view-model layer (H03) is responsible for rejecting
		// a validate verdict with a missing/empty inventory.
		expect(validate.ok).toBe(true);
		if (validate.ok) {
			expect(validate.mode).toBe('validate');
			if (validate.mode === 'validate') {
				expect(validate.inventory).toBeNull();
			}
		}
	});
});
