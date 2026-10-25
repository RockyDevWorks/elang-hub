import { describe, expect, it, vi } from 'vitest';
import { UploadController, type ValidationResult } from './controller';

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
		await settle();

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
		await settle();

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
});
