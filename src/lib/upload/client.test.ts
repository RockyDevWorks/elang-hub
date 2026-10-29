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

	it('maps a 502 to VALIDATION_UNAVAILABLE', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 502 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_UNAVAILABLE'));
	});

	it('maps an unrelated error status (e.g. 500) to VALIDATION_FAILED', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 500 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_FAILED'));
	});

	it('rejects when the verdict payload is not an object', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify('nope'), { status: 200 }))
		);
		await expect(
			requestValidation(new ArrayBuffer(0), new AbortController().signal)
		).rejects.toMatchObject(uploadError('VALIDATION_FAILED'));
	});

	it('coerces a verdict with non-array diagnostics/messages into empty arrays', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							ok: true,
							diagnostics: 'not-an-array',
							messages: { not: 'an-array' }
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);
		const result = await requestValidation(new ArrayBuffer(0), new AbortController().signal);
		expect(result).toEqual({ ok: true, diagnostics: [], messages: [] });
	});

	it('filters non-string entries out of diagnostics and messages', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							ok: true,
							diagnostics: ['keep', 42, null, 'also-keep'],
							messages: [{}, 'only-string']
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
			)
		);
		const result = await requestValidation(new ArrayBuffer(0), new AbortController().signal);
		expect(result).toEqual({
			ok: true,
			diagnostics: ['keep', 'also-keep'],
			messages: ['only-string']
		});
	});
});
