import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestValidation } from './client';
import { uploadError } from './errors';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('requestValidation (H0107)', () => {
	it('returns the parsed verdict on 200', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ ok: true, diagnostics: [], messages: [] }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
			)
		);
		const result = await requestValidation(new ArrayBuffer(0), new AbortController().signal);
		expect(result.ok).toBe(true);
	});

	it('maps a 413 to FILE_TOO_LARGE', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 413 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('FILE_TOO_LARGE'));
	});

	it('maps a 503 to VALIDATION_UNAVAILABLE', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 503 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_UNAVAILABLE'));
	});

	it('maps a network error to VALIDATION_UNAVAILABLE', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_UNAVAILABLE'));
	});

	it('maps an abort to UPLOAD_CANCELLED', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new DOMException('Aborted', 'AbortError');
			})
		);
		const controller = new AbortController();
		controller.abort();
		await expect(requestValidation(new ArrayBuffer(0), controller.signal)).rejects.toMatchObject(
			uploadError('UPLOAD_CANCELLED')
		);
	});

	it('rejects malformed JSON without leaking the parser error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('not json', { status: 200 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_FAILED'));
	});

	it('coerces a malformed verdict into a rejection', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('null', { status: 200 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_FAILED'));
	});
});
