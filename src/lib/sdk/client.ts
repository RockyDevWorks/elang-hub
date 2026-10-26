/**
 * SDK adapter HTTP client.
 *
 * Per ADR 0001, the Hub speaks HTTP to a separate validation service
 * that wraps the authoritative `elang-rs` CLI. The client is the
 * ONLY place that knows about that service URL — every other module
 * imports from `./contract` and is transport-agnostic.
 *
 * The client is responsible for:
 *   - sending the opaque bytes with a hard body cap (H0207)
 *   - enforcing a wall-clock timeout and AbortSignal (H0207)
 *   - parsing the response into the typed contract (H0201)
 *   - rejecting malformed responses as typed failures (H0206)
 *   - reporting the service as unavailable on network failures
 *
 * The client NEVER inspects or interprets the package — that is the
 * SDK's job.
 */

import { toHubError } from './errors';
import { checkSupportedVersions } from './version';
import {
	asSdkErrorCode,
	type SdkCallOptions,
	type SdkFailure,
	type SdkInspectResult,
	type SdkMode,
	type SdkResult,
	type SdkValidateResult,
	type SdkVerifyResult,
	type SdkDiagnostic,
	type ValidationStage
} from './contract';
import {
	assertBodyWithinLimit,
	composeAbortSignal,
	DEFAULT_SDK_TIMEOUT_MS,
	MAX_SDK_RESPONSE_BYTES
} from './bounds';

/** Configuration for the SDK HTTP client. */
export interface SdkClientConfig {
	/** Base URL of the validation service (no trailing slash). */
	readonly serviceUrl: string;
	/** Optional override for the round-trip timeout. */
	readonly timeoutMs?: number;
	/** Optional `fetch` implementation for tests. Defaults to global `fetch`. */
	readonly fetchImpl?: typeof fetch;
}

/**
 * The Hub-side façade for the authoritative ELANG SDK. Construct
 * one per request (the client is stateless) and call `inspect`,
 * `verify`, or `validate` on the bytes.
 */
export class SdkClient {
	readonly #serviceUrl: string;
	readonly #timeoutMs: number;
	readonly #fetch: typeof fetch;

	constructor(config: SdkClientConfig) {
		this.#serviceUrl = config.serviceUrl.replace(/\/+$/, '');
		this.#timeoutMs = config.timeoutMs ?? DEFAULT_SDK_TIMEOUT_MS;
		this.#fetch = config.fetchImpl ?? fetch.bind(globalThis);
	}

	/** Stage-1 inspection only. Never present as integrity verification. */
	async inspect(bytes: Uint8Array, opts?: Partial<SdkCallOptions>): Promise<SdkResult> {
		return this.#call('inspect', bytes, opts);
	}

	/**
	 * Stage-2 verification — requires SHA-256 integrity of every
	 * resource. By contract, this is NOT a substitute for `validate`.
	 */
	async verify(bytes: Uint8Array, opts?: Partial<SdkCallOptions>): Promise<SdkResult> {
		return this.#call('verify', bytes, opts);
	}

	/**
	 * Stage-3 validation — requires inspect + verify + descriptor
	 * + ELD semantic. Only `validate` may report `ok: true` for the
	 * full pipeline that feeds the phoneme viewer.
	 */
	async validate(bytes: Uint8Array, opts?: Partial<SdkCallOptions>): Promise<SdkResult> {
		return this.#call('validate', bytes, opts);
	}

	async #call(
		mode: SdkMode,
		bytes: Uint8Array,
		opts?: Partial<SdkCallOptions>
	): Promise<SdkResult> {
		try {
			assertBodyWithinLimit(bytes);
		} catch (e) {
			return e as SdkFailure;
		}

		const timeoutMs = opts?.timeoutMs ?? this.#timeoutMs;
		const { signal, cancel } = composeAbortSignal(timeoutMs, opts?.signal);

		// Honour an already-aborted caller signal before contacting the
		// service: any response would be racing the cancellation, and a
		// network round-trip on a dead request is pure waste.
		if (signal.aborted) {
			cancel();
			return this.#failure(
				modeToStage(mode),
				'cancelled',
				'Validation was cancelled before the service was contacted.'
			);
		}

		try {
			const response = await this.#fetch(`${this.#serviceUrl}/${mode}`, {
				method: 'POST',
				headers: {
					'content-type': 'application/octet-stream',
					accept: 'application/json'
				},
				body: bytes as unknown as BodyInit,
				signal
			});

			if (!response.ok) {
				if (response.status === 413) {
					return this.#failure(mode, 'request_too_large', 'Service rejected request as too large.');
				}
				if (response.status === 504 || response.status === 408) {
					return this.#failure(mode, 'timeout', 'Service timed out before responding.');
				}
				if (response.status === 503) {
					return this.#failure(mode, 'service_unavailable', 'Validation service is unavailable.');
				}
				if (response.status >= 500) {
					return this.#failure(mode, 'service_unavailable', 'Validation service error.');
				}
				return this.#failure(mode, 'unknown', `Service responded with HTTP ${response.status}.`);
			}

			// Bound bytes while reading, before decoding or parsing JSON.
			const chunks: Uint8Array[] = [];
			let totalBytes = 0;
			const reader = response.body?.getReader();
			if (reader) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						totalBytes += value.byteLength;
						if (totalBytes > MAX_SDK_RESPONSE_BYTES) {
							void reader.cancel().catch(() => {});
							return this.#failure(
								mode,
								'malformed_response',
								'Service response exceeded the size limit.'
							);
						}
						chunks.push(value);
					}
				} finally {
					reader.releaseLock();
				}
			}
			const body = new Uint8Array(totalBytes);
			let offset = 0;
			for (const chunk of chunks) {
				body.set(chunk, offset);
				offset += chunk.byteLength;
			}
			const text = new TextDecoder().decode(body);

			let json: unknown;
			try {
				json = JSON.parse(text);
			} catch {
				return this.#failure(mode, 'malformed_response', 'Service response was not valid JSON.');
			}

			return parseSdkResult(json, mode);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError' && opts?.signal?.aborted) {
				return this.#failure(modeToStage(mode), 'cancelled', 'Validation was cancelled.');
			}
			return mapTransportError(mode, e);
		} finally {
			cancel();
		}
	}

	#failure(stage: ValidationStage, code: SdkFailure['code'], message: string): SdkFailure {
		return { ok: false, stage, code, message, diagnostics: [] };
	}
}

/**
 * Translate a thrown transport-level error into a typed `SdkFailure`.
 * `AbortError` (browser/fetch-spec) maps to either `cancelled` (if
 * the caller aborted) or `timeout` (if our timer fired).
 */
function mapTransportError(mode: SdkMode, e: unknown): SdkFailure {
	if (e instanceof DOMException && e.name === 'AbortError') {
		return {
			ok: false,
			stage: mode === 'inspect' ? 'inspect' : mode === 'verify' ? 'verify' : 'validate',
			code: 'timeout',
			message: 'The SDK call was aborted (timeout or caller cancellation).',
			diagnostics: []
		};
	}
	if (e instanceof TypeError) {
		// Network-level failure (DNS, refused, offline).
		return {
			ok: false,
			stage: mode === 'inspect' ? 'inspect' : mode === 'verify' ? 'verify' : 'validate',
			code: 'service_unavailable',
			message: 'Could not reach the validation service.',
			diagnostics: []
		};
	}
	return {
		ok: false,
		stage: mode === 'inspect' ? 'inspect' : mode === 'verify' ? 'verify' : 'validate',
		code: 'unknown',
		message: 'An unexpected error occurred while contacting the validation service.',
		diagnostics: []
	};
}

/**
 * Narrow an unknown parsed JSON value into the typed `SdkResult`
 * contract. Reject anything that does not match the contract shape;
 * this is the boundary that protects the Hub from a hostile or
 * misbehaving service.
 */
function parseSdkResult(json: unknown, mode: SdkMode): SdkResult {
	if (!isRecord(json)) {
		return {
			ok: false,
			stage: modeToStage(mode),
			code: 'malformed_response',
			message: 'Service response was not a JSON object.',
			diagnostics: []
		};
	}

	if (json.ok === true) {
		if ('mode' in json && json.mode !== mode) {
			return {
				ok: false,
				stage: modeToStage(mode),
				code: 'malformed_response',
				message: 'Service response mode did not match the requested mode.',
				diagnostics: []
			};
		}
		if (mode === 'inspect') return parseInspect(json);
		if (mode === 'verify') return parseVerify(json);
		return parseValidate(json);
	}

	if (json.ok === false) {
		return parseFailure(json, modeToStage(mode));
	}

	return {
		ok: false,
		stage: modeToStage(mode),
		code: 'malformed_response',
		message: 'Service response was missing the ok flag.',
		diagnostics: []
	};
}

function modeToStage(mode: SdkMode): ValidationStage {
	if (mode === 'inspect') return 'inspect';
	if (mode === 'verify') return 'verify';
	return 'validate';
}

function parseInspect(json: Record<string, unknown>): SdkInspectResult | SdkFailure {
	const specVersion = json.specVersion;
	const containerVersion = json.binaryContainerVersion;
	const discovered = json.discoveredResources;
	if (
		typeof specVersion !== 'string' ||
		typeof containerVersion !== 'string' ||
		typeof discovered !== 'number'
	) {
		return {
			ok: false,
			stage: 'inspect',
			code: 'malformed_response',
			message: 'Inspect response was missing required fields.',
			diagnostics: []
		};
	}
	const versionFailure = checkSupportedVersions({
		specVersion,
		binaryContainerVersion: containerVersion
	});
	if (versionFailure) return versionFailure;
	return {
		ok: true,
		mode: 'inspect',
		specVersion: specVersion as SdkInspectResult['specVersion'],
		binaryContainerVersion: containerVersion as SdkInspectResult['binaryContainerVersion'],
		discoveredResources: discovered,
		diagnostics: parseDiagnostics(json.diagnostics)
	};
}

function parseVerify(json: Record<string, unknown>): SdkVerifyResult | SdkFailure {
	const specVersion = json.specVersion;
	const containerVersion = json.binaryContainerVersion;
	const verified = json.verifiedResources;
	if (
		typeof specVersion !== 'string' ||
		typeof containerVersion !== 'string' ||
		typeof verified !== 'number'
	) {
		return {
			ok: false,
			stage: 'verify',
			code: 'malformed_response',
			message: 'Verify response was missing required fields.',
			diagnostics: []
		};
	}
	const versionFailure = checkSupportedVersions({
		specVersion,
		binaryContainerVersion: containerVersion
	});
	if (versionFailure) return versionFailure;
	return {
		ok: true,
		mode: 'verify',
		specVersion: specVersion as SdkVerifyResult['specVersion'],
		binaryContainerVersion: containerVersion as SdkVerifyResult['binaryContainerVersion'],
		verifiedResources: verified,
		diagnostics: parseDiagnostics(json.diagnostics)
	};
}

function parseValidate(json: Record<string, unknown>): SdkValidateResult | SdkFailure {
	const specVersion = json.specVersion;
	const containerVersion = json.binaryContainerVersion;
	const phonemeResourcePath = json.phonemeResourcePath;
	if (
		typeof specVersion !== 'string' ||
		typeof containerVersion !== 'string' ||
		typeof phonemeResourcePath !== 'string' ||
		phonemeResourcePath.length === 0
	) {
		return {
			ok: false,
			stage: 'validate',
			code: 'malformed_response',
			message: 'Validate response was missing required fields.',
			diagnostics: []
		};
	}
	const versionFailure = checkSupportedVersions({
		specVersion,
		binaryContainerVersion: containerVersion
	});
	if (versionFailure) return versionFailure;
	return {
		ok: true,
		mode: 'validate',
		specVersion: specVersion as SdkValidateResult['specVersion'],
		binaryContainerVersion: containerVersion as SdkValidateResult['binaryContainerVersion'],
		phonemeResourcePath,
		inventory: json.inventory ?? null,
		diagnostics: parseDiagnostics(json.diagnostics)
	};
}

function parseFailure(json: Record<string, unknown>, fallbackStage: ValidationStage): SdkFailure {
	const code = asSdkErrorCode(json.code);
	const message = typeof json.message === 'string' ? json.message : 'Validation failed.';
	const path = typeof json.path === 'string' ? json.path : undefined;
	// Trust the SDK's reported stage when it is one of the known
	// values — the service ran inspect+verify internally before
	// validate, and a failure during that pipeline is correctly
	// attributed to the stage at which it actually failed. An unknown
	// stage in the JSON falls back to the stage of the mode the Hub
	// requested, which is the right default for transport-level
	// failures that never reached the SDK.
	const stage: ValidationStage =
		json.stage === 'inspect' || json.stage === 'verify' || json.stage === 'validate'
			? json.stage
			: fallbackStage;
	return {
		ok: false,
		stage,
		code,
		message,
		...(path !== undefined ? { path } : {}),
		diagnostics: parseDiagnostics(json.diagnostics)
	};
}

function parseDiagnostics(value: unknown): readonly SdkDiagnostic[] {
	if (!Array.isArray(value)) return [];
	const out: SdkDiagnostic[] = [];
	for (const d of value) {
		if (!isRecord(d)) continue;
		const stage = d.stage;
		const code = d.code;
		const message = d.message;
		if (
			(stage !== 'inspect' && stage !== 'verify' && stage !== 'validate') ||
			typeof code !== 'string' ||
			typeof message !== 'string'
		) {
			continue;
		}
		const path = typeof d.path === 'string' ? d.path : undefined;
		const diagnostic: SdkDiagnostic =
			path !== undefined
				? { stage, code: asSdkErrorCode(code), message, path }
				: { stage, code: asSdkErrorCode(code), message };
		out.push(diagnostic);
	}
	return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Re-export so consumers don't need a second import path. */
export { toHubError };
export type { SdkResult, SdkFailure, SdkDiagnostic } from './contract';
