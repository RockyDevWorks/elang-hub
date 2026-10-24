/**
 * Typed upload failures.
 *
 * Every failure the upload flow can produce is one of these codes.
 * The message is written for the person who selected the file, not for
 * a log: it says what happened and what to do next, and never exposes
 * internal detail such as a stack trace or a raw exception string.
 */

export type UploadErrorCode =
	| 'NO_FILE_SELECTED'
	| 'TOO_MANY_FILES'
	| 'UNSUPPORTED_EXTENSION'
	| 'FILE_TOO_LARGE'
	| 'FILE_EMPTY'
	| 'FILE_UNREADABLE'
	| 'FILE_TRUNCATED'
	| 'VALIDATION_FAILED'
	| 'VALIDATION_UNAVAILABLE'
	| 'UPLOAD_CANCELLED';

export interface UploadError {
	readonly code: UploadErrorCode;
	/** User-facing, actionable message. */
	readonly message: string;
}

/** Build an `UploadError` from a code. */
export function uploadError(code: UploadErrorCode): UploadError {
	return { code, message: UPLOAD_ERROR_MESSAGES[code] };
}

/**
 * Whether `value` is an `UploadError`.
 *
 * The check validates that `code` is one of the typed codes and that
 * `message` is a string, so a thrown object with stray fields cannot
 * pass as an upload failure.
 */
export function isUploadError(value: unknown): value is UploadError {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as { code?: unknown; message?: unknown };
	return (
		typeof candidate.code === 'string' &&
		candidate.code in UPLOAD_ERROR_MESSAGES &&
		typeof candidate.message === 'string'
	);
}

const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
	NO_FILE_SELECTED: 'Choose an .elang package to continue.',
	TOO_MANY_FILES: 'Only one .elang package can be processed at a time.',
	UNSUPPORTED_EXTENSION:
		'That file is not an .elang package. Choose a file with the .elang extension.',
	FILE_TOO_LARGE: 'That package is too large to process. Choose a smaller .elang package.',
	FILE_EMPTY: 'That package is empty. Choose a .elang package that contains a package.',
	FILE_UNREADABLE:
		'That package could not be read. Check that the file is still there and try again.',
	FILE_TRUNCATED: 'That package appears to be incomplete. Choose a complete .elang package.',
	VALIDATION_FAILED: 'That package could not be validated. Review the details and try again.',
	VALIDATION_UNAVAILABLE: 'Validation is unavailable right now. Please try again shortly.',
	UPLOAD_CANCELLED: 'Upload cancelled.'
};
