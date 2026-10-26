/**
 * Tests for the upload limits module (H0503).
 *
 * Pins the constants so the Hub's client-side cap and the server's
 * `MAX_SDK_BODY_BYTES` cannot silently drift apart. A drift here
 * would let a selection slip past the page that the endpoint would
 * then reject — confusing for the user and a near miss for a
 * browser-OOM scenario.
 */

import { describe, expect, it } from 'vitest';
import { ACCEPT_ATTRIBUTE, ACCEPTED_EXTENSION, MAX_FILE_BYTES, MAX_FILE_COUNT } from './limits';
import { MAX_SDK_BODY_BYTES } from '../sdk';

describe('upload limits (H0503)', () => {
	it('caps accepted files at 16 MiB', () => {
		expect(MAX_FILE_BYTES).toBe(16 * 1024 * 1024);
	});

	it('accepts only one file per selection', () => {
		expect(MAX_FILE_COUNT).toBe(1);
	});

	it('mirrors the server-side body cap so the two sides agree', () => {
		expect(MAX_FILE_BYTES).toBe(MAX_SDK_BODY_BYTES);
	});

	it('exposes the .elang extension and an accept attribute that contains it', () => {
		expect(ACCEPTED_EXTENSION).toBe('.elang');
		expect(ACCEPT_ATTRIBUTE).toContain('.elang');
	});
});
