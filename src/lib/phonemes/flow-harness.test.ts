/**
 * Unit tests for the shared route-level flow harness.
 *
 * The harness is used by both route-level suites, so a defect in it
 * would fail two suites in a confusing way. These tests pin its
 * contract directly:
 *
 *   - the `fetch` stub normalises every input shape to a URL string;
 *   - the restore handle really puts the original `fetch` back;
 *   - the envelope builder produces a shape `parseSdkResult` accepts.
 */

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { emptyInventory, jsonResponse, stubBrowserFetch, validateEnvelope } from './flow-harness';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('flow harness', () => {
	it('normalises a string input to a URL string', async () => {
		const seen: string[] = [];
		const restore = stubBrowserFetch((url) => {
			seen.push(url);
			return Promise.resolve(jsonResponse({ ok: true }));
		});

		await globalThis.fetch('/api/phonemes');
		restore();

		expect(seen).toEqual(['/api/phonemes']);
	});

	it('normalises a URL-object input to its href', async () => {
		const seen: string[] = [];
		const restore = stubBrowserFetch((url) => {
			seen.push(url);
			return Promise.resolve(jsonResponse({ ok: true }));
		});

		await globalThis.fetch(new URL('http://localhost/api/phonemes'));
		restore();

		expect(seen).toEqual(['http://localhost/api/phonemes']);
	});

	it('normalises a Request input to its url', async () => {
		const seen: string[] = [];
		const restore = stubBrowserFetch((url) => {
			seen.push(url);
			return Promise.resolve(jsonResponse({ ok: true }));
		});

		await globalThis.fetch(new Request('http://localhost/api/phonemes'));
		restore();

		expect(seen).toEqual(['http://localhost/api/phonemes']);
	});

	it('restores the original fetch through the returned handle', () => {
		const restore = stubBrowserFetch(() => jsonResponse({ ok: true }));
		expect(globalThis.fetch).not.toBe(originalFetch);

		restore();
		expect(globalThis.fetch).toBe(originalFetch);
	});

	it('builds an envelope the SDK contract accepts', () => {
		const envelope = validateEnvelope(emptyInventory());

		expect(envelope).toMatchObject({
			ok: true,
			mode: 'validate',
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0',
			diagnostics: []
		});
		expect(typeof envelope.phonemeResourcePath).toBe('string');
	});

	it('lets a suite override the resource path and diagnostics', () => {
		const envelope = validateEnvelope(emptyInventory(), {
			phonemeResourcePath: 'Linguistics/custom.eld',
			diagnostics: [{ stage: 'validate', code: 'eld_invalid', message: 'm' }]
		});

		expect(envelope.phonemeResourcePath).toBe('Linguistics/custom.eld');
		expect(envelope.diagnostics).toHaveLength(1);
	});
});
