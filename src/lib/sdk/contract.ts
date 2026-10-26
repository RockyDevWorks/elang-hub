/**
 * SDK Adapter Contract
 *
 * The boundary between ELANG Hub and the authoritative `elang-rs` SDK.
 * Per ADR 0001, the Hub does not parse ELANG; it delegates all
 * normative validation to the SDK through this typed contract.
 *
 * Three modes are exposed — `inspect`, `verify`, and `validate` — with
 * monotonically stronger guarantees. The Hub must not present any
 * weaker mode as a substitute for a stronger one.
 *
 * The concrete HTTP transport lives in `./client.ts`; the contract
 * is transport-agnostic so the implementation can be swapped (e.g.
 * for a future WASM binding) without changing callers.
 */

/**
 * Supported ELANG specification version (per docs/sdk-compatibility-policy.md).
 * v0.1.0 of the Hub is only compliant with spec `0.0.1-1`.
 */
export const SUPPORTED_SPEC_VERSION = '0.0.1-1' as const;

/**
 * Supported ELANG binary container version.
 * v0.1.0 of the Hub only accepts container `0.1.0`.
 */
export const SUPPORTED_BINARY_CONTAINER_VERSION = '0.1.0' as const;

/**
 * Identifier for each SDK stage. Preserved through to user-facing
 * errors so the user knows whether the failure was at the container,
 * resource-integrity, descriptor, or semantic-ELD level.
 */
export type ValidationStage =
	/** Stage 1 — container parse / structure inspection. */
	| 'inspect'
	/** Stage 2 — resource-by-resource SHA-256 integrity verification. */
	| 'verify'
	/** Stage 3 — descriptor + ELD semantic validation. */
	| 'validate';

/**
 * Identifier for each SDK operation the Hub can request.
 *
 * `inspect` only — never presented as integrity verification.
 * `verify` requires SHA-256 integrity of every resource.
 * `validate` requires inspect + verify + descriptor + ELD semantic.
 */
export type SdkMode = 'inspect' | 'verify' | 'validate';

/** Stable error codes preserved from the SDK to the user surface. */
export type SdkErrorCode =
	| 'unsupported_spec_version'
	| 'unsupported_binary_container_version'
	| 'malformed_container'
	| 'corrupted_resource'
	| 'integrity_check_failed'
	| 'descriptor_invalid'
	| 'eld_invalid'
	| 'unsupported_feature'
	| 'service_unavailable'
	| 'request_too_large'
	| 'timeout'
	| 'cancelled'
	| 'malformed_response'
	| 'unknown';

const SDK_ERROR_CODES: ReadonlySet<SdkErrorCode> = new Set([
	'unsupported_spec_version',
	'unsupported_binary_container_version',
	'malformed_container',
	'corrupted_resource',
	'integrity_check_failed',
	'descriptor_invalid',
	'eld_invalid',
	'unsupported_feature',
	'service_unavailable',
	'request_too_large',
	'timeout',
	'cancelled',
	'malformed_response',
	'unknown'
]);

/** Type guard for `SdkErrorCode`. Unknown codes are coerced to `'unknown'`. */
export function asSdkErrorCode(value: unknown): SdkErrorCode {
	return typeof value === 'string' && (SDK_ERROR_CODES as Set<string>).has(value)
		? (value as SdkErrorCode)
		: 'unknown';
}

/**
 * A single diagnostic emitted by the SDK. The `stage` lets the Hub
 * map the diagnostic back to the user-facing error boundary, while
 * `code` provides a stable, machine-readable reason. `message` is
 * already rendered and bounded by the service; the Hub treats it as
 * untrusted user content for HTML safety.
 */
export interface SdkDiagnostic {
	readonly stage: ValidationStage;
	readonly code: SdkErrorCode;
	readonly message: string;
	/** Optional path or locator (e.g. resource name, ELD field). */
	readonly path?: string;
}

/**
 * Successful validation verdict for the strongest mode (`validate`).
 * The Hub must not render phoneme data unless `ok` is true.
 */
export interface SdkValidateResult {
	readonly ok: true;
	readonly mode: 'validate';
	readonly specVersion: typeof SUPPORTED_SPEC_VERSION;
	readonly binaryContainerVersion: typeof SUPPORTED_BINARY_CONTAINER_VERSION;
	/**
	 * Opaque payload from the SDK containing the validated phoneme
	 * inventory. The Hub MUST treat this as untrusted shape; the
	 * H03 view model is responsible for narrowing it. v0.1.0 keeps
	 * it as `unknown` at this layer.
	 */
	readonly inventory: unknown;
	/** Diagnostics that did not block success (e.g. advisories). */
	readonly diagnostics: readonly SdkDiagnostic[];
}

/**
 * Successful verification verdict for `verify`. Never presented as
 * a substitute for `validate` — see `noWeakerAsStronger` invariant.
 */
export interface SdkVerifyResult {
	readonly ok: true;
	readonly mode: 'verify';
	readonly specVersion: typeof SUPPORTED_SPEC_VERSION;
	readonly binaryContainerVersion: typeof SUPPORTED_BINARY_CONTAINER_VERSION;
	/** Number of resources whose SHA-256 matched. */
	readonly verifiedResources: number;
	/** Diagnostics that did not block success. */
	readonly diagnostics: readonly SdkDiagnostic[];
}

/**
 * Successful inspection verdict for `inspect`. By contract, inspect
 * alone is NOT integrity verification and the Hub must surface this
 * caveat whenever it shows the result to the user.
 */
export interface SdkInspectResult {
	readonly ok: true;
	readonly mode: 'inspect';
	readonly specVersion: typeof SUPPORTED_SPEC_VERSION;
	readonly binaryContainerVersion: typeof SUPPORTED_BINARY_CONTAINER_VERSION;
	/** Number of resources discovered in the container. */
	readonly discoveredResources: number;
	/** Diagnostics that did not block success. */
	readonly diagnostics: readonly SdkDiagnostic[];
}

/** Discriminated union of every successful verdict. */
export type SdkSuccess = SdkInspectResult | SdkVerifyResult | SdkValidateResult;

/**
 * Failure verdict. The Hub treats every successful validation as
 * untrusted until the typed error is mapped and surfaced — see
 * `./errors.ts` for the user-facing mapping.
 */
export interface SdkFailure {
	readonly ok: false;
	/** Stage at which the SDK emitted the failure. */
	readonly stage: ValidationStage;
	/** Stable error code (see `SdkErrorCode`). */
	readonly code: SdkErrorCode;
	/** Bounded, service-rendered message. */
	readonly message: string;
	/** Optional resource / field locator. */
	readonly path?: string;
	/** Additional SDK diagnostics (e.g. nested causes). */
	readonly diagnostics: readonly SdkDiagnostic[];
}

/** Discriminated union of every possible SDK verdict. */
export type SdkResult = SdkSuccess | SdkFailure;

/**
 * Options applied at the adapter boundary. The Hub passes these on
 * every call so the client can enforce time, memory and cancellation
 * limits — see `./bounds.ts`.
 */
export interface SdkCallOptions {
	/** Hard wall-clock budget for the round-trip. */
	readonly timeoutMs: number;
	/** Abort signal for caller-driven cancellation (H0105). */
	readonly signal?: AbortSignal;
}
