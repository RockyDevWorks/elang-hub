import { describe, expect, it, vi } from 'vitest';

// `$app/env/private` is SvelteKit 3's generated accessor. The module
// is mocked here so the endpoint sees a fixed validation URL without a
// configured deployment environment. The getter keeps the value live,
// matching how the endpoint reads it per request.
vi.mock('$app/env/private', () => ({
	get SDK_SERVICE_URL(): string {
		return 'http://validation.test';
	}
}));

type ValidateRoute = (event: unknown) => Promise<Response>;

const { POST } = (await import('./+server')) as unknown as { POST: ValidateRoute };

function event(upstream: typeof fetch): unknown {
	return {
		request: new Request('http://localhost/api/validate', {
			method: 'POST',
			body: new Uint8Array([1, 2, 3])
		}),
		fetch: upstream
	};
}

describe('validate route response validation', () => {
	it('returns a structured 502 when the upstream body is not JSON', async () => {
		const upstream: typeof fetch = async () =>
			new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } });
		const response = await POST(event(upstream));
		expect(response.status).toBe(502);
		const body = (await response.json()) as { ok: boolean; messages: string[] };
		expect(body.ok).toBe(false);
		expect(body.messages.length).toBeGreaterThan(0);
	});

	it('exposes only ok, diagnostics, and messages from the upstream payload', async () => {
		const upstream: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					ok: true,
					diagnostics: [],
					messages: [],
					unexpected: 'leak',
					phonemes: ['l', 'i']
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		const response = await POST(event(upstream));
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(body.diagnostics).toEqual([]);
		expect(body.messages).toEqual([]);
		expect('unexpected' in body).toBe(false);
		expect('phonemes' in body).toBe(false);
	});

	it('drops non-string diagnostics and messages', async () => {
		const upstream: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					ok: false,
					diagnostics: ['FOOTER_BAD_MAGIC', 42, null],
					messages: ['footer magic mismatch', { nested: true }]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		const response = await POST(event(upstream));
		const body = (await response.json()) as {
			ok: boolean;
			diagnostics: string[];
			messages: string[];
		};
		expect(body.diagnostics).toEqual(['FOOTER_BAD_MAGIC']);
		expect(body.messages).toEqual(['footer magic mismatch']);
	});

	it('forwards the package bytes to the upstream service unchanged', async () => {
		let forwarded: Uint8Array | null = null;
		const upstream: typeof fetch = async (_input, init) => {
			forwarded = new Uint8Array(init?.body as ArrayBuffer);
			return new Response(JSON.stringify({ ok: true, diagnostics: [], messages: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		};
		await POST(event(upstream));
		expect(forwarded).not.toBeNull();
		expect(Array.from(forwarded as unknown as Uint8Array)).toEqual([1, 2, 3]);
	});

	it('reports 503 when the upstream service is unreachable', async () => {
		const upstream: typeof fetch = async () => {
			throw new Error('ECONNREFUSED');
		};
		const response = await POST(event(upstream));
		expect(response.status).toBe(503);
		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(false);
	});

	it('caps the body at MAX_FILE_BYTES with a 413 and stops reading', async () => {
		// One byte over the 16 MiB cap: the route must stop reading
		// and return 413 without ever calling the upstream service.
		const oversized = new Uint8Array(16 * 1024 * 1024 + 1);
		const upstream = vi.fn();
		const response = await POST({
			request: new Request('http://localhost/api/validate', {
				method: 'POST',
				body: oversized
			}),
			fetch: upstream
		});
		expect(response.status).toBe(413);
		expect(upstream).not.toHaveBeenCalled();
	});
});
