import { describe, expect, it, vi } from 'vitest';
import {
	UploadController,
	describeSelection,
	readFile,
	toUploadError,
	type UploadState,
	type ValidationResult
} from './controller';
import { uploadError } from './errors';

function file(name: string, size = 1024): File {
	return new File([new Uint8Array(size)], name, { type: 'application/vnd.elang' });
}

const OK: ValidationResult = { ok: true, diagnostics: [], messages: [] };

/**
 * A validate function that never resolves on its own, so a run can be
 * observed mid-flight. It rejects when the signal aborts, which is
 * what a real request does.
 */
function pending(): (bytes: ArrayBuffer, signal: AbortSignal) => Promise<ValidationResult> {
	return (_bytes, signal) =>
		new Promise<ValidationResult>((_resolve, reject) => {
			signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		});
}

/** Wait one microtask tick. */
async function tick(): Promise<void> {
	await Promise.resolve();
}

/** Wait several microtask ticks so a chain of awaits makes progress. */
async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) {
		await tick();
	}
}

describe('UploadController (H0104, H0105, H0106, H0108)', () => {
	it('starts idle', () => {
		const controller = new UploadController();
		expect(controller.state.phase).toBe('idle');
		expect(controller.state.fileName).toBeNull();
		expect(controller.state.progress).toBe(0);
	});

	it('rejects an invalid selection before reading the file', async () => {
		const controller = new UploadController();
		const validate = vi.fn();
		await controller.select([file('notes.txt')], validate);
		expect(validate).not.toHaveBeenCalled();
		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('UNSUPPORTED_EXTENSION');
	});

	it('reads then validates a valid selection', async () => {
		const controller = new UploadController();
		const phases: string[] = [];
		controller.subscribe((state) => phases.push(state.phase));

		await controller.select([file('phonemes.elang')], async () => OK);

		expect(phases).toContain('reading');
		expect(phases).toContain('validating');
		expect(controller.state.phase).toBe('complete');
		expect(controller.state.progress).toBe(100);
		expect(controller.state.result).toEqual(OK);
	});

	it('reports the selected file name and size', async () => {
		const controller = new UploadController();
		await controller.select([file('phonemes.elang', 2048)], async () => OK);
		expect(controller.state.fileName).toBe('phonemes.elang');
		expect(controller.state.fileSize).toBe(2048);
	});

	it('passes the package bytes to the validator', async () => {
		const controller = new UploadController();
		let received: ArrayBuffer | undefined;
		await controller.select([file('phonemes.elang', 512)], async (bytes) => {
			received = bytes;
			return OK;
		});
		expect(received).toBeDefined();
		expect(received?.byteLength).toBe(512);
	});

	it('cancels an in-flight run (H0105)', async () => {
		const controller = new UploadController();
		const run = controller.select([file('phonemes.elang')], pending());
		await settle();

		controller.cancel();
		await run;

		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('UPLOAD_CANCELLED');
	});

	it('aborts the validator signal on cancel', async () => {
		const controller = new UploadController();
		let signal: AbortSignal | null = null;
		const run = controller.select([file('phonemes.elang')], async (_bytes, s) => {
			signal = s;
			// Never resolves until the signal fires, then rejects.
			return await new Promise<ValidationResult>((_resolve, reject) => {
				s.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			});
		});
		// Wait for the validator to actually be invoked rather than
		// assuming a fixed number of microtask ticks is enough. The
		// file read crosses an event-loop boundary wherever
		// `File.stream()` exists, so a tick count is a race.
		await vi.waitFor(() => {
			expect(signal).not.toBeNull();
		});

		controller.cancel();
		await run;

		expect((signal as AbortSignal | null)?.aborted).toBe(true);
	});

	it('ignores a stale result after a replacement upload (H0106)', async () => {
		const controller = new UploadController();
		let releaseFirst: (result: ValidationResult) => void = () => {};

		// The first run is held open so it finishes *after* the second
		// run. Its result must not overwrite the newer one.
		const first = controller.select(
			[file('first.elang')],
			() =>
				new Promise<ValidationResult>((resolve) => {
					releaseFirst = resolve;
				})
		);
		await settle();

		await controller.select([file('second.elang')], async () => OK);

		releaseFirst({ ok: false, diagnostics: ['STALE'], messages: ['stale'] });
		await first;

		expect(controller.state.fileName).toBe('second.elang');
		expect(controller.state.result?.ok).toBe(true);
		expect(controller.state.result?.diagnostics).toEqual([]);
	});

	it('resets to idle and clears the result (H0106)', async () => {
		const controller = new UploadController();
		await controller.select([file('phonemes.elang')], async () => OK);
		expect(controller.state.phase).toBe('complete');

		controller.reset();

		expect(controller.state.phase).toBe('idle');
		expect(controller.state.fileName).toBeNull();
		expect(controller.state.fileSize).toBeNull();
		expect(controller.state.error).toBeNull();
		expect(controller.state.result).toBeNull();
		expect(controller.state.progress).toBe(0);
	});

	it('resets while a run is in flight without leaving it running (H0105, H0106)', async () => {
		const controller = new UploadController();
		let signal: AbortSignal | null = null;
		const run = controller.select([file('phonemes.elang')], async (_bytes, s) => {
			signal = s;
			return await new Promise<ValidationResult>((_resolve, reject) => {
				s.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			});
		});
		// See the note in "aborts the validator signal on cancel" — the
		// validator must have been invoked before the reset, or the
		// assertion below would be checking a signal that never ran.
		await vi.waitFor(() => {
			expect(signal).not.toBeNull();
		});

		controller.reset();
		await run;

		expect((signal as AbortSignal | null)?.aborted).toBe(true);
		expect(controller.state.phase).toBe('idle');
	});

	it('surfaces a rejected package without treating it as an error', async () => {
		const controller = new UploadController();
		const rejected: ValidationResult = {
			ok: false,
			diagnostics: ['FOOTER_BAD_MAGIC'],
			messages: ['footer magic mismatch']
		};
		await controller.select([file('phonemes.elang')], async () => rejected);
		expect(controller.state.phase).toBe('complete');
		expect(controller.state.result?.ok).toBe(false);
		expect(controller.state.error).toBeNull();
	});

	it('maps a service failure to an actionable error (H0107)', async () => {
		const controller = new UploadController();
		await controller.select([file('phonemes.elang')], async () => {
			throw new Error('ECONNREFUSED 10.0.0.4:8080');
		});
		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('VALIDATION_FAILED');
		// The internal detail must not leak into the message.
		expect(controller.state.error?.message).not.toContain('10.0.0.4');
	});

	it('does not leak the thrown detail into the error message', async () => {
		const controller = new UploadController();
		await controller.select([file('phonemes.elang')], async () => {
			throw new Error('internal detail: /var/secrets/key.pem');
		});
		expect(controller.state.error?.message).not.toContain('/var/secrets');
	});

	it('rejects a truncated stream as FILE_TRUNCATED', async () => {
		const controller = new UploadController();
		// A `File` whose declared size is 8 bytes but the stream only
		// yields 4 — an early `done`. The package is incomplete and
		// must not be forwarded to the validator.
		const truncated: File = {
			name: 'incomplete.elang',
			size: 8,
			type: 'application/vnd.elang',
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new Uint8Array(4));
						controller.close();
					}
				})
		} as unknown as File;
		const validate = vi.fn();
		await controller.select([truncated], validate);
		expect(validate).not.toHaveBeenCalled();
		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('FILE_TRUNCATED');
	});

	it('stops notifying subscribers after unsubscribe', async () => {
		const controller = new UploadController();
		const listener = vi.fn();
		const unsubscribe = controller.subscribe(listener);
		unsubscribe();
		await controller.select([file('phonemes.elang')], async () => OK);
		expect(listener).not.toHaveBeenCalled();
	});

	it('cancel() is a no-op when no run is in flight', () => {
		const controller = new UploadController();
		// The state must not change: no file, no error, no progress.
		const before = controller.state;
		controller.cancel();
		expect(controller.state).toBe(before);
		expect(controller.state.phase).toBe('idle');
	});

	it('a non-abort error during validate surfaces as VALIDATION_FAILED, not UPLOAD_CANCELLED', async () => {
		// The signal is not yet aborted, the generation is current,
		// and the validator throws a plain error (no DOMException).
		// The catch branch must hit `toUploadError`, not the
		// `signal.aborted` short-circuit.
		const controller = new UploadController();
		await controller.select([file('phonemes.elang')], async () => {
			throw new TypeError('boom');
		});
		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('VALIDATION_FAILED');
	});

	it('dropping the validate result after a replacement upload is a silent no-op', async () => {
		// Distinct from "ignores a stale result after a replacement
		// upload": this one exercises the *successful* validate path
		// where the result has already been computed but a newer
		// generation has taken over before the post-validate check
		// runs. The state must reflect the second run, not the first.
		const controller = new UploadController();
		let releaseFirst: (result: ValidationResult) => void = () => {};

		const first = controller.select(
			[file('first.elang')],
			() =>
				new Promise<ValidationResult>((resolve) => {
					releaseFirst = resolve;
				})
		);
		await settle();

		// Second run completes synchronously and bumps the generation.
		await controller.select([file('second.elang')], async () => OK);

		// Releasing the first validate *now* should see `generation !==
		// this.#generation` and return without touching state.
		releaseFirst({ ok: false, diagnostics: ['NOPE'], messages: ['stale'] });
		await first;

		expect(controller.state.fileName).toBe('second.elang');
		expect(controller.state.phase).toBe('complete');
		expect(controller.state.result?.diagnostics).toEqual([]);
	});

	it('cancel() mid-validate surfaces as UPLOAD_CANCELLED, not VALIDATION_FAILED', async () => {
		// The validator is in flight; the user cancels. The signal
		// becomes aborted, but the validator rejects with an
		// AbortError, so the catch block hits the `signal.aborted`
		// short-circuit (not `toUploadError`).
		const controller = new UploadController();
		let signal: AbortSignal | null = null;
		const run = controller.select([file('phonemes.elang')], async (_bytes, s) => {
			signal = s;
			return await new Promise<ValidationResult>((_resolve, reject) => {
				s.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			});
		});
		await vi.waitFor(() => {
			expect(signal).not.toBeNull();
		});

		controller.cancel();
		await run;

		expect(controller.state.phase).toBe('error');
		expect(controller.state.error?.code).toBe('UPLOAD_CANCELLED');
	});
});

describe('readFile (H0104)', () => {
	it('rejects with an AbortError when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(readFile(file('phonemes.elang'), controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
	});

	it('falls back to arrayBuffer when file.stream is unavailable', async () => {
		// Some test environments (older Node, polyfills) expose
		// `arrayBuffer` but not `stream`. The fallback path keeps
		// the bar visible to the caller.
		const noStream: File = {
			name: 'plain.elang',
			size: 64,
			type: 'application/vnd.elang',
			arrayBuffer: () => Promise.resolve(new Uint8Array(64).buffer),
			stream: undefined
		} as unknown as File;
		const controller = new AbortController();
		const buf = await readFile(noStream, controller.signal);
		expect(buf.byteLength).toBe(64);
	});

	it('rejects with FILE_TRUNCATED when the stream yields fewer bytes than the declared size', async () => {
		// `received !== file.size` after a clean stream end. The
		// declaration said 16 bytes but only 8 arrived.
		const shortStream: File = {
			name: 'short.elang',
			size: 16,
			type: 'application/vnd.elang',
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(c) {
						c.enqueue(new Uint8Array(8));
						c.close();
					}
				})
		} as unknown as File;
		const controller = new AbortController();
		await expect(readFile(shortStream, controller.signal)).rejects.toMatchObject(
			uploadError('FILE_TRUNCATED')
		);
	});

	it('aborts the read loop when the signal is already aborted before the first chunk lands', async () => {
		// The signal-aborted check at the top of the for-loop fires
		// even if the stream is open. A pre-aborted signal must
		// surface as AbortError before any chunk is consumed.
		const delayed: File = {
			name: 'delayed.elang',
			size: 4,
			type: 'application/vnd.elang',
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
			stream: () =>
				new ReadableStream<Uint8Array>({
					start() {
						// never enqueues
					}
				})
		} as unknown as File;
		const controller = new AbortController();
		controller.abort();
		await expect(readFile(delayed, controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
	});

	it('treats a zero-byte file as a complete empty stream', async () => {
		// `file.size === 0` keeps the progress callback from being
		// called (avoiding 0/0 NaN) but the read still completes.
		const empty: File = {
			name: 'empty.elang',
			size: 0,
			type: 'application/vnd.elang',
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(c) {
						c.close();
					}
				})
		} as unknown as File;
		const controller = new AbortController();
		const buf = await readFile(empty, controller.signal);
		expect(buf.byteLength).toBe(0);
	});
});

describe('toUploadError (H0107)', () => {
	it('passes an existing UploadError through unchanged', () => {
		const original = uploadError('FILE_TOO_LARGE');
		expect(toUploadError(original)).toBe(original);
	});

	it('maps a NotReadableError DOMException to FILE_UNREADABLE', () => {
		const caught = new DOMException('disk gone', 'NotReadableError');
		expect(toUploadError(caught)).toMatchObject(uploadError('FILE_UNREADABLE'));
	});

	it('maps an AbortError DOMException to UPLOAD_CANCELLED', () => {
		const caught = new DOMException('aborted', 'AbortError');
		expect(toUploadError(caught)).toMatchObject(uploadError('UPLOAD_CANCELLED'));
	});

	it('maps a non-upload, non-DOMException value to VALIDATION_FAILED', () => {
		expect(toUploadError(new Error('boom'))).toMatchObject(uploadError('VALIDATION_FAILED'));
		expect(toUploadError('plain string')).toMatchObject(uploadError('VALIDATION_FAILED'));
		expect(toUploadError(null)).toMatchObject(uploadError('VALIDATION_FAILED'));
	});
});

describe('describeSelection', () => {
	const idle: UploadState = {
		phase: 'idle',
		fileName: null,
		fileSize: null,
		progress: 0,
		error: null,
		result: null
	};

	it('returns "No package selected" when no file is chosen', () => {
		expect(describeSelection(idle)).toBe('No package selected');
	});

	it('returns "<name> (<size>)" when a file is selected', async () => {
		const controller = new UploadController();
		await controller.select([file('phonemes.elang', 2048)], async () => OK);
		// `describeSelection` reads the live state, so the assertion
		// has to come after the run completes.
		expect(describeSelection(controller.state)).toBe('phonemes.elang (2.0 kB)');
	});
});
