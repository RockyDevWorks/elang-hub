/**
 * Public entry point for the SDK adapter.
 *
 * The Hub must import SDK adapter types and the client from this
 * barrel — never from internal modules — so the implementation can
 * be swapped (e.g. a future WASM binding) without touching callers.
 */

export {
	SUPPORTED_SPEC_VERSION,
	SUPPORTED_BINARY_CONTAINER_VERSION,
	type SdkCallOptions,
	type SdkDiagnostic,
	type SdkErrorCode,
	type SdkFailure,
	type SdkInspectResult,
	type SdkMode,
	type SdkResult,
	type SdkSuccess,
	type SdkValidateResult,
	type SdkVerifyResult,
	type ValidationStage,
	asSdkErrorCode
} from './contract';

export {
	DEFAULT_SDK_TIMEOUT_MS,
	MAX_SDK_BODY_BYTES,
	MAX_SDK_DIAGNOSTICS,
	MAX_SDK_RESPONSE_BYTES,
	MAX_SDK_STRING_LENGTH,
	assertBodyWithinLimit,
	clampSdkString,
	composeAbortSignal,
	stripTrailingSlashes
} from './bounds';

export { checkSupportedVersions, type VersionPair } from './version';

export { toHubError, firstBoundedDetail, type HubError, type HubErrorCode } from './errors';

export { SdkClient, type SdkClientConfig } from './client';
