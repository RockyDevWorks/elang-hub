import { uploadError, type UploadError } from './errors';
import type { ValidationResult } from './controller';

/**
 * The validation service endpoint.
 *
 * v0.1.0 keeps the service on the same origin and lets the deployment
 * route it; the client only ever sees a path. The service is
 * stateless — it validates and returns a verdict, and keeps nothing
 * (REQ-HUB-003).
 */
export const VALIDATION_ENDPOINT = '/api/validate';

/**
 * The number of bytes sent to the validation service.
 *
 * The package is uploaded as an opaque binary body; the service
 * applies the SDK's own structure validation.
 */
export async function requestValidation(
	bytes: ArrayBuffer,
	signal: AbortSignal
): Promise<ValidationResult> {
	let response: Response;
	try {
		response = await fetch(VALIDATION_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body: bytes,
			signal
		});
	} catch {
		if (signal.aborted) {
			throw uploadError('UPLOAD_CANCELLED');
		}
		throw uploadError('VALIDATION_UNAVAILABLE');
	}

	if (!response.ok) {
		if (response.status === 413) {
			throw uploadError('FILE_TOO_LARGE');
		}
		if (response.status === 503 || response.status === 502) {
			throw uploadError('VALIDATION_UNAVAILABLE');
		}
		throw uploadError('VALIDATION_FAILED');
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw uploadError('VALIDATION_FAILED');
	}

	return normaliseResult(payload);
}

/**
 * Coerce the service's response into a `ValidationResult`.
 *
 * The service is trusted to send the right shape, but a malformed
 * response must not become an unhandled exception in the UI — it
 * becomes a validation failure the user can act on.
 */
function normaliseResult(payload: unknown): ValidationResult {
	if (typeof payload !== 'object' || payload === null) {
		throw uploadError('VALIDATION_FAILED');
	}
	const candidate = payload as {
		ok?: unknown;
		diagnostics?: unknown;
		messages?: unknown;
	};
	const ok = candidate.ok === true;
	const diagnostics = Array.isArray(candidate.diagnostics)
		? candidate.diagnostics.filter((d): d is string => typeof d === 'string')
		: [];
	const messages = Array.isArray(candidate.messages)
		? candidate.messages.filter((m): m is string => typeof m === 'string')
		: [];
	return { ok, diagnostics, messages };
}

/** Whether `error` is an `UploadError`. */
export function isUploadError(error: unknown): error is UploadError {
	return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}
