/**
 * Tests for the inventory payload narrow function (H03 boundary).
 *
 * The narrow function is the Hub's only line of defence between a
 * (possibly hostile) SDK payload and the view layer. These tests pin
 * the contract: any deviation from the documented `InventoryPayload`
 * shape produces a typed `NarrowError`; nothing throws, nothing
 * silently coerces.
 *
 * Coverage:
 *   - every required field is enforced
 *   - every type violation is rejected
 *   - empty / minimal / maximal inventories all narrow successfully
 *   - Unicode IPA strings are preserved byte-exactly
 *   - condition trees (predicate / group / or) round-trip
 *   - the path annotation pinpoints the offending field
 */

import { describe, expect, it } from 'vitest';
import {
	conditionPayloadToView,
	narrowInventoryPayload,
	type InventoryPayload,
	type NarrowErrorCode
} from './inventory';
import { groupView, orView, predicateView, whenView } from './conditions';

/**
 * Strip the `readonly` modifiers so test fixtures can be mutated as
 * they're built. The narrow function accepts `unknown`, so the
 * precise static type is irrelevant — the tests construct values
 * that satisfy the `InventoryPayload` shape and let the narrow
 * function be the authority on what counts as valid.
 */
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

type MutablePayload = Mutable<InventoryPayload>;

function validPayload(): MutablePayload {
	return {
		package: {
			identifier: 'urn:elang:language:rocky:aelith:1.0.0',
			namespace: 'rocky',
			languageName: 'aelith',
			languageVersion: '1.0.0',
			name: 'Aelith',
			description: null
		},
		inventory: {
			groups: [
				{
					kind: 'consonants',
					roots: [
						{ ipa: 'p', roman: 'p', when: null, allophones: [] },
						{ ipa: 't', roman: 't', when: null, allophones: [] }
					]
				},
				{
					kind: 'vowels',
					roots: [{ ipa: 'a', roman: 'a', when: null, allophones: [] }]
				}
			]
		}
	};
}

/** Force a typed payload into `unknown` with a single field override. */
function withOverride(
	base: MutablePayload,
	field: keyof MutablePayload['package'],
	value: unknown
): unknown {
	return {
		...base,
		package: { ...base.package, [field]: value }
	};
}

/**
 * Clone the valid payload, apply `mutate`, narrow, and assert that the
 * narrow function rejects it with the expected error code. Centralises
 * the "rejects X" boilerplate (clone → mutate → narrow → assert) that
 * would otherwise be repeated across every rejection test.
 *
 * The mutator receives the cloned payload as `any` so it can substitute
 * any shape (string for an object, missing field, non-array, etc.) —
 * the whole point of these tests is to feed the narrow function shapes
 * it shouldn't see in production.
 */
function expectRejection(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mutate: (broken: any) => void,
	code: NarrowErrorCode
): void {
	const broken = JSON.parse(JSON.stringify(validPayload()));
	mutate(broken);
	const r = narrowInventoryPayload(broken);
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.error.code).toBe(code);
}

describe('narrowInventoryPayload — happy path', () => {
	it('accepts a minimal valid payload', () => {
		const r = narrowInventoryPayload(validPayload());
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.package.identifier).toBe('urn:elang:language:rocky:aelith:1.0.0');
			expect(r.value.inventory.groups).toHaveLength(2);
		}
	});

	it('accepts an empty inventory (groups: [])', () => {
		const payload = validPayload();
		payload.inventory.groups = [];
		const r = narrowInventoryPayload(payload);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.inventory.groups).toEqual([]);
		}
	});

	it('accepts a custom group with a valid slug name', () => {
		const payload = validPayload();
		payload.inventory.groups.push({
			kind: { name: 'diphthongs' },
			roots: [{ ipa: 'aɪ', roman: 'ai', when: null, allophones: [] }]
		});
		const r = narrowInventoryPayload(payload);
		expect(r.ok).toBe(true);
	});

	it('preserves Unicode IPA strings byte-exactly (H0303)', () => {
		const payload = validPayload();
		payload.inventory.groups[0].roots.push({
			ipa: 'tʰ',
			roman: 'th',
			when: null,
			allophones: []
		});
		payload.inventory.groups[0].roots.push({
			ipa: 'ŋ',
			roman: 'ng',
			when: null,
			allophones: []
		});
		const r = narrowInventoryPayload(payload);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const ipas = r.value.inventory.groups[0].roots.map((x) => x.ipa);
			expect(ipas).toContain('tʰ');
			expect(ipas).toContain('ŋ');
			expect(ipas).toContain('p');
			expect(ipas).toContain('t');
		}
	});

	it('accepts a description with Unicode (H0302)', () => {
		const payload = validPayload();
		payload.package.description = 'A small language with é🙂 accents.';
		const r = narrowInventoryPayload(payload);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.package.description).toBe('A small language with é🙂 accents.');
		}
	});

	it('accepts a null description', () => {
		const payload = validPayload();
		payload.package.description = null;
		const r = narrowInventoryPayload(payload);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.package.description).toBeNull();
		}
	});
});

describe('narrowInventoryPayload — top-level rejections', () => {
	it('rejects non-object input', () => {
		const r = narrowInventoryPayload('hello');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('inventory_not_object');
	});

	it('rejects null', () => {
		const r = narrowInventoryPayload(null);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('inventory_not_object');
	});

	it('rejects an array', () => {
		const r = narrowInventoryPayload([]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('inventory_not_object');
	});

	it('rejects a missing `package` section', () => {
		const r = narrowInventoryPayload({ inventory: { groups: [] } });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('package_section_invalid');
	});

	it('rejects a missing `inventory` section', () => {
		const r = narrowInventoryPayload({
			package: validPayload().package
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('inventory_section_invalid');
	});
});

describe('narrowInventoryPayload — package field rejection', () => {
	it('rejects a non-URN identifier', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'identifier', 'just a name'));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('identifier_invalid');
	});

	it('rejects an empty identifier', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'identifier', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('identifier_invalid');
	});

	it('rejects a non-semver languageVersion', () => {
		const r = narrowInventoryPayload(
			withOverride(validPayload(), 'languageVersion', 'not-a-version')
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('language_version_invalid');
	});

	it('rejects an empty name', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'name', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('name_invalid');
	});

	it('rejects a non-string description', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'description', 42));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('description_invalid');
	});

	it('reports the path of the offending package field', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'name', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.path).toBe('package.name');
	});

	it('rejects an empty namespace', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'namespace', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('namespace_invalid');
			expect(r.error.path).toBe('package.namespace');
		}
	});

	it('rejects an empty languageName', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'languageName', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('language_name_invalid');
			expect(r.error.path).toBe('package.languageName');
		}
	});

	it('rejects an empty languageVersion (early-return path through narrowSemVerString)', () => {
		const r = narrowInventoryPayload(withOverride(validPayload(), 'languageVersion', ''));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('language_version_invalid');
	});
});

describe('narrowInventoryPayload — group rejection', () => {
	it('rejects an unknown group kind string', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].kind = 'semivowels';
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('group_kind_invalid');
	});

	it('rejects a custom group with an invalid slug', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups.push({ kind: { name: 'Not A Slug' }, roots: [] });
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('group_name_invalid');
	});

	it('rejects a group whose roots field is missing', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		delete broken.inventory.groups[0].roots;
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('roots_invalid');
	});

	it('rejects a group entry that is not a JSON object', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0] = 'not a group object';
		}, 'group_invalid');
	});

	it('rejects a custom group name longer than 32 chars', () => {
		expectRejection((broken) => {
			broken.inventory.groups.push({
				kind: { name: 'a'.repeat(33) },
				roots: []
			});
		}, 'group_name_invalid');
	});
});

describe('narrowInventoryPayload — inventory envelope rejection', () => {
	it('rejects inventory.groups that is not an array', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups = 'not an array';
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('groups_invalid');
			expect(r.error.path).toBe('inventory.groups');
		}
	});
});

describe('narrowInventoryPayload — root rejection', () => {
	it('rejects a root whose ipa is missing', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].ipa = '';
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('root_ipa_invalid');
	});

	it('rejects a root whose roman is missing', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].roman = '';
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('root_roman_invalid');
	});

	it('reports the path of the offending root', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[1].roots[0].ipa = 42;
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('root_ipa_invalid');
			expect(r.error.path).toBe('inventory.groups[1].roots[0].ipa');
		}
	});

	it('rejects a root entry that is not a JSON object', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0] = 42;
		}, 'root_invalid');
	});

	it('rejects a root whose allophones field is not an array', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0].allophones = 'not an array';
		}, 'allophones_invalid');
	});
});

describe('narrowInventoryPayload — allophone rejection', () => {
	it('accepts an allophone with inherited roman (null)', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].allophones.push({
			ipa: 'ɾ',
			roman: null,
			when: null
		});
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.inventory.groups[0].roots[0].allophones[0].roman).toBeNull();
		}
	});

	it('rejects an allophone with a non-string roman', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].allophones.push({
			ipa: 'ɾ',
			roman: 7 as unknown as string,
			when: null
		});
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('allophone_roman_invalid');
	});

	it('rejects an allophone with an empty ipa', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].allophones.push({
			ipa: '',
			roman: null,
			when: null
		});
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('allophone_ipa_invalid');
	});

	it('rejects an allophone entry that is not a JSON object', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0].allophones = ['not an allophone'];
		}, 'allophone_invalid');
	});

	it('rejects an allophone whose when condition is malformed', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0].allophones = [
				{
					ipa: 'ɾ',
					roman: null,
					when: { children: [{ kind: 'xor', left: 1, right: 2 }] }
				}
			];
		}, 'condition_invalid');
	});
});

describe('narrowInventoryPayload — condition tree rejection', () => {
	it('rejects an empty when block', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = { children: [] };
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('condition_invalid');
			expect(r.error.path).toBe('inventory.groups[0].roots[0].when.children');
		}
	});

	it.each([0, 1])('rejects a group with %i children', (childCount) => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'group',
					children: Array.from({ length: childCount }, () => ({
						kind: 'predicate' as const,
						predicate: { kind: 'word-position' as const, value: 'initial' as const }
					}))
				}
			]
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe('condition_invalid');
			expect(r.error.path).toBe('inventory.groups[0].roots[0].when.children[0].children');
		}
	});

	it('accepts a single-predicate when on a root', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'word-position', value: 'initial' }
				}
			]
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
	});

	it('accepts an `or` of two predicates', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'or',
					left: {
						kind: 'predicate',
						predicate: { kind: 'word-position', value: 'initial' }
					},
					right: {
						kind: 'predicate',
						predicate: { kind: 'word-position', value: 'final' }
					}
				}
			]
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
	});

	it('accepts a `group` of two predicates', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'group',
					children: [
						{
							kind: 'predicate',
							predicate: { kind: 'word-position', value: 'initial' }
						},
						{
							kind: 'predicate',
							predicate: { kind: 'previous-phoneme', ipa: 's' }
						}
					]
				}
			]
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
	});

	it('rejects an unknown predicate kind', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'between', value: 'a' }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('rejects an unknown condition node kind', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [{ kind: 'xor', left: 1, right: 2 }]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_invalid');
	});

	it('preserves IPA references exactly (H0303 + H0305)', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
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
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const when = r.value.inventory.groups[0].roots[0].when;
			expect(when).not.toBeNull();
			if (when) {
				const first = when.children[0];
				const second = when.children[1];
				expect(first.kind).toBe('predicate');
				expect(second.kind).toBe('predicate');
				if (first.kind === 'predicate' && second.kind === 'predicate') {
					expect(first.predicate).toEqual({
						kind: 'previous-phoneme',
						ipa: 'tʰ'
					});
					expect(second.predicate).toEqual({
						kind: 'next-phoneme',
						ipa: 'ŋ'
					});
				}
			}
		}
	});

	it('accepts a syllable-position predicate with every value', () => {
		for (const value of ['onset', 'nucleus', 'coda'] as const) {
			const p = validPayload();
			p.inventory.groups[0].roots[0].when = {
				children: [{ kind: 'predicate', predicate: { kind: 'syllable-position', value } }]
			};
			const r = narrowInventoryPayload(p);
			expect(r.ok).toBe(true);
		}
	});

	it('rejects an out-of-domain word-position value', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'word-position', value: 'middle' }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('rejects an out-of-domain syllable-position value', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'syllable-position', value: 'before' }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('rejects a previous-phoneme predicate with a missing ipa string', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'previous-phoneme' }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('rejects a next-phoneme predicate with a missing ipa string', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'next-phoneme', ipa: '' }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('rejects a non-object predicate', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [{ kind: 'predicate', predicate: 'not an object' }]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_predicate_invalid');
	});

	it('accepts an `or` whose left side is a nested `or`', () => {
		const p = validPayload();
		p.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'or',
					left: {
						kind: 'or',
						left: {
							kind: 'predicate',
							predicate: { kind: 'word-position', value: 'initial' }
						},
						right: {
							kind: 'predicate',
							predicate: { kind: 'word-position', value: 'medial' }
						}
					},
					right: {
						kind: 'predicate',
						predicate: { kind: 'word-position', value: 'final' }
					}
				}
			]
		};
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
	});

	it('rejects an `or` with a missing left', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [
				{
					kind: 'or',
					right: { kind: 'predicate', predicate: { kind: 'word-position', value: 'initial' } }
				}
			]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_invalid');
	});

	it('rejects a `group` with a missing children array', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = {
			children: [{ kind: 'group' }]
		};
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_invalid');
	});

	it('rejects a `when` block missing its `children` array', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = { not_children: [] };
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_invalid');
	});

	it('rejects a non-object `when` block', () => {
		const p = validPayload();
		const broken = JSON.parse(JSON.stringify(p));
		broken.inventory.groups[0].roots[0].when = 'not an object';
		const r = narrowInventoryPayload(broken);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe('condition_invalid');
	});

	it('rejects a `group` node whose child is not a valid condition node', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0].when = {
				children: [
					{
						kind: 'group',
						children: [
							{
								kind: 'predicate',
								predicate: { kind: 'word-position', value: 'initial' }
							},
							{ kind: 'xor', left: 1, right: 2 }
						]
					}
				]
			};
		}, 'condition_invalid');
	});

	it('rejects an `or` node whose right is not a valid condition node', () => {
		expectRejection((broken) => {
			broken.inventory.groups[0].roots[0].when = {
				children: [
					{
						kind: 'or',
						left: {
							kind: 'predicate',
							predicate: { kind: 'word-position', value: 'initial' }
						},
						right: { kind: 'xor', left: 1, right: 2 }
					}
				]
			};
		}, 'condition_invalid');
	});
});

describe('conditionPayloadToView', () => {
	it('converts a single predicate', () => {
		const view = conditionPayloadToView({
			children: [
				{
					kind: 'predicate',
					predicate: { kind: 'word-position', value: 'initial' }
				}
			]
		});
		expect(view).toEqual(whenView([predicateView({ kind: 'word-position', value: 'initial' })]));
	});

	it('converts a deeply nested tree without flattening', () => {
		const view = conditionPayloadToView({
			children: [
				{
					kind: 'group',
					children: [
						{
							kind: 'predicate',
							predicate: { kind: 'word-position', value: 'initial' }
						},
						{
							kind: 'or',
							left: {
								kind: 'predicate',
								predicate: { kind: 'previous-phoneme', ipa: 's' }
							},
							right: {
								kind: 'predicate',
								predicate: { kind: 'previous-phoneme', ipa: 'ʃ' }
							}
						}
					]
				}
			]
		});
		expect(view.children).toHaveLength(1);
		const outer = view.children[0];
		expect(outer.kind).toBe('group');
		if (outer.kind !== 'group') return;
		expect(outer.children).toHaveLength(2);
		// The Hub preserves the tree (no flattening): `or` is still
		// inside the group.
		expect(outer.children[1].kind).toBe('or');
		expect(view).toEqual(
			whenView([
				groupView([
					predicateView({ kind: 'word-position', value: 'initial' }),
					orView(
						predicateView({ kind: 'previous-phoneme', ipa: 's' }),
						predicateView({ kind: 'previous-phoneme', ipa: 'ʃ' })
					)
				])
			])
		);
	});
});

describe('narrowInventoryPayload — manifest-defined paths (H0301)', () => {
	it('accepts a phoneme resource at a non-default path', () => {
		// H0301: the Hub never hardcodes Linguistics/phonemes.eld;
		// any valid package-relative path that the SDK resolved
		// against the index is fine. This is a narrowing-test
		// sanity check that the narrow function does not encode
		// any assumption about the path.
		//
		// The narrow function doesn't see the path — that's on
		// `SdkValidateResult.phonemeResourcePath`, validated
		// upstream. Here we just confirm the inventory section is
		// path-agnostic.
		const p = validPayload();
		p.inventory.groups[0].roots[0].allophones.push({
			ipa: 'ɾ',
			roman: null,
			when: null
		});
		const r = narrowInventoryPayload(p);
		expect(r.ok).toBe(true);
	});
});
