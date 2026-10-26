/**
 * Tests for the package metadata view model (H0302).
 *
 * The package view is read-only. It deliberately does NOT carry any
 * authorship information — the SDK only proves integrity, not
 * authorship. Tests pin:
 *
 *   - all fields are preserved byte-exactly
 *   - description: null is preserved (not coerced to '')
 *   - the view is frozen
 */

import { describe, expect, it } from 'vitest';
import { buildPackageView, type PackageView } from './package';
import type { PackagePayload } from './inventory';

function payload(overrides: Partial<PackagePayload> = {}): PackagePayload {
	return {
		identifier: 'urn:elang:language:rocky:aelith:1.0.0',
		namespace: 'rocky',
		languageName: 'aelith',
		languageVersion: '1.0.0',
		name: 'Aelith',
		description: 'A small constructed language.',
		...overrides
	};
}

describe('buildPackageView', () => {
	it('preserves every field exactly', () => {
		const v = buildPackageView(payload(), {
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		});
		expect(v.identifier).toBe('urn:elang:language:rocky:aelith:1.0.0');
		expect(v.namespace).toBe('rocky');
		expect(v.languageName).toBe('aelith');
		expect(v.languageVersion).toBe('1.0.0');
		expect(v.name).toBe('Aelith');
		expect(v.description).toBe('A small constructed language.');
		expect(v.specVersions).toEqual({
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		});
	});

	it('preserves Unicode in name and description', () => {
		const v = buildPackageView(
			payload({ name: 'Aelith 语言', description: 'Une langue 🙂 avec accents.' }),
			{ specVersion: '0.0.1-1', binaryContainerVersion: '0.1.0' }
		);
		expect(v.name).toBe('Aelith 语言');
		expect(v.description).toBe('Une langue 🙂 avec accents.');
	});

	it('preserves null description (does not coerce to empty string)', () => {
		const v = buildPackageView(payload({ description: null }), {
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		});
		expect(v.description).toBeNull();
	});

	it('returns a frozen view (read-only invariant)', () => {
		const v = buildPackageView(payload(), {
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		}) as PackageView & { readonly [k: string]: unknown };
		expect(Object.isFrozen(v)).toBe(true);
		expect(Object.isFrozen(v.specVersions)).toBe(true);
	});

	it('does not fabricate authorship from integrity (H0302)', () => {
		// The view deliberately has no field for "verified by",
		// "author", "signer", "publisher", or any equivalent.
		// Integrity is not authorship — see ADR 0001 / sdk-compat doc.
		const v = buildPackageView(payload(), {
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		});
		const keys = Object.keys(v);
		expect(keys).not.toContain('verifiedBy');
		expect(keys).not.toContain('author');
		expect(keys).not.toContain('signer');
		expect(keys).not.toContain('publisher');
		expect(keys).not.toContain('trusted');
	});
});
