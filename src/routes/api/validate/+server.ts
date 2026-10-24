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

	// Reject an oversized upload on the declared length, before
	// reading a single byte of the body.
	const declaredLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package is too large to process.'] },
			{ status: 413 }
		);
	}

	const body = await request.arrayBuffer();
	if (body.byteLength === 0) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package is empty.'] },
			{ status: 400 }
		);
	}
	if (body.byteLength > MAX_FILE_BYTES) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package is too large to process.'] },
			{ status: 413 }
		);
	}

	let response: Response;
	try {
		response = await fetch(VALIDATION_SERVICE_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body
		});
	} catch {
		return json(
			{ ok: false, diagnostics: [], messages: ['Validation is unavailable right now.'] },
			{ status: 503 }
		);
	}

	if (!response.ok) {
		return json(
			{ ok: false, diagnostics: [], messages: ['That package could not be validated.'] },
			{ status: response.status === 413 ? 413 : 502 }
		);
	}

	const payload = await response.json();
	return json(payload);
};
