/**
 * Supported-version gate for the SDK adapter.
 *
 * The Hub v0.1.0 only accepts:
 *   - ELANG specification version `0.0.1-1`
 *   - ELANG binary container version `0.1.0`
 *
 * Any other version is a typed failure surfaced to the user with a
 * clear "what we support vs. what you sent" message. The Hub never
 * silently downgrades or upgrades — see docs/sdk-compatibility-policy.md.
 */

import {
	SUPPORTED_BINARY_CONTAINER_VERSION,
	SUPPORTED_SPEC_VERSION,
	type SdkFailure
} from './contract';

export interface VersionPair {
	readonly specVersion: string;
	readonly binaryContainerVersion: string;
}

/**
 * Returns `null` when both versions are supported, or a typed
 * `SdkFailure` describing which one is not. The Hub must surface
 * the returned failure verbatim — no reformatting, no silent retry.
 */
export function checkSupportedVersions(v: VersionPair): SdkFailure | null {
	if (v.specVersion !== SUPPORTED_SPEC_VERSION) {
		return {
			ok: false,
			stage: 'inspect',
			code: 'unsupported_spec_version',
			message: `Unsupported ELANG specification version: ${v.specVersion}. ELANG Hub v0.1.0 requires ${SUPPORTED_SPEC_VERSION}.`,
			path: 'descriptor.spec_version',
			diagnostics: []
		};
	}
	if (v.binaryContainerVersion !== SUPPORTED_BINARY_CONTAINER_VERSION) {
		return {
			ok: false,
			stage: 'inspect',
			code: 'unsupported_binary_container_version',
			message: `Unsupported ELANG binary container version: ${v.binaryContainerVersion}. ELANG Hub v0.1.0 requires ${SUPPORTED_BINARY_CONTAINER_VERSION}.`,
			path: 'container.header.binary_container_version',
			diagnostics: []
		};
	}
	return null;
}
