/**
 * Tests for the supported-version gate (H0205).
 *
 * v0.1.0 of the Hub only accepts:
 *   - ELANG specification version `0.0.1-1`
 *   - ELANG binary container version `0.1.0`
 *
 * Any other combination must be rejected with a typed failure that
 * distinguishes spec version from binary container version, so the
 * user can act on the right thing.
 */

import { describe, expect, it } from 'vitest';
import { checkSupportedVersions } from './version';
import { SUPPORTED_BINARY_CONTAINER_VERSION, SUPPORTED_SPEC_VERSION } from './contract';

describe('checkSupportedVersions (H0205)', () => {
	it('accepts the only supported combination', () => {
		expect(
			checkSupportedVersions({
				specVersion: SUPPORTED_SPEC_VERSION,
				binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION
			})
		).toBeNull();
	});

	it('rejects an unsupported spec version with a typed failure', () => {
		const result = checkSupportedVersions({
			specVersion: '0.0.2-1',
			binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION
		});
		expect(result).not.toBeNull();
		expect(result?.ok).toBe(false);
		expect(result?.code).toBe('unsupported_spec_version');
		expect(result?.stage).toBe('inspect');
		expect(result?.message).toContain('0.0.2-1');
		expect(result?.message).toContain(SUPPORTED_SPEC_VERSION);
		expect(result?.path).toBe('descriptor.spec_version');
	});

	it('rejects an unsupported binary container version with a typed failure', () => {
		const result = checkSupportedVersions({
			specVersion: SUPPORTED_SPEC_VERSION,
			binaryContainerVersion: '0.2.0'
		});
		expect(result).not.toBeNull();
		expect(result?.code).toBe('unsupported_binary_container_version');
		expect(result?.path).toBe('container.header.binary_container_version');
	});

	it('reports the spec version failure before the container version', () => {
		const result = checkSupportedVersions({
			specVersion: '0.0.2-1',
			binaryContainerVersion: '0.2.0'
		});
		// Spec is checked first per contract; the user gets the right
		// "fix this first" signal.
		expect(result?.code).toBe('unsupported_spec_version');
	});

	it('distinguishes spec version from binary container version', () => {
		const specFailure = checkSupportedVersions({
			specVersion: 'X',
			binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION
		});
		const containerFailure = checkSupportedVersions({
			specVersion: SUPPORTED_SPEC_VERSION,
			binaryContainerVersion: 'X'
		});
		expect(specFailure?.code).not.toBe(containerFailure?.code);
	});
});
