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
 * Every string the UI renders is length-bounded. Optional details
 * have C0 controls and DEL stripped; HTML escaping is left to
 * Svelte's text interpolation.
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
 * Map a `PhonemeRequestOutcome` to a bounded
 * `PhonemePageErrorInfo` for rendering via Svelte text interpolation.
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
	const detail = result.path ? bound(stripControls(result.path), MAX_DETAIL_LENGTH) : undefined;
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
	const title = bound(titleForError(error), MAX_TITLE_LENGTH);
	const detail = error.detail ? bound(stripControls(error.detail), MAX_DETAIL_LENGTH) : undefined;
	return detail
		? { title, message: bound(error.message, MAX_MESSAGE_LENGTH), detail }
		: { title, message: bound(error.message, MAX_MESSAGE_LENGTH) };
}

/**
 * Pick the title for an SDK failure.
 *
 * Two families of failure arrive under the same `sdk_error` envelope:
 * faults in the PACKAGE (malformed container, corrupt resource,
 * invalid ELD) and faults in the SERVICE (unreachable, timed out,
 * too large, internal error). The stage alone cannot tell them
 * apart — an unreachable service and a broken package both surface
 * at the `validate` stage — so the codes that describe a service
 * condition get their own titles.
 *
 * Without that split, an outage tells the user their package is
 * invalid. That is wrong (the package may be perfect) and
 * unactionable (retrying a different file will not help).
 */
function titleForError(error: HubError): string {
	switch (error.code) {
		case 'service_unavailable':
			return 'Validation service unavailable';
		case 'timeout':
			return 'Validation timed out';
		case 'package_too_large':
			return 'Package too large';
		case 'cancelled':
			return 'Validation cancelled';
		case 'internal_error':
			return 'Unexpected failure';
		case 'unsupported_version':
			return 'Unsupported package version';
		case 'unsupported_feature':
			return 'Unsupported package feature';
		default:
			// Every remaining code describes the package's own content:
			// malformed_package, corrupted_resource,
			// integrity_check_failed, descriptor_invalid and
			// phoneme_inventory_invalid. The stage says which kind.
			return titleForStage(error.stage);
	}
}

function mapHttpError(status: number, detail?: string): PhonemePageErrorInfo {
	const detailBounded = detail ? bound(stripControls(detail), MAX_DETAIL_LENGTH) : undefined;
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

/** Strip C0 controls and DEL from optional detail text. */
function stripControls(value: string): string {
	// eslint-disable-next-line no-control-regex -- defence-in-depth against hostile SDK content; this range is exactly the C0 controls + DEL.
	return value.replace(/[\u0000-\u001f\u007f]/g, '');
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
