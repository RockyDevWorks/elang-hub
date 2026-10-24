import { describe, expect, it } from 'vitest';
import { isUploadError, uploadError } from './errors';

describe('upload errors', () => {
	it('recognises an UploadError built from a code', () => {
		const error = uploadError('FILE_TOO_LARGE');
		expect(isUploadError(error)).toBe(true);
	});

	it('rejects an arbitrary object that looks like an UploadError', () => {
		// The weak duck-type check would have accepted this. The
		// shared guard rejects it because `code` is not one of the
		// known upload error codes.
		const imposter = { code: 'NOT_REAL', message: 'spoofed' };
		expect(isUploadError(imposter)).toBe(false);
	});

	it('rejects a value whose code is the wrong type', () => {
		expect(isUploadError({ code: 42, message: 'numeric code' })).toBe(false);
	});

	it('rejects a value whose message is the wrong type', () => {
		expect(isUploadError({ code: 'FILE_TOO_LARGE', message: 42 })).toBe(false);
	});

	it('rejects null, primitives, and undefined', () => {
		expect(isUploadError(null)).toBe(false);
		expect(isUploadError(undefined)).toBe(false);
		expect(isUploadError('error')).toBe(false);
		expect(isUploadError(42)).toBe(false);
	});
});
