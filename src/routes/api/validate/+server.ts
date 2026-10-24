import { json, type RequestHandler } from '@sveltejs/kit';
import { MAX_FILE_BYTES } from '$lib/upload/limits';
import { env } from '$env/dynamic/private';

/**
 * The validation service.
 *
 * v0.1.0 keeps the service stateless: it validates the package and
 * returns a verdict, and retains nothing (REQ-HUB-003). The endpoint
 * is configured per deployment; without it the route reports that
 * validation is unavailable rather than pretending to validate.
 */
const VALIDATION_SERVICE_URL = env.VALIDATION_SERVICE_URL;

/**
 * Maximum time to wait for the upstream validation service.
 *
 * Stalled requests fail loudly rather than hanging the browser, and
 * any in-flight `AbortSignal` from the client cancels the upstream
 * fetch as well.
 */
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Validate an uploaded ELANG package.
 *
 * The request body is the package bytes, sent as an opaque binary
 * stream. The service applies the authoritative SDK validation; this
 * route does not parse, inspect or reimplement any ELANG rule
 * (REQ-HUB-001).
 *
 * The body is size-checked *before* it is forwarded, so an oversized
 * upload never reaches the service and never occupies memory beyond
 * the bound (REQ-HUB-002).
 */
export const POST: RequestHandler = async ({ request, fetch }) => {
	if (!VALIDATION_SERVICE_URL) {
		return json(
			{ ok: false, diagnostics: [], messages: ['Validation is unavailable right now.'] },
			{ status: 503 }
		);
	}

	const tooLarge = {
		ok: false,
		diagnostics: [],
		messages: ['That package is too large to process.'],
		status: 413
	} as const;

	// Read the body incrementally with a hard byte cap, so an
	// attacker cannot exhaust memory by streaming an unbounded body
	// without a Content-Length header.
	let received = 0;
	const chunks: Uint8Array[] = [];
	const reader = request.body?.getReader();
	if (!reader) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package is empty.'] },
			{ status: 400 }
		);
	}
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value) {
				if (received + value.byteLength > MAX_FILE_BYTES) {
					await reader.cancel();
					return json(
						{ ok: false, diagnostics: [], messages: tooLarge.messages },
						{ status: tooLarge.status }
					);
				}
				chunks.push(value);
				received += value.byteLength;
			}
		}
	} finally {
		reader.releaseLock();
	}

	if (received === 0) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package is empty.'] },
			{ status: 400 }
		);
	}

	const body = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	// Combine the request's abort signal with an upstream timeout so
	// browser cancellation propagates and stalled requests cannot
	// hang indefinitely.
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
	if (request.signal.aborted) {
		controller.abort();
	}
	request.signal.addEventListener('abort', () => controller.abort(), { once: true });

	let response: Response;
	try {
		response = await fetch(VALIDATION_SERVICE_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body,
			signal: controller.signal
		});
	} catch {
		return json(
			{ ok: false, diagnostics: [], messages: ['Validation is unavailable right now.'] },
			{ status: 503 }
		);
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package could not be validated.'] },
			{ status: response.status === 413 ? 413 : 502 }
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return json(
			{ ok: false, diagnostics: [], messages: ['Validation is unavailable right now.'] },
			{ status: 502 }
		);
	}

	return json(normaliseValidationResponse(payload));
};

/**
 * Coerce an upstream response into the narrow `ValidationResult`
 * shape the UI consumes.
 *
 * Only `ok`, `diagnostics`, and `messages` are exposed, and each is
 * validated for type. Anything else the upstream service includes is
 * dropped so it cannot reach the browser.
 */
function normaliseValidationResponse(payload: unknown): {
	ok: boolean;
	diagnostics: string[];
	messages: string[];
} {
	if (typeof payload !== 'object' || payload === null) {
		return { ok: false, diagnostics: [], messages: [] };
	}
	const candidate = payload as { ok?: unknown; diagnostics?: unknown; messages?: unknown };
	const ok = candidate.ok === true;
	const diagnostics = Array.isArray(candidate.diagnostics)
		? candidate.diagnostics.filter((d): d is string => typeof d === 'string')
		: [];
	const messages = Array.isArray(candidate.messages)
		? candidate.messages.filter((m): m is string => typeof m === 'string')
		: [];
	return { ok, diagnostics, messages };
}
