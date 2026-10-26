/**
 * Phoneme validation endpoint (H0401).
 *
 * The browser page POSTs the opaque package bytes here; the endpoint
 * forwards them to the authoritative ELANG SDK service and returns
 * the full `SdkResult` verbatim. The page never speaks to the SDK
 * service directly — that round-trip lives on the server side so
 * the service URL and any auth credentials stay out of the browser.
 *
 * The endpoint mirrors H02's SdkClient contract:
 *
 *   - 200 + `SdkValidateResult` body when `ok: true`
 *   - 200 + `SdkFailure` body when the SDK returned a typed failure
 *     (we surface it to the page instead of synthesising an HTTP error
 *     so the user gets the SDK's stable error code)
 *   - 413 when the body exceeds the SDK's 16 MiB cap (mirrored so the
 *     page can show the typed H0107 error vocabulary)
 *   - 503 when the SDK service is unreachable
 *   - 504 on timeout
 *   - 400 on a malformed request (empty body, non-octet-stream)
 *
 * The endpoint is read-only — it never persists the package, never
 * inspects the package itself, never logs payload bytes. SDK
 * responses are passed through; the page's view layer narrows the
 * `inventory: unknown` shape.
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SdkClient, MAX_SDK_BODY_BYTES, type SdkResult } from '$lib/sdk';

/**
 * Resolve the SDK service URL from the runtime environment.
 *
 * `$env/dynamic/private` is SvelteKit's adapter-neutral runtime env
 * access — it reads from `process.env` under Node and from the
 * Cloudflare platform bindings in production. The deployment must
 * set `SDK_SERVICE_URL`; an unconfigured deployment fails loudly
 * (503) rather than silently fall back to a default.
 */
function resolveServiceUrl(): string {
	const url = env.SDK_SERVICE_URL;
	if (!url) {
		throw error(503, {
			message: 'The validation service URL is not configured on this deployment.'
		});
	}
	return url.replace(/\/+$/, '');
}

/**
 * Map an `SdkResult` to an HTTP envelope. Success and SDK-level
 * failures are both 200 — the SDK has spoken, and the page's mapper
 * is responsible for rendering. Only transport-level failures that
 * the SDK client itself never sees (it always returns an
 * `SdkResult`) fall through to a 5xx here.
 */
function envelope(result: SdkResult): { status: 200; body: SdkResult } {
	return { status: 200, body: result };
}

/**
 * POST /api/phonemes — accept opaque package bytes, return the SDK
 * verdict. The body is read fully (the 16 MiB cap is enforced before
 * the read crosses the SDK boundary) and forwarded as `Uint8Array`
 * so the SDK client can compute SHA-256s if it needs to.
 */
export const POST: RequestHandler = async ({ request }) => {
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_SDK_BODY_BYTES) {
		// Mirror the SDK's own `request_too_large` shape so the page
		// mapper sees one error vocabulary regardless of which
		// boundary caught the cap.
		return json(
			{
				ok: false,
				stage: 'inspect',
				code: 'request_too_large',
				message: `Request body is ${contentLength} bytes; the SDK adapter limit is ${MAX_SDK_BODY_BYTES}.`,
				path: 'request.body',
				diagnostics: []
			} satisfies SdkResult,
			{ status: 413 }
		);
	}

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) {
		throw error(400, { message: 'Request body must contain package bytes.' });
	}
	if (bytes.byteLength > MAX_SDK_BODY_BYTES) {
		return json(
			{
				ok: false,
				stage: 'inspect',
				code: 'request_too_large',
				message: `Request body is ${bytes.byteLength} bytes; the SDK adapter limit is ${MAX_SDK_BODY_BYTES}.`,
				path: 'request.body',
				diagnostics: []
			} satisfies SdkResult,
			{ status: 413 }
		);
	}

	const serviceUrl = resolveServiceUrl();
	const client = new SdkClient({ serviceUrl });
	const result = await client.validate(bytes);
	const { status, body } = envelope(result);
	return json(body, { status });
};
