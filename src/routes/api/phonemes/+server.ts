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

const SLASH_CHAR_CODE = 47;

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
	// Strip trailing slashes with an explicit scan rather than a
	// regex. `/\/+$/` is quadratic on hostile input: the `+`
	// backtracks at every start offset, so a URL like "//////x"
	// costs O(n^2). The SDK service URL is deployment
	// configuration, but it is still environment input and the
	// endpoint is public — no reason to leave a super-linear
	// pattern on the request path.
	let end = url.length;
	while (end > 0 && url.charCodeAt(end - 1) === SLASH_CHAR_CODE) {
		end--;
	}
	return url.slice(0, end);
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

function requestTooLarge(byteLength: number): Response {
	// Mirror the SDK's shape so the page sees one error vocabulary.
	return json(
		{
			ok: false,
			stage: 'inspect',
			code: 'request_too_large',
			message: `Request body is ${byteLength} bytes; the SDK adapter limit is ${MAX_SDK_BODY_BYTES}.`,
			path: 'request.body',
			diagnostics: []
		} satisfies SdkResult,
		{ status: 413 }
	);
}

/**
 * POST /api/phonemes — accept opaque package bytes, return the SDK
 * verdict. The body is read incrementally with a 16 MiB cap enforced
 * while reading and forwarded as `Uint8Array`
 * so the SDK client can compute SHA-256s if it needs to.
 */
export const POST: RequestHandler = async ({ request }) => {
	// Resolve the service URL BEFORE we touch the body. A
	// misconfigured deployment must reject with 503 without
	// buffering any bytes; reading first would buffer up to
	// Cloudflare's documented request-body limit (100 MB on
	// Free/Pro, up to 5 GB on Enterprise) before the check
	// fires.
	const serviceUrl = resolveServiceUrl();

	// Cheap pre-check: a Content-Length header above the SDK cap
	// lets us reject before opening the body stream. The cap is
	// still enforced while reading — Content-Length is a hint,
	// not a guarantee.
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_SDK_BODY_BYTES) {
		return requestTooLarge(contentLength);
	}

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	const reader = request.body?.getReader();
	if (reader) {
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				totalBytes += value.byteLength;
				if (totalBytes > MAX_SDK_BODY_BYTES) {
					void reader.cancel().catch(() => {});
					return requestTooLarge(totalBytes);
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	if (totalBytes === 0) {
		throw error(400, { message: 'Request body must contain package bytes.' });
	}
	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	const client = new SdkClient({ serviceUrl });
	const result = await client.validate(bytes);
	const { status, body } = envelope(result);
	return json(body, { status });
};
