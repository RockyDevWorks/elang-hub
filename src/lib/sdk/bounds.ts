/**
 * Resource bounds enforced at the SDK adapter boundary.
 *
 * Per ADR 0001 and H0207, the Hub must bound every input that
 * reaches the SDK boundary — time, body size, decompression, and
 * caller cancellation — so that an adversarial or pathological
 * package cannot hang the request thread, exhaust memory, or wedge
 * the UI.
 *
 * These constants are the public contract; tests pin them so the
 * boundaries do not silently drift.
 */

/** Hard wall-clock cap on a single SDK round-trip. */
export const DEFAULT_SDK_TIMEOUT_MS = 30_000;

/** Maximum accepted body size, in bytes. Mirrors the H01 16 MiB limit. */
export const MAX_SDK_BODY_BYTES = 16 * 1024 * 1024;

/**
 * Maximum decompressed size tolerated from the SDK response. Caps
 * memory growth from a malicious or pathological service response
 * (e.g. zip-bomb-shaped JSON).
 */
export const MAX_SDK_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * Throws an `SdkFailure` if `bytes` exceeds the body cap. Returning
 * a typed failure keeps the failure vocabulary uniform — the caller
 * never has to translate a thrown exception into a UI code.
 */
export function assertBodyWithinLimit(bytes: Uint8Array): void {
	if (bytes.byteLength > MAX_SDK_BODY_BYTES) {
		throw {
			ok: false,
			stage: 'inspect',
			code: 'request_too_large',
			message: `Request body is ${bytes.byteLength} bytes; the SDK adapter limit is ${MAX_SDK_BODY_BYTES}.`,
			path: 'request.body',
			diagnostics: []
		} as const;
	}
}

/**
 * Compose an `AbortSignal` that fires either when the caller cancels
 * (`signal`) or when the timeout elapses, whichever happens first.
 *
 * Always returns a fresh `AbortSignal`; the caller is responsible
 * for not double-cancelling the composed signal.
 */
export function composeAbortSignal(
	timeoutMs: number,
	signal?: AbortSignal
): { signal: AbortSignal; cancel: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onCallerAbort = (): void => controller.abort();
	if (signal) {
		if (signal.aborted) {
			controller.abort();
		} else {
			signal.addEventListener('abort', onCallerAbort, { once: true });
		}
	}
	return {
		signal: controller.signal,
		cancel: () => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener('abort', onCallerAbort);
		}
	};
}
