/**
 * User-facing error mapping for SDK adapter failures.
 *
 * The Hub never reveals SDK internals or untrusted content to the
 * user. Every SDK verdict is reduced to one of twelve stable,
 * action-oriented codes (mirroring the H0107 upload-error codes so
 * the UI can use one error vocabulary across phases).
 *
 * The Hub UI is expected to render `message` directly; messages are
 * already length-bounded and HTML-escaped here, so callers do not
 * need to re-sanitize.
 */

import type { SdkDiagnostic, SdkErrorCode, SdkFailure } from './contract';

/** Hard cap on user-visible message length. */
const MAX_MESSAGE_LENGTH = 280;

/**
 * User-facing error categories. Each code maps to one canonical
 * human-readable message; the message embeds no user content.
 */
export type HubErrorCode =
	| 'unsupported_version'
	| 'malformed_package'
	| 'corrupted_resource'
	| 'integrity_check_failed'
	| 'descriptor_invalid'
	| 'phoneme_inventory_invalid'
	| 'unsupported_feature'
	| 'service_unavailable'
	| 'package_too_large'
	| 'timeout'
	| 'cancelled'
	| 'internal_error';

/** Bounded, escaped, user-facing error surfaced by the Hub. */
export interface HubError {
	readonly code: HubErrorCode;
	readonly message: string;
	/** Optional bounded, escaped detail (e.g. which field). */
	readonly detail?: string;
}

/**
 * Stable code → message table. Codes are a closed set; if you need
 * a new one, add it here AND to `HubErrorCode`, with a message that
 * never references internal paths or untrusted content.
 */
const HUB_ERROR_MESSAGES: Readonly<Record<HubErrorCode, string>> = {
	unsupported_version: 'This ELANG package uses a version that ELANG Hub v0.1.0 does not support.',
	malformed_package:
		'The uploaded file is not a valid ELANG package. Check the file format and try again.',
	corrupted_resource: 'A resource inside the ELANG package failed an integrity check.',
	integrity_check_failed:
		'The package failed integrity verification. The file may be damaged or tampered with.',
	descriptor_invalid:
		'The package descriptor is invalid. The package may not be a valid ELANG language definition.',
	phoneme_inventory_invalid:
		'The phoneme inventory (ELD) is invalid. The package may not be a valid ELANG language definition.',
	unsupported_feature:
		'The package uses an ELANG feature that this version of ELANG Hub does not support.',
	service_unavailable:
		'The validation service is currently unavailable. Please try again in a moment.',
	package_too_large: 'The package is larger than the 16 MiB limit accepted by ELANG Hub v0.1.0.',
	timeout: 'The package took too long to validate. Please try a smaller file or try again later.',
	cancelled: 'Validation was cancelled.',
	internal_error: 'An internal error prevented validation. Please try again.'
};

/**
 * Map an SDK error code to its Hub-facing counterpart. The mapping
 * is total — every `SdkErrorCode` has exactly one `HubErrorCode`.
 */
function mapSdkCode(code: SdkErrorCode): HubErrorCode {
	switch (code) {
		case 'unsupported_spec_version':
		case 'unsupported_binary_container_version':
			return 'unsupported_version';
		case 'malformed_container':
			return 'malformed_package';
		case 'corrupted_resource':
			return 'corrupted_resource';
		case 'integrity_check_failed':
			return 'integrity_check_failed';
		case 'descriptor_invalid':
			return 'descriptor_invalid';
		case 'eld_invalid':
			return 'phoneme_inventory_invalid';
		case 'unsupported_feature':
			return 'unsupported_feature';
		case 'service_unavailable':
			return 'service_unavailable';
		case 'request_too_large':
			return 'package_too_large';
		case 'timeout':
			return 'timeout';
		case 'cancelled':
			return 'cancelled';
		case 'malformed_response':
		case 'unknown':
			return 'internal_error';
	}
}

/**
 * Escape a value for safe interpolation into a user-facing message.
 * The Hub's UI renders messages as text, but defence-in-depth means
 * no SDK message can introduce markup or control characters.
 */
function escape(value: string): string {
	return (
		value
			.replace(/[&<>"']/g, (ch) => {
				switch (ch) {
					case '&':
						return '&amp;';
					case '<':
						return '&lt;';
					case '>':
						return '&gt;';
					case '"':
						return '&quot;';
					case "'":
						return '&#39;';
					default:
						return ch;
				}
			})
			// Strip control characters that could confuse rendering or logs.
			// eslint-disable-next-line no-control-regex -- defence-in-depth against hostile SDK content; this range is exactly the C0 controls + DEL.
			.replace(/[\u0000-\u001f\u007f]/g, '')
	);
}

/** Bound a string to MAX_MESSAGE_LENGTH, appending a single ellipsis on truncation. */
function bound(value: string): string {
	if (value.length <= MAX_MESSAGE_LENGTH) return value;
	return value.slice(0, MAX_MESSAGE_LENGTH - 1) + '…';
}

/**
 * Convert an SDK failure into a bounded, escaped user-facing error.
 * The Hub renders `message` verbatim; `detail`, if present, is the
 * escaped diagnostic path or locator.
 */
export function toHubError(failure: SdkFailure): HubError {
	const code = mapSdkCode(failure.code);
	const message = HUB_ERROR_MESSAGES[code];
	const detail = failure.path ? bound(escape(failure.path)) : undefined;
	return detail ? { code, message, detail } : { code, message };
}

/**
 * Reduce a sequence of SDK diagnostics to the first non-empty
 * bounded, escaped detail string. Used when the SDK reports
 * supplementary failures that did not block success.
 */
export function firstBoundedDetail(diagnostics: readonly SdkDiagnostic[]): string | undefined {
	for (const d of diagnostics) {
		if (d.path) return bound(escape(d.path));
	}
	return undefined;
}
