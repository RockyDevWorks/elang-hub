/**
 * Tests for the top-level extractor (H03 entry point).
 *
 * The extractor maps an `SdkValidateResult` from the SDK adapter to a
 * `PhonemeViewResult`. H0308 requires these tests to compare the view
 * model against the authoritative SDK result across:
 *
 *   - varied inventories (minimal, allophones, conditions, custom groups)
 *   - Unicode cases (BMP + supplementary plane)
 *   - optional fields (null description, empty allophones)
 *   - manifest-defined paths (H0301 — different phoneme resource paths)
 *
 * The tests also pin the empty-vs-error distinction (H0307):
 *   - `view.inventory.isEmpty === true` is a successful view.
 *   - `result.ok === false` with `PHONEME_VIEW_EXTRACTION_FAILED` is
 *     an extraction error.
 */

import { describe, expect, it } from 'vitest';
import { extractPhonemeView, PHONEME_VIEW_EXTRACTION_FAILED } from './extract';
import type { SdkDiagnostic, SdkValidateResult } from '../sdk/contract';
import { SUPPORTED_BINARY_CONTAINER_VERSION, SUPPORTED_SPEC_VERSION } from '../sdk/contract';
import type {
	AllophonePayload,
	GroupPayload,
	InventoryBodyPayload,
	InventoryPayload,
	PackagePayload,
	RootPayload
} from './inventory';

/* ------------------------------------------------------------------ */
/* Fixture builders                                                   */
/* ------------------------------------------------------------------ */

function packagePayload(overrides: Partial<PackagePayload> = {}): PackagePayload {
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

function inventoryBody(groups: GroupPayload[]): InventoryBodyPayload {
	return { groups };
}

function root(ipa: string, roman: string, allophones: AllophonePayload[] = []): RootPayload {
	return { ipa, roman, when: null, allophones };
}

function inventoryPayload(
	pkgOverrides: Partial<PackagePayload> = {},
	groups: GroupPayload[] = []
): InventoryPayload {
	return { package: packagePayload(pkgOverrides), inventory: inventoryBody(groups) };
}

function validateResult(
	inventory: unknown,
	overrides: Partial<SdkValidateResult> = {}
): SdkValidateResult {
	return {
		ok: true,
		mode: 'validate',
		specVersion: SUPPORTED_SPEC_VERSION,
		binaryContainerVersion: SUPPORTED_BINARY_CONTAINER_VERSION,
		phonemeResourcePath: 'Linguistics/phonemes.eld',
		inventory,
		diagnostics: [],
		...overrides
	};
}

/* ------------------------------------------------------------------ */
/* H0308 — varied inventories                                         */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — varied inventories', () => {
	it('handles a minimal inventory (consonants + vowels, no allophones)', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'consonants',
						roots: [root('p', 'p'), root('t', 't')]
					},
					{
						kind: 'vowels',
						roots: [root('a', 'a')]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.inventory.isEmpty).toBe(false);
		expect(result.view.inventory.rootCount).toBe(3);
		expect(result.view.inventory.allophoneCount).toBe(0);
	});

	it('handles an inventory with allophones (H0305)', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'consonants',
						roots: [
							{
								ipa: 't',
								roman: 't',
								when: null,
								allophones: [
									{ ipa: 'ɾ', roman: null, when: null },
									{
										ipa: 'tʰ',
										roman: 'th',
										when: {
											children: [
												{
													kind: 'predicate',
													predicate: {
														kind: 'word-position',
														value: 'initial'
													}
												}
											]
										}
									}
								]
							}
						]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const root = result.view.inventory.groups[0].roots[0];
		expect(root.allophones).toHaveLength(2);
		// Allophones are sorted by IPA code points (H0307):
		// 'tʰ' (U+0074 + U+02B0) sorts before 'ɾ' (U+027E).
		expect(root.allophones[0].ipa).toBe('tʰ');
		expect(root.allophones[0].romanKind).toEqual({ kind: 'explicit', text: 'th' });
		expect(root.allophones[0].when?.displayText).toBe('word-position: initial');
		expect(root.allophones[1].ipa).toBe('ɾ');
		expect(root.allophones[1].romanKind).toEqual({ kind: 'inherited' });
	});

	it('handles a custom group (H0301)', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: { name: 'diphthongs' },
						roots: [root('aɪ', 'ai')]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.inventory.groups).toHaveLength(1);
		expect(result.view.inventory.groups[0].displayName).toBe('diphthongs');
		expect(result.view.inventory.groups[0].kind).toEqual({ name: 'diphthongs' });
	});

	it('handles a deeply nested condition (H0305)', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'consonants',
						roots: [
							{
								ipa: 'p',
								roman: 'p',
								when: {
									children: [
										{
											kind: 'group',
											children: [
												{
													kind: 'predicate',
													predicate: {
														kind: 'word-position',
														value: 'initial'
													}
												},
												{
													kind: 'or',
													left: {
														kind: 'predicate',
														predicate: {
															kind: 'previous-phoneme',
															ipa: 's'
														}
													},
													right: {
														kind: 'predicate',
														predicate: {
															kind: 'previous-phoneme',
															ipa: 'ʃ'
														}
													}
												}
											]
										}
									]
								},
								allophones: []
							}
						]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const w = result.view.inventory.groups[0].roots[0].when;
		expect(w).not.toBeNull();
		if (!w) return;
		// The tree is preserved (no flattening).
		expect(w.children).toHaveLength(1);
		expect(w.children[0].kind).toBe('group');
	});
});

/* ------------------------------------------------------------------ */
/* H0308 — Unicode cases                                              */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — Unicode preservation (H0303)', () => {
	it('preserves precomposed and decomposed IPA forms as distinct', () => {
		const precomposed = 'é'; // U+00E9
		const decomposed = 'e\u0301'; // U+0065 + U+0301
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'vowels',
						roots: [
							{ ipa: precomposed, roman: 'e', when: null, allophones: [] },
							{ ipa: decomposed, roman: 'e', when: null, allophones: [] }
						]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const ipas = result.view.inventory.groups[0].roots.map((r) => r.ipa);
		// Both forms must survive — the Hub does not NFC-normalize.
		expect(ipas).toContain(precomposed);
		expect(ipas).toContain(decomposed);
	});

	it('preserves supplementary-plane IPA identifiers', () => {
		// Not realistic, but pins that the comparator and storage
		// handle U+1F600-class characters correctly.
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'consonants',
						roots: [
							{ ipa: '😀', roman: 'smile', when: null, allophones: [] },
							{ ipa: 'a', roman: 'a', when: null, allophones: [] }
						]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const ipas = result.view.inventory.groups[0].roots.map((r) => r.ipa);
		expect(ipas).toEqual(['a', '😀']);
	});

	it('preserves IPA references in cross-phoneme conditions', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: 'consonants',
						roots: [
							{
								ipa: 't',
								roman: 't',
								when: {
									children: [
										{
											kind: 'predicate',
											predicate: { kind: 'previous-phoneme', ipa: 'tʰ' }
										},
										{
											kind: 'predicate',
											predicate: { kind: 'next-phoneme', ipa: 'ŋ' }
										}
									]
								},
								allophones: []
							}
						]
					}
				])
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const w = result.view.inventory.groups[0].roots[0].when;
		expect(w).not.toBeNull();
		if (!w) return;
		const first = w.children[0];
		const second = w.children[1];
		if (first.kind !== 'predicate' || second.kind !== 'predicate') {
			expect.fail('expected predicates');
			return;
		}
		expect(first.predicate).toEqual({ kind: 'previous-phoneme', ipa: 'tʰ' });
		expect(second.predicate).toEqual({ kind: 'next-phoneme', ipa: 'ŋ' });
	});
});

/* ------------------------------------------------------------------ */
/* H0308 — optional fields                                            */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — optional fields (H0302, H0306)', () => {
	it('preserves a null description (does not coerce)', () => {
		const result = extractPhonemeView(validateResult(inventoryPayload({ description: null }, [])));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.package.description).toBeNull();
	});

	it('preserves Unicode in the language name and description', () => {
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({
					name: 'Aelith 语言',
					description: 'Une langue 🙂 avec accents.'
				})
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.package.name).toBe('Aelith 语言');
		expect(result.view.package.description).toBe('Une langue 🙂 avec accents.');
	});

	it('treats zero groups as a valid empty inventory, NOT an error', () => {
		// H0307: a successful empty inventory is a distinct state
		// from a processing error. The Hub MUST render it as a
		// deliberate "no phonemes" placeholder, not as an error.
		const result = extractPhonemeView(validateResult(inventoryPayload({}, [])));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.inventory.isEmpty).toBe(true);
		expect(result.view.inventory.groups).toEqual([]);
		expect(result.view.inventory.rootCount).toBe(0);
		expect(result.view.inventory.allophoneCount).toBe(0);
	});
});

/* ------------------------------------------------------------------ */
/* H0301 — manifest-defined paths                                     */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — manifest-defined paths (H0301)', () => {
	it('exposes the SDK-resolved phoneme resource path verbatim', () => {
		const result = extractPhonemeView(
			validateResult(inventoryPayload({}, []), {
				phonemeResourcePath: 'linguistics/phonemes_main.eld'
			})
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.phonemeResourcePath).toBe('linguistics/phonemes_main.eld');
	});

	it('never hardcodes a default path — the SDK-supplied path is authoritative', () => {
		// The same inventory passes through with three different
		// resource paths and the view reflects each one. The Hub
		// cannot substitute its own default.
		const paths = ['Linguistics/phonemes.eld', 'a.eld', 'deep/nested/path/with/many/segments.eld'];
		for (const p of paths) {
			const result = extractPhonemeView(
				validateResult(inventoryPayload({}, []), { phonemeResourcePath: p })
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.view.phonemeResourcePath).toBe(p);
		}
	});
});

/* ------------------------------------------------------------------ */
/* Diagnostics preservation                                           */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — diagnostics', () => {
	it('preserves SDK diagnostics through the view', () => {
		const diag: SdkDiagnostic = {
			stage: 'validate',
			code: 'eld_invalid',
			message: 'advisory: prefered IPA is U+0259'
		};
		const result = extractPhonemeView(
			validateResult(inventoryPayload({}, []), { diagnostics: [diag] })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.diagnostics).toEqual([diag]);
	});
});

/* ------------------------------------------------------------------ */
/* H0307 — empty state vs error                                       */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — empty state vs extraction error', () => {
	it('returns ok=true for a valid empty inventory (H0307)', () => {
		const result = extractPhonemeView(validateResult(inventoryPayload({}, [])));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.view.inventory.isEmpty).toBe(true);
	});

	it('returns ok=false with PHONEME_VIEW_EXTRACTION_FAILED for a non-object payload', () => {
		// A non-object inventory (string, null, array) is rejected
		// at the very top of the narrow function with the closed-set
		// `inventory_not_object` code.
		const result = extractPhonemeView(validateResult('this is not an inventory'));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe(PHONEME_VIEW_EXTRACTION_FAILED);
		expect(result.cause.code).toBe('inventory_not_object');
	});

	it('returns ok=false for a payload missing the inventory section', () => {
		const result = extractPhonemeView(validateResult({ package: packagePayload() }));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe(PHONEME_VIEW_EXTRACTION_FAILED);
		expect(result.cause.code).toBe('inventory_section_invalid');
	});

	it('returns ok=false for a payload with a bad group kind', () => {
		const broken = inventoryPayload({}, [{ kind: 'semivowels' as 'consonants', roots: [] }]);
		const result = extractPhonemeView(validateResult(broken));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe(PHONEME_VIEW_EXTRACTION_FAILED);
		expect(result.cause.code).toBe('group_kind_invalid');
	});

	it('returns the field path for an extraction error', () => {
		const broken = inventoryPayload({}, [
			{
				kind: 'consonants',
				roots: [{ ipa: 42 as unknown as string, roman: 'p', when: null, allophones: [] }]
			}
		]);
		const result = extractPhonemeView(validateResult(broken));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.cause.code).toBe('root_ipa_invalid');
		expect(result.cause.path).toBe('inventory.groups[0].roots[0].ipa');
	});
});

/* ------------------------------------------------------------------ */
/* Round-trip fidelity (H0308)                                        */
/* ------------------------------------------------------------------ */

describe('extractPhonemeView — view model fidelity', () => {
	it('view inventory exactly mirrors the narrow payload, sorted', () => {
		const payload = inventoryPayload({}, [
			{
				kind: 'vowels',
				roots: [
					{ ipa: 'z', roman: 'z', when: null, allophones: [] },
					{ ipa: 'a', roman: 'a', when: null, allophones: [] }
				]
			},
			{
				kind: 'consonants',
				roots: [
					{ ipa: 'b', roman: 'b', when: null, allophones: [] },
					{ ipa: 'a', roman: 'a', when: null, allophones: [] }
				]
			}
		]);
		const result = extractPhonemeView(validateResult(payload));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Groups canonicalized: consonants before vowels.
		expect(result.view.inventory.groups.map((g) => g.displayName)).toEqual([
			'consonants',
			'vowels'
		]);
		// Roots sorted by IPA code points within each group.
		expect(result.view.inventory.groups[0].roots.map((r) => r.ipa)).toEqual(['a', 'b']);
		expect(result.view.inventory.groups[1].roots.map((r) => r.ipa)).toEqual(['a', 'z']);
	});

	it('view is deeply frozen (read-only invariant)', () => {
		const diagnostic: SdkDiagnostic = {
			stage: 'validate',
			code: 'eld_invalid',
			message: 'advisory'
		};
		const result = extractPhonemeView(
			validateResult(
				inventoryPayload({}, [
					{
						kind: { name: 'stops' },
						roots: [
							{
								ipa: 't',
								roman: 't',
								when: {
									children: [
										{
											kind: 'predicate',
											predicate: { kind: 'word-position', value: 'initial' }
										}
									]
								},
								allophones: [{ ipa: 'ɾ', roman: null, when: null }]
							}
						]
					}
				]),
				{ diagnostics: [diagnostic] }
			)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(Object.isFrozen(result.view)).toBe(true);
		expect(Object.isFrozen(result.view.package)).toBe(true);
		expect(Object.isFrozen(result.view.inventory)).toBe(true);
		expect(Object.isFrozen(result.view.inventory.groups)).toBe(true);
		const group = result.view.inventory.groups[0];
		expect(Object.isFrozen(group)).toBe(true);
		expect(Object.isFrozen(group.kind)).toBe(true);
		expect(Object.isFrozen(group.roots)).toBe(true);
		const r = group.roots[0];
		expect(Object.isFrozen(r)).toBe(true);
		expect(Object.isFrozen(r.allophones)).toBe(true);
		expect(Object.isFrozen(r.allophones[0])).toBe(true);
		expect(Object.isFrozen(r.allophones[0].romanKind)).toBe(true);
		expect(Object.isFrozen(r.when)).toBe(true);
		expect(Object.isFrozen(r.when?.children)).toBe(true);
		const condition = r.when?.children[0];
		expect(condition?.kind).toBe('predicate');
		if (condition?.kind === 'predicate') {
			expect(Object.isFrozen(condition)).toBe(true);
			expect(Object.isFrozen(condition.predicate)).toBe(true);
		}
		expect(Object.isFrozen(result.view.diagnostics)).toBe(true);
		expect(Object.isFrozen(result.view.diagnostics[0])).toBe(true);
		expect(result.view.diagnostics[0]).not.toBe(diagnostic);
		expect(Object.isFrozen(diagnostic)).toBe(false);
	});
});
