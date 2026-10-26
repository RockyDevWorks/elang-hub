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
 * Maximum number of diagnostics retained from a single SDK
 * response. A hostile or buggy service can return an unbounded
 * array; every entry is rendered as a list item, so the cap is a
 * rendering budget as much as a memory budget.
 */
export const MAX_SDK_DIAGNOSTICS = 200;

/**
 * Maximum length, in UTF-16 code units, of a single string the SDK
 * hands to the view layer (diagnostic message, diagnostic path,
 * failure message, failure path, `phonemeResourcePath`).
 *
 * These strings are package-controlled: they originate in an
 * untrusted `.elang` archive and travel through the validation
 * service into the DOM. Svelte escapes them at the template
 * layer, so they cannot become markup — but an unbounded string
 * still becomes an unbounded DOM node, an unbounded layout cost,
 * and an unbounded copy of attacker-chosen bytes in memory. The
 * cap makes the render budget finite.
 */
export const MAX_SDK_STRING_LENGTH = 4096;

/** Code unit of `/`. */
const SLASH_CHAR_CODE = 47;

/**
 * Strip trailing slashes with an explicit backwards scan.
 *
 * The obvious `url.replace(/\/+$/, '')` is quadratic: the `+`
 * quantifier backtracks at every start offset, so a value like
 * `"//////x"` costs O(n²) to reject. SonarCloud flags the pattern
 * as S5852 (super-linear regex). This scan is O(n), reads clearly,
 * and has no pathological input.
 *
 * The SDK service URL is deployment configuration rather than
 * attacker input, but it reaches this code from the environment and
 * the endpoint is public — there is no reason to leave a
 * super-linear pattern on the request path.
 */
export function stripTrailingSlashes(url: string): string {
	let end = url.length;
	while (end > 0 && url.charCodeAt(end - 1) === SLASH_CHAR_CODE) {
		end--;
	}
	return url.slice(0, end);
}

/**
 * Clamp a package-controlled string to `maxLength` code units.
 *
 * Returns `undefined` for a non-string input so callers can
 * distinguish "not a string" from "an empty string". Truncation is
 * explicit and lossy on purpose: the caller appends an ellipsis
 * marker so a screen-reader user is not told the text ended
 * naturally.
 */
export function clampSdkString(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}…`;
}

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
