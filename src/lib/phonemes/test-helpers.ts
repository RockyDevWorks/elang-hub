/**
 * Test-only helpers for the phoneme module.
 *
 * These are imported by both the page-state controller tests
 * (`controller.test.ts`) and the route-level integration tests
 * (`routes/page.test.ts`). Sharing them keeps the test fixtures
 * aligned — any change to the `successView()` package shape
 * propagates to every caller.
 *
 * The file lives under `src/lib/` because the controllers and
 * SDK client it exercises are also under `src/lib/`, and Vitest's
 * `$lib` alias resolves here for the integration test. The
 * `controller.test.ts` / `page.test.ts` files are the only
 * importers; nothing in production code references this module.
 */

import type { PhonemeViewResult } from '../view';

/* ------------------------------------------------------------------ */
/* Minimal File / Blob stand-in                                         */
/* ------------------------------------------------------------------ */

/**
 * A `File`-shaped stand-in that streams its bytes from an in-memory
 * `Uint8Array` via a hand-built `ReadableStream`. The controller's
 * `readFileWithProgress` reads through `file.stream().getReader()`,
 * which the real `File` provides; this minimal surface is enough
 * to exercise the read pipeline under Vitest's `node` environment
 * (no DOM polyfills).
 */
export interface MinimalFile {
	readonly name: string;
	readonly size: number;
	readonly stream: () => ReadableStream<Uint8Array>;
}

export function makeFile(name: string, bytes: Uint8Array): MinimalFile {
	const total = bytes.byteLength;
	let emitted = 0;
	const stream = () =>
		new ReadableStream<Uint8Array>({
			pull(controller) {
				if (emitted >= total) {
					controller.close();
					return;
				}
				controller.enqueue(bytes);
				emitted = total;
			},
			cancel() {
				emitted = total;
			}
		});
	return { name, size: total, stream };
}

/** A file whose `stream()` immediately errors — exercises the read catch. */
export function makeBrokenFile(name: string, size: number): MinimalFile {
	const stream = () =>
		new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.error(new Error('disk error'));
			},
			cancel() {
				/* no-op */
			}
		});
	return { name, size, stream };
}

/* ------------------------------------------------------------------ */
/* View result fixtures                                                 */
/* ------------------------------------------------------------------ */

/**
 * A minimal `ok: true` view: a well-formed `PhonemeView` with an empty
 * inventory. The package shape is the canonical "test" language; the
 * inventory is empty so no DOM assertions depend on its contents.
 */
export function successView(): PhonemeViewResult {
	return {
		ok: true,
		view: Object.freeze({
			package: {
				identifier: 'urn:elang:language:test:test:1.0.0',
				namespace: 'test',
				languageName: 'test',
				languageVersion: '1.0.0',
				name: 'Test',
				description: null,
				specVersions: Object.freeze({
					specVersion: '0.1.0',
					binaryContainerVersion: '0.1.0'
				})
			},
			phonemeResourcePath: 'Linguistics/phonemes.eld',
			inventory: Object.freeze({
				groups: [],
				rootCount: 0,
				allophoneCount: 0,
				isEmpty: true
			}),
			diagnostics: []
		})
	};
}
