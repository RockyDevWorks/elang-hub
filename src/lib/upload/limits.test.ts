import { describe, expect, it } from 'vitest';
import { ACCEPTED_EXTENSION, MAX_FILE_BYTES, MAX_FILE_COUNT } from './limits';

describe('upload limits', () => {
	it('accepts the documented extension', () => {
		expect(ACCEPTED_EXTENSION).toBe('.elang');
	});

	it('caps a single selection', () => {
		expect(MAX_FILE_COUNT).toBe(1);
	});

	it('caps the package size at 16 MiB', () => {
		expect(MAX_FILE_BYTES).toBe(16 * 1024 * 1024);
	});
});
