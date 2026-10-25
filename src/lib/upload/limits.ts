/**
 * Bounded input limits for the v0.1.0 upload flow.
 *
 * These are *client-side* guards that keep obviously-invalid or
 * oversized input from reaching the validation service. They are not a
 * substitute for server-side enforcement — the validation service
 * re-checks every limit it is sent (REQ-HUB-002).
 */

/** Maximum accepted file size, in bytes (16 MiB). */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

/** Maximum number of files accepted in a single selection. */
export const MAX_FILE_COUNT = 1;

/** The only extension v0.1.0 accepts. */
export const ACCEPTED_EXTENSION = '.elang';

/**
 * The `accept` attribute for the file picker.
 *
 * This is a *hint* for the browser's file chooser, not a validation
 * rule — the authoritative check is the SDK's structural validation of
 * the package itself.
 */
export const ACCEPT_ATTRIBUTE = '.elang,application/vnd.elang';
