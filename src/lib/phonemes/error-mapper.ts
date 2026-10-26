/**
 * Page-level error mapper for the H04 phoneme viewer.
 *
 * The controller is transport-agnostic; it only ever sees a
 * `PhonemeRequestOutcome`. This module is the one place that
 * turns the SDK + extract + HTTP failures into bounded,
 * user-readable text the page can render verbatim.
 *
 * The mapping is total — every outcome has exactly one
 * `PhonemePageErrorInfo`. The mapper never throws; an
 * unrecognised SDK code falls back to a deliberate generic
 * message so the UI never shows raw SDK internals.
 *
 * Defence-in-depth: every string the UI renders is already
 * length-bounded and HTML-escaped (the SDK contract already
 * requires escaped `message` and `path`; this module bounds
 * them further so the page has nothing left to do).
 */

import type { HubError } from '../sdk/errors';
import type { PhonemeViewResult } from '../view';
import type { PhonemePageErrorInfo } from './controller';

/** Hard cap on user-visible message length. */
const MAX_MESSAGE_LENGTH = 280;
const MAX_DETAIL_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;

/**
 * Closed union of every outcome the request transport can produce.
 *
 * - `view`           — extraction succeeded; `result` is the full
 *                       H03 `PhonemeViewResult` (success or extract error).
 * - `sdk_error`      — the SDK adapter reported a typed failure
 *                       (`HubError` from H0206).
 * - `http_error`     — a non-2xx response from the server endpoint.
 * - `transport_error`— the network / fetch layer failed before
 *                       reaching the server (DNS, offline, abort).
 */
export type PhonemeRequestOutcome =
	| { readonly kind: 'view'; readonly result: PhonemeViewResult }
	| { readonly kind: 'sdk_error'; readonly error: HubError }
	| { readonly kind: 'http_error'; readonly status: number; readonly detail?: string }
	| { readonly kind: 'transport_error'; readonly cause: 'offline' | 'aborted' | 'unknown' };

/**
 * Map a `PhonemeRequestOutcome` to a bounded, escaped
 * `PhonemePageErrorInfo`. The result is safe to render directly:
 * the page does not need to escape it again.
 */
export function mapRequestOutcome(outcome: PhonemeRequestOutcome): PhonemePageErrorInfo {
	switch (outcome.kind) {
		case 'view':
			return mapViewResult(outcome.result);
		case 'sdk_error':
			return mapHubError(outcome.error);
		case 'http_error':
			return mapHttpError(outcome.status, outcome.detail);
		case 'transport_error':
			return mapTransportError(outcome.cause);
	}
}

function mapViewResult(result: PhonemeViewResult): PhonemePageErrorInfo {
	if (result.ok) {
		// Unreachable — the controller only calls this on a non-ok
		// outcome. Defensive fallback so a future caller cannot
		// surface a success path as an error block.
		return {
			title: bound('Validation succeeded', MAX_TITLE_LENGTH),
			message: bound('The package validated successfully.', MAX_MESSAGE_LENGTH)
		};
	}
	const detail = result.path ? bound(escape(result.path), MAX_DETAIL_LENGTH) : undefined;
	return detail
		? {
				title: bound('Could not read the validated inventory', MAX_TITLE_LENGTH),
				message: bound(result.message, MAX_MESSAGE_LENGTH),
				detail
			}
		: {
				title: bound('Could not read the validated inventory', MAX_TITLE_LENGTH),
				message: bound(result.message, MAX_MESSAGE_LENGTH)
			};
}

function mapHubError(error: HubError): PhonemePageErrorInfo {
	const title = bound(titleForStage(error.stage), MAX_TITLE_LENGTH);
	const detail = error.detail ? bound(escape(error.detail), MAX_DETAIL_LENGTH) : undefined;
	return detail
		? { title, message: bound(error.message, MAX_MESSAGE_LENGTH), detail }
		: { title, message: bound(error.message, MAX_MESSAGE_LENGTH) };
}

function mapHttpError(status: number, detail?: string): PhonemePageErrorInfo {
	const detailBounded = detail ? bound(escape(detail), MAX_DETAIL_LENGTH) : undefined;
	if (status === 413) {
		return {
			title: bound('Package too large', MAX_TITLE_LENGTH),
			message: bound(
				'The package is larger than the 16 MiB limit accepted by ELANG Hub v0.1.0.',
				MAX_MESSAGE_LENGTH
			),
			...(detailBounded ? { detail: detailBounded } : {})
		};
	}
	if (status === 408 || status === 504) {
		return {
			title: bound('Validation timed out', MAX_TITLE_LENGTH),
			message: bound('The package took too long to validate.', MAX_MESSAGE_LENGTH),
			...(detailBounded ? { detail: detailBounded } : {})
		};
	}
	if (status >= 500) {
		return {
			title: bound('Validation service unavailable', MAX_TITLE_LENGTH),
			message: bound('The validation service is currently unavailable.', MAX_MESSAGE_LENGTH),
			...(detailBounded ? { detail: detailBounded } : {})
		};
	}
	return {
		title: bound('Validation failed', MAX_TITLE_LENGTH),
		message: bound(
			`The validation service rejected the package (HTTP ${status}).`,
			MAX_MESSAGE_LENGTH
		),
		...(detailBounded ? { detail: detailBounded } : {})
	};
}

function mapTransportError(cause: 'offline' | 'aborted' | 'unknown'): PhonemePageErrorInfo {
	switch (cause) {
		case 'offline':
			return {
				title: bound('Network unavailable', MAX_TITLE_LENGTH),
				message: bound(
					'ELANG Hub could not reach the validation service. ' +
						'Check your network connection and try again.',
					MAX_MESSAGE_LENGTH
				)
			};
		case 'aborted':
			return {
				title: bound('Validation cancelled', MAX_TITLE_LENGTH),
				message: bound('Validation was cancelled.', MAX_MESSAGE_LENGTH)
			};
		case 'unknown':
		default:
			return {
				title: bound('Unexpected failure', MAX_TITLE_LENGTH),
				message: bound(
					'Something went wrong while validating the package. ' + 'Please try a different file.',
					MAX_MESSAGE_LENGTH
				)
			};
	}
}

function titleForStage(stage: HubError['stage']): string {
	switch (stage) {
		case 'inspect':
			return 'Package structure invalid';
		case 'verify':
			return 'Integrity check failed';
		case 'validate':
			return 'Validation failed';
	}
}

function bound(value: string, max: number): string {
	if (value.length <= max) return value;
	return value.slice(0, Math.max(0, max - 1)) + '…';
}

/**
 * Map of characters the regex matches to their HTML entity
 * replacements. Used by `escape` below; kept module-level so the
 * object is allocated once.
 */
const HTML_ESCAPE_MAP: Readonly<Record<'&' | '<' | '>' | '"' | "'", string>> = Object.freeze({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
});

/**
 * Escape a value for safe interpolation. Used only for the
 * optional `detail` fields; `message` is already escaped by the
 * upstream SDK contract. The escape is defence-in-depth — the
 * page renders these as text via Svelte's interpolation, but
 * the Svelte template may change and the underlying values are
 * potentially from a hostile service.
 */
function escape(value: string): string {
	return (
		value
			.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch as '&' | '<' | '>' | '"' | "'"])
			// eslint-disable-next-line no-control-regex -- defence-in-depth against hostile SDK content; this range is exactly the C0 controls + DEL.
			.replace(/[\u0000-\u001f\u007f]/g, '')
	);
}

/**
 * Convenience constructors for the closed outcome union. The
 * request transport uses these to assemble an outcome from a
 * fetch result; the controller never calls them.
 */
export function viewOutcome(result: PhonemeViewResult): PhonemeRequestOutcome {
	return { kind: 'view', result };
}

export function sdkErrorOutcome(error: HubError): PhonemeRequestOutcome {
	return { kind: 'sdk_error', error };
}

export function httpErrorOutcome(status: number, detail?: string): PhonemeRequestOutcome {
	return detail !== undefined
		? { kind: 'http_error', status, detail }
		: { kind: 'http_error', status };
}

export function transportErrorOutcome(
	cause: 'offline' | 'aborted' | 'unknown'
): PhonemeRequestOutcome {
	return { kind: 'transport_error', cause };
}
