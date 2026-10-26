/**
 * Bounded input limits for the v0.1.0 upload flow (H0503).
 *
 * The Hub's single user-controlled input is the `.elang` package
 * uploaded through the file picker / drop zone. A malicious or
 * accidental selection can be a 100 MB+ blob; without a client-side
 * guard the browser will buffer every byte into memory before the
 * page gets a chance to reject it, exhausting the tab and freezing
 * the UI.
 *
 * These are *client-side* guards that keep obviously-invalid or
 * oversized input from reaching the validation service. They are not
 * a substitute for server-side enforcement — the endpoint re-checks
 * the body cap (`MAX_SDK_BODY_BYTES`) before forwarding.
 */

/**
 * Maximum accepted file size, in bytes.
 *
 * Mirrors the server-side `MAX_SDK_BODY_BYTES` (16 MiB). Both sides
 * hold the same cap so a 17 MiB selection is rejected on the page
 * immediately and a hostile client that bypasses the page still
 * hits the endpoint's pre-flight `Content-Length` check.
 */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

/**
 * Maximum number of files accepted in a single selection.
 *
 * v0.1.0 takes one package at a time; the picker is configured to
 * refuse a multi-selection so the user cannot drop twenty files in
 * and watch the page iterate.
 */
export const MAX_FILE_COUNT = 1;

/**
 * The only extension v0.1.0 accepts.
 */
export const ACCEPTED_EXTENSION = '.elang';

/**
 * The `accept` attribute for the file picker.
 *
 * This is a *hint* for the browser's file chooser, not a validation
 * rule — the authoritative structural check is the SDK's job and
 * happens server-side (REQ-HUB-001).
 */
export const ACCEPT_ATTRIBUTE = '.elang,application/vnd.elang';
