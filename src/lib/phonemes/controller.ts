/**
 * Page state machine for the H04 phoneme viewer.
 *
 * The page has four phases:
 *
 *   `idle`        — show the upload prompt
 *   `validating`  — bytes in flight; show progress + cancel
 *   `view`        — show the validated `PhonemeView`
 *   `error`       — show the typed error + "Try another file"
 *
 * The controller parallels H01's `UploadController` (state machine,
 * monotonic generation counter, AbortSignal on every run). The
 * counter is what makes a slow run that finishes AFTER a
 * replacement upload a no-op rather than a stale-result race.
 *
 * The bytes never live in the controller for longer than one run:
 * they are forwarded to the adapter via `RequestPhonemeView`, the
 * response is reduced to a `PhonemeRequestOutcome`, and the bytes
 * are dropped (H0408 — no persistence in v0.1.0).
 */

import type { PhonemeViewResult } from '../view';
import type { PhonemeRequestOutcome } from './error-mapper';
import { mapRequestOutcome } from './error-mapper';

export type PhonemePagePhase = 'idle' | 'validating' | 'view' | 'error';

export interface PhonemePageIdle {
	readonly phase: 'idle';
}

export interface PhonemePageValidating {
	readonly phase: 'validating';
	readonly fileName: string;
	readonly fileSize: number;
	/** 0–100; meaningful only while the page is in `validating`. */
	readonly progress: number;
	readonly cancel: () => void;
}

export interface PhonemePageView {
	readonly phase: 'view';
	readonly fileName: string;
	readonly fileSize: number;
	readonly view: Extract<PhonemeViewResult, { ok: true }>;
	readonly replace: () => void;
}

export interface PhonemePageError {
	readonly phase: 'error';
	readonly fileName: string;
	readonly fileSize: number;
	readonly error: PhonemePageErrorInfo;
	readonly replace: () => void;
}

export type PhonemePageState =
	PhonemePageIdle | PhonemePageValidating | PhonemePageView | PhonemePageError;

/**
 * A bounded, user-facing error that the page renders verbatim.
 *
 * `message` is already escaped and length-bounded by the mapper.
 * `detail`, when present, is the bounded path or locator the
 * SDK reported.
 */
export interface PhonemePageErrorInfo {
	readonly title: string;
	readonly message: string;
	readonly detail?: string;
}

/**
 * Pluggable transport for the controller. The page wires the
 * browser's fetch through this; tests pass a stub.
 *
 * The transport returns a `PhonemeRequestOutcome` — a closed union
 * that covers every failure mode the SDK + extract pipeline can
 * produce, so the controller never has to reason about HTTP.
 */
export type RequestPhonemeView = (
	bytes: ArrayBuffer,
	fileName: string,
	signal: AbortSignal,
	onProgress: (percent: number) => void
) => Promise<PhonemeRequestOutcome>;

const IDLE_STATE: PhonemePageIdle = Object.freeze({ phase: 'idle' });

/**
 * The page-level state machine.
 *
 * Subscribers receive the new state on every transition. The
 * controller never re-emits the same state object — every
 * transition produces a fresh frozen object so a `$state` rune
 * in the page sees the change.
 */
export class PhonemePageController {
	#state: PhonemePageState = IDLE_STATE;
	#listeners = new Set<(state: PhonemePageState) => void>();
	#abortController: AbortController | null = null;
	/** Monotonic counter — every accepted run increments it. */
	#generation = 0;

	subscribe(listener: (state: PhonemePageState) => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	get state(): PhonemePageState {
		return this.#state;
	}

	/**
	 * Run a new validation. The bytes are read with progress,
	 * forwarded to the adapter, and the resulting outcome drives
	 * the next state.
	 *
	 * A generation counter prevents a slow run from overwriting the
	 * state of a newer one (H0408 — supersede is race-safe).
	 */
	async select(file: File, request: RequestPhonemeView): Promise<void> {
		const generation = ++this.#generation;
		this.#abortController?.abort();
		const controller = new AbortController();
		this.#abortController = controller;

		const fileName = file.name;
		const fileSize = file.size;

		this.#emit({
			phase: 'validating',
			fileName,
			fileSize,
			progress: 0,
			cancel: () => controller.abort()
		});

		let bytes: ArrayBuffer;
		try {
			bytes = await readFileWithProgress(file, controller.signal, (percent) => {
				if (generation !== this.#generation) return;
				const current = this.#state;
				if (current.phase !== 'validating') return;
				this.#emit({ ...current, progress: percent });
			});
		} catch {
			if (controller.signal.aborted) {
				if (generation === this.#generation) this.#emit(IDLE_STATE);
				return;
			}
			if (generation === this.#generation) {
				this.#emit({
					phase: 'error',
					fileName,
					fileSize,
					error: {
						title: 'Could not read the file',
						message:
							'The file could not be read from your device. ' + 'Please try a different file.'
					},
					replace: () => this.reset()
				});
			}
			return;
		}

		if (controller.signal.aborted) {
			if (generation === this.#generation) this.#emit(IDLE_STATE);
			return;
		}

		let outcome: PhonemeRequestOutcome;
		try {
			outcome = await request(bytes, fileName, controller.signal, () => {
				/* server is in flight; no further client progress */
			});
		} catch {
			if (generation === this.#generation) {
				this.#emit({
					phase: 'error',
					fileName,
					fileSize,
					error: {
						title: 'Unexpected failure',
						message:
							'Something went wrong while validating the package. ' + 'Please try a different file.'
					},
					replace: () => this.reset()
				});
			}
			return;
		} finally {
			if (this.#abortController === controller) this.#abortController = null;
		}

		if (generation !== this.#generation) return;
		if (controller.signal.aborted) {
			this.#emit(IDLE_STATE);
			return;
		}

		if (outcome.kind === 'view' && outcome.result.ok) {
			this.#emit({
				phase: 'view',
				fileName,
				fileSize,
				view: outcome.result,
				replace: () => this.reset()
			});
			return;
		}

		this.#emit({
			phase: 'error',
			fileName,
			fileSize,
			error: mapRequestOutcome(outcome),
			replace: () => this.reset()
		});
	}

	/** Cancel the in-flight run. No-op when idle. */
	cancel(): void {
		this.#abortController?.abort();
		this.#generation++;
		this.#emit(IDLE_STATE);
	}

	/** Return to `idle`. No-op when already idle. */
	reset(): void {
		this.#abortController?.abort();
		this.#generation++;
		this.#emit(IDLE_STATE);
	}

	#emit(next: PhonemePageState): void {
		this.#state = Object.freeze(next);
		for (const listener of this.#listeners) listener(this.#state);
	}
}

/**
 * Read a `File` into an `ArrayBuffer` with byte-level progress.
 * Honours `signal` between reads.
 */
async function readFileWithProgress(
	file: File,
	signal: AbortSignal,
	onProgress: (percent: number) => void
): Promise<ArrayBuffer> {
	if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
	const totalBytes = file.size;
	if (totalBytes === 0) return new ArrayBuffer(0);

	const reader = file.stream().getReader();
	const chunks: Uint8Array[] = [];
	let read = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push(value);
			read += value.byteLength;
			onProgress(Math.min(100, Math.round((read / totalBytes) * 100)));
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* releaseLock throws if the stream is already closed */
		}
	}

	const out = new Uint8Array(read);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out.buffer;
}
