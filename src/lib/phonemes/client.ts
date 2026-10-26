/**
 * Page-side transport for the H04 phoneme viewer.
 *
 * The browser's fetch + the SDK adapter at the server endpoint
 * (`/api/phonemes`) form a single round-trip. This module is
 * the one place the page touches the network; every other module
 * is transport-agnostic and unit-testable.
 *
 * Wire format (matches the server endpoint):
 *
 *   - 200 + `{ ok: true, mode, specVersion, binaryContainerVersion,
 *               phonemeResourcePath, inventory, diagnostics }`
 *               → wrapped in `viewOutcome(...)` for the controller.
 *   - 200 + `{ ok: false, stage, code, message, path?, diagnostics }`
 *               → SDK-level failure; the page maps it via `toHubError`.
 *   - 413 + JSON → too large; mapped to `httpErrorOutcome(413)`.
 *   - 503 + JSON → service unavailable; mapped to `httpErrorOutcome(503)`.
 *   - other non-2xx → mapped to `httpErrorOutcome(status)`.
 *   - network failure → mapped to `transportErrorOutcome(cause)`.
 */

import { extractPhonemeView } from '../view';
import type { SdkFailure, SdkValidateResult } from '../sdk/contract';
import { toHubError } from '../sdk/errors';
import type { RequestPhonemeView } from './controller';
import {
	httpErrorOutcome,
	sdkErrorOutcome,
	transportErrorOutcome,
	viewOutcome
} from './error-mapper';

/** The server endpoint that proxies the SDK adapter. */
export const PHONEMES_ENDPOINT = '/api/phonemes';

/**
 * The page-side request function. Strips the network/SDK details
 * out of the round-trip and returns a `PhonemeRequestOutcome` the
 * controller can render verbatim.
 *
 * Progress callbacks fire only for the byte-level read (which the
 * controller owns — see `PhonemePageController.select`). The
 * server-side round-trip is opaque from the browser.
 */
export const requestPhonemeView: RequestPhonemeView = async (bytes, _fileName, signal) => {
	let response: Response;
	try {
		response = await fetch(PHONEMES_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream', accept: 'application/json' },
			body: bytes,
			signal
		});
	} catch (e) {
		if (signal.aborted) return transportErrorOutcome('aborted');
		// A `TypeError` is the WHATWG fetch spec for network-level
		// failure (DNS, refused, offline). Other throws are
		// surfaced as a deliberate generic error so the UI never
		// shows raw SDK internals.
		if (e instanceof TypeError) return transportErrorOutcome('offline');
		return transportErrorOutcome('unknown');
	}

	if (!response.ok) {
		const detail = await safeReadDetail(response);
		return httpErrorOutcome(response.status, detail);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return transportErrorOutcome('unknown');
	}

	if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
		return transportErrorOutcome('unknown');
	}

	if (payload.ok === true) {
		return viewOutcome(extractPhonemeView(payload as unknown as SdkValidateResult));
	}
	return sdkErrorOutcome(toHubError(payload as unknown as SdkFailure));
};

async function safeReadDetail(response: Response): Promise<string | undefined> {
	try {
		const payload: unknown = await response.json();
		if (!isRecord(payload)) return undefined;
		const detail = (payload as { detail?: unknown }).detail;
		return typeof detail === 'string' ? detail : undefined;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
