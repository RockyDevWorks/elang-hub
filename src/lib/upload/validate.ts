import { ACCEPTED_EXTENSION, MAX_FILE_BYTES, MAX_FILE_COUNT } from './limits';
import { uploadError, type UploadError } from './errors';

/**
 * Client-side checks on a user selection.
 *
 * These are *hints*, not authority. The extension and MIME type are
 * checked only so the user gets an immediate, clear message; the
 * authoritative structural validation is the SDK's job and happens
 * server-side (REQ-HUB-001).
 */

/**
 * Whether `name` ends with the accepted extension.
 *
 * Compared case-insensitively: `.ELANG` is the same package format as
 * `.elang`, and rejecting it would be a needless papercut.
 */
export function hasAcceptedExtension(name: string): boolean {
	return name.toLowerCase().endsWith(ACCEPTED_EXTENSION);
}

/**
 * Check a candidate file against the selection rules.
 *
 * Returns `null` when the selection is acceptable, or the error that
 * should be shown to the user.
 */
export function checkSelection(files: FileList | File[] | null): UploadError | null {
	if (!files) {
		return uploadError('NO_FILE_SELECTED');
	}

	const list = Array.from(files);
	if (list.length === 0) {
		return uploadError('NO_FILE_SELECTED');
	}
	if (list.length > MAX_FILE_COUNT) {
		return uploadError('TOO_MANY_FILES');
	}

	const file = list[0];
	if (!hasAcceptedExtension(file.name)) {
		return uploadError('UNSUPPORTED_EXTENSION');
	}
	if (file.size === 0) {
		return uploadError('FILE_EMPTY');
	}
	if (file.size > MAX_FILE_BYTES) {
		return uploadError('FILE_TOO_LARGE');
	}
	return null;
}

/**
 * A human-readable file size.
 *
 * Uses decimal units so the number matches what a file manager shows.
 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1000) {
		return `${bytes} B`;
	}
	const units = ['kB', 'MB', 'GB'];
	let value = bytes / 1000;
	let unitIndex = 0;
	while (value >= 1000 && unitIndex < units.length - 1) {
		value /= 1000;
		unitIndex += 1;
	}
	const rounded = value >= 10 ? Math.round(value).toString() : value.toFixed(1);
	return `${rounded} ${units[unitIndex]}`;
}
