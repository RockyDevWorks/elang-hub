import { uploadError, isUploadError, type UploadError } from './errors';
import { checkSelection, formatFileSize } from './validate';

/**
 * The phases an upload moves through.
 *
 * `idle` → `reading` → `validating` → `complete`
 *
 * `reading` covers reading the bytes into memory; `validating` covers
 * the round trip to the validation service. They are separate phases
 * because they fail for different reasons and the user needs to know
 * which one stopped.
 */
export type UploadPhase = 'idle' | 'reading' | 'validating' | 'complete' | 'error';

/**
 * The outcome of a validation run.
 *
 * Mirrors the shape the validation service returns. It is deliberately
 * narrow in v0.1.0: the phoneme view model arrives with the viewer
 * phase (H03).
 */
export interface ValidationResult {
	readonly ok: boolean;
	/** Stable diagnostic codes, when the package was rejected. */
	readonly diagnostics: readonly string[];
	/** Human-readable messages, safe to render. */
	readonly messages: readonly string[];
}

export interface UploadState {
	readonly phase: UploadPhase;
	/** The name of the file currently being processed, if any. */
	readonly fileName: string | null;
	/** The size of the file currently being processed, if any. */
	readonly fileSize: number | null;
	/** 0–100. Meaningful while `phase` is `reading` or `validating`. */
	readonly progress: number;
	/** The current error, if the phase is `error`. */
	readonly error: UploadError | null;
	/** The validation result, if the phase is `complete`. */
	readonly result: ValidationResult | null;
}

const IDLE_STATE: UploadState = {
	phase: 'idle',
	fileName: null,
	fileSize: null,
	progress: 0,
	error: null,
	result: null
};

/**
 * Performs the round trip to the validation service.
 *
 * Receives the package bytes and an `AbortSignal`, and resolves with
 * the service's verdict.
 */
export type ValidateFn = (bytes: ArrayBuffer, signal: AbortSignal) => Promise<ValidationResult>;

/**
 * The transient upload lifecycle.
 *
 * v0.1.0 is session-based: the bytes live in memory for the duration
 * of one run and are dropped the moment the run completes, is
 * cancelled or is replaced. Nothing is persisted, published or stored
 * server-side (REQ-HUB-003, H0104).
 *
 * Every operation is cancellable, and a cancelled or superseded run can
 * never overwrite the state of a newer one — that is what the
 * `generation` counter is for (H0106).
 */
export class UploadController {
	#state: UploadState = IDLE_STATE;
	#listeners = new Set<(state: UploadState) => void>();
	#abortController: AbortController | null = null;
	/**
	 * Monotonic run counter.
	 *
	 * Each accepted selection increments it. An async continuation
	 * checks its captured value before touching state, so a slow run
	 * that finishes after a replacement upload is discarded rather than
	 * overwriting the newer result.
	 */
	#generation = 0;

	/**
	 * Subscribe to state changes.
	 *
	 * Returns an unsubscribe function.
	 */
	subscribe(listener: (state: UploadState) => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	/** The current state. */
	get state(): UploadState {
		return this.#state;
	}

	#emit(next: UploadState): void {
		this.#state = next;
		for (const listener of this.#listeners) {
			listener(next);
		}
	}

	/**
	 * Handle a new selection.
	 *
	 * Runs the client-side checks, reads the file, then validates it.
	 * Any in-flight run is cancelled first, so a replacement upload
	 * cannot leave a stale result behind (H0106).
	 */
	async select(files: FileList | File[] | null, validate: ValidateFn): Promise<void> {
		const selectionError = checkSelection(files);
		if (selectionError) {
			this.#fail(selectionError);
			return;
		}

		const file = Array.from(files as FileList | File[])[0];

		// Cancel any in-flight run and start a fresh generation.
		this.#abortController?.abort();
		this.#abortController = new AbortController();
		const generation = ++this.#generation;
		const { signal } = this.#abortController;

		this.#emit({
			phase: 'reading',
			fileName: file.name,
			fileSize: file.size,
			progress: 0,
			error: null,
			result: null
		});

		try {
			// Reading the bytes is where an unreadable or truncated
			// file surfaces.
			const bytes = await readFile(file, signal, (fraction) => {
				if (generation !== this.#generation) {
					return;
				}
				this.#emit({
					phase: 'reading',
					fileName: file.name,
					fileSize: file.size,
					progress: Math.round(fraction * 50),
					error: null,
					result: null
				});
			});
			if (generation !== this.#generation) {
				return;
			}

			this.#emit({
				phase: 'validating',
				fileName: file.name,
				fileSize: file.size,
				progress: 50,
				error: null,
				result: null
			});

			const result = await validate(bytes, signal);
			if (generation !== this.#generation) {
				return;
			}
			this.#emit({
				phase: 'complete',
				fileName: file.name,
				fileSize: file.size,
				progress: 100,
				error: null,
				result
			});
		} catch (caught) {
			// A superseded run must not touch the current state.
			if (generation !== this.#generation) {
				return;
			}
			if (signal.aborted) {
				this.#fail(uploadError('UPLOAD_CANCELLED'));
				return;
			}
			this.#fail(toUploadError(caught));
		} finally {
			// The bytes are dropped here. Nothing outlives the run
			// (H0104).
			if (generation === this.#generation) {
				this.#abortController = null;
			}
		}
	}

	/**
	 * Cancel the in-flight run.
	 *
	 * The current file stays on screen so the user can retry without
	 * re-selecting; only the run stops.
	 */
	cancel(): void {
		if (!this.#abortController) {
			return;
		}
		this.#abortController.abort();
		this.#abortController = null;
		this.#generation += 1;
		this.#emit({
			...this.#state,
			phase: 'error',
			progress: 0,
			error: uploadError('UPLOAD_CANCELLED'),
			result: null
		});
	}

	/**
	 * Reset to the idle state.
	 *
	 * Cancels any in-flight run and clears the file, the error and the
	 * result together, so no stale view model survives (H0106).
	 */
	reset(): void {
		this.#abortController?.abort();
		this.#abortController = null;
		this.#generation += 1;
		this.#emit(IDLE_STATE);
	}

	#fail(error: UploadError): void {
		this.#emit({
			phase: 'error',
			fileName: this.#state.fileName,
			fileSize: this.#state.fileSize,
			progress: 0,
			error,
			result: null
		});
	}
}

/**
 * Read a file into memory, reporting progress as it goes.
 *
 * The stream API is used rather than `arrayBuffer()` so the progress
 * bar reflects real bytes read rather than an indeterminate spinner.
 */
export async function readFile(
	file: File,
	signal: AbortSignal,
	onProgress?: (fraction: number) => void
): Promise<ArrayBuffer> {
	if (signal.aborted) {
		throw new DOMException('Aborted', 'AbortError');
	}

	// `file.stream()` is unavailable in some test environments; fall
	// back to a single-shot read there.
	if (typeof file.stream !== 'function') {
		const buffer = await file.arrayBuffer();
		onProgress?.(1);
		return buffer;
	}

	const reader = file.stream().getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	try {
		for (;;) {
			if (signal.aborted) {
				throw new DOMException('Aborted', 'AbortError');
			}
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value) {
				chunks.push(value);
				received += value.byteLength;
			}
			if (file.size > 0) {
				onProgress?.(Math.min(1, received / file.size));
			}
		}
	} finally {
		reader.releaseLock();
	}

	// A stream that ends early yields fewer bytes than the file
	// declared. The package would be incomplete, so it is rejected
	// rather than forwarded to the validation service as-is.
	if (received !== file.size) {
		throw uploadError('FILE_TRUNCATED');
	}

	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	onProgress?.(1);
	return bytes.buffer;
}

/**
 * Map a thrown value onto an `UploadError`.
 *
 * Anything unrecognised becomes a generic validation failure rather
 * than leaking its message to the screen (H0107).
 */
export function toUploadError(caught: unknown): UploadError {
	if (isUploadError(caught)) {
		return caught;
	}
	if (caught instanceof DOMException) {
		if (caught.name === 'NotReadableError') {
			return uploadError('FILE_UNREADABLE');
		}
		if (caught.name === 'AbortError') {
			return uploadError('UPLOAD_CANCELLED');
		}
	}
	return uploadError('VALIDATION_FAILED');
}

/**
 * A short description of the current selection, for the status line.
 */
export function describeSelection(state: UploadState): string {
	if (!state.fileName) {
		return 'No package selected';
	}
	return `${state.fileName} (${formatFileSize(state.fileSize ?? 0)})`;
}
