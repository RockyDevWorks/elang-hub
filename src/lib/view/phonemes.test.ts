/**
 * Tests for the phoneme inventory view model (H0303, H0304, H0307).
 *
 * The view model takes a narrow InventoryPayload and produces a
 * read-only `PhonemeInventoryView` with deterministic ordering. These
 * tests pin:
 *
 *   - canonical group ordering (consonants → vowels → custom ASCII)
 *   - IPA code-point ordering for roots and allophones
 *   - byte-exact IPA preservation
 *   - empty-inventory handling (H0307 distinct from error)
 *   - allophone romanization inheritance
 */

import { describe, expect, it } from 'vitest';
import { buildPhonemeInventoryView } from './phonemes';
import type { GroupPayload, InventoryBodyPayload, RootPayload } from './inventory';

function body(groups: GroupPayload[]): InventoryBodyPayload {
	return { groups };
}

describe('buildPhonemeInventoryView — ordering (H0307)', () => {
	it('orders consonants before vowels before custom', () => {
		const view = buildPhonemeInventoryView(
			body([
				{ kind: { name: 'fricatives' }, roots: [] },
				{ kind: 'vowels', roots: [] },
				{ kind: 'consonants', roots: [] }
			])
		);
		expect(view.groups.map((g) => g.displayName)).toEqual(['consonants', 'vowels', 'fricatives']);
	});

	it('orders custom groups by name in bytewise order', () => {
		const view = buildPhonemeInventoryView(
			body([
				{ kind: { name: 'diphthongs' }, roots: [] },
				{ kind: { name: 'affricates' }, roots: [] },
				{ kind: { name: 'fricatives' }, roots: [] }
			])
		);
		expect(view.groups.map((g) => g.displayName)).toEqual([
			'affricates',
			'diphthongs',
			'fricatives'
		]);
	});

	it('orders roots by IPA code points', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [root('t', 't'), root('a', 'a'), root('ɲ', 'ny'), root('p', 'p')]
				}
			])
		);
		const cons = view.groups[0];
		expect(cons.roots.map((r) => r.ipa)).toEqual(['a', 'p', 't', 'ɲ']);
	});

	it('orders allophones by IPA code points', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						{
							ipa: 't',
							roman: 't',
							when: null,
							allophones: [
								{ ipa: 'tʰ', roman: null, when: null },
								{ ipa: 'ɾ', roman: null, when: null },
								{ ipa: 't', roman: null, when: null }
							]
						}
					]
				}
			])
		);
		const allos = view.groups[0].roots[0].allophones;
		expect(allos.map((a) => a.ipa)).toEqual(['t', 'tʰ', 'ɾ']);
	});

	it('orders supplementary-plane IPA correctly (U+1F600 etc.)', () => {
		// (Not realistic IPA, but pins that the comparator handles
		// supplementary-plane characters.)
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [root('😀', 'emoji'), root('a', 'a')]
				}
			])
		);
		const cons = view.groups[0];
		// 'a' (U+0061) < '😀' (U+1F600)
		expect(cons.roots.map((r) => r.ipa)).toEqual(['a', '😀']);
	});
});

describe('buildPhonemeInventoryView — counts and empty state (H0307)', () => {
	it('reports root and allophone counts across groups', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						{
							ipa: 'p',
							roman: 'p',
							when: null,
							allophones: [
								{ ipa: 'pʰ', roman: null, when: null },
								{ ipa: 'b', roman: null, when: null }
							]
						},
						root('t', 't')
					]
				},
				{
					kind: 'vowels',
					roots: [root('a', 'a')]
				}
			])
		);
		expect(view.rootCount).toBe(3);
		expect(view.allophoneCount).toBe(2);
		expect(view.isEmpty).toBe(false);
	});

	it('treats zero groups as a valid empty inventory, NOT an error', () => {
		const view = buildPhonemeInventoryView(body([]));
		expect(view.isEmpty).toBe(true);
		expect(view.rootCount).toBe(0);
		expect(view.allophoneCount).toBe(0);
		expect(view.groups).toEqual([]);
	});

	it('returns a frozen view (read-only invariant)', () => {
		const view = buildPhonemeInventoryView(body([]));
		expect(Object.isFrozen(view)).toBe(true);
		expect(Object.isFrozen(view.groups)).toBe(true);
	});
});

describe('buildPhonemeInventoryView — IPA preservation (H0303)', () => {
	it('preserves combining-mark IPA byte-exactly', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						// Precomposed 'é' (U+00E9) vs decomposed 'e' + U+0301.
						// The Hub must keep the exact string the SDK sent.
						root('é', 'e'),
						root('e\u0301', 'e')
					]
				}
			])
		);
		const ipas = view.groups[0].roots.map((r) => r.ipa);
		// Precomposed sorts before decomposed at the codepoint level
		// because U+00E9 < U+0065+combining? Actually U+00E9 > U+0065
		// (0xE9 > 0x65), so precomposed comes after 'e' — but we
		// have no bare 'e' here. What matters is that the two
		// representations are distinct (H0303).
		expect(ipas).toContain('é');
		expect(ipas).toContain('e\u0301');
		// The narrow function and the view never collapse them.
		expect(ipas[0] !== ipas[1]).toBe(true);
	});

	it('preserves case in romanization (C-16)', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [root('ŋ', 'NG')]
				}
			])
		);
		expect(view.groups[0].roots[0].roman).toBe('NG');
	});
});

describe('buildPhonemeInventoryView — allophone romanization (H0306)', () => {
	it('inherits parent romanization when allophone has null', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						{
							ipa: 't',
							roman: 't',
							when: null,
							allophones: [{ ipa: 'ɾ', roman: null, when: null }]
						}
					]
				}
			])
		);
		const allo = view.groups[0].roots[0].allophones[0];
		expect(allo.roman).toBe('t');
		expect(allo.romanKind).toEqual({ kind: 'inherited' });
	});

	it('uses explicit allophone roman when present', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						{
							ipa: 't',
							roman: 't',
							when: null,
							allophones: [{ ipa: 'tʰ', roman: 'th', when: null }]
						}
					]
				}
			])
		);
		const allo = view.groups[0].roots[0].allophones[0];
		expect(allo.roman).toBe('th');
		expect(allo.romanKind).toEqual({ kind: 'explicit', text: 'th' });
	});

	it('preserves case in inherited romanizations', () => {
		const view = buildPhonemeInventoryView(
			body([
				{
					kind: 'consonants',
					roots: [
						{
							ipa: 't',
							roman: 'T',
							when: null,
							allophones: [{ ipa: 'ɾ', roman: null, when: null }]
						}
					]
				}
			])
		);
		const allo = view.groups[0].roots[0].allophones[0];
		// C-16: inheritance preserves case exactly.
		expect(allo.roman).toBe('T');
	});
});

function root(ipa: string, roman: string): RootPayload {
	return { ipa, roman, when: null, allophones: [] };
}
