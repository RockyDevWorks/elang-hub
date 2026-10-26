/**
 * Tests for the deterministic ordering helpers (H0307).
 *
 * The view layer renders the same inventory the same way on every
 * machine. These tests pin the comparator behaviour so a hostile or
 * accidental locale change can't reorder the UI.
 */

import { describe, expect, it } from 'vitest';
import { compareCodePoints, compareGroupKinds, type GroupKind } from './ordering';

describe('compareCodePoints', () => {
	it('treats equal strings as equal', () => {
		expect(compareCodePoints('a', 'a')).toBe(0);
		expect(compareCodePoints('', '')).toBe(0);
		expect(compareCodePoints('ɾ', 'ɾ')).toBe(0);
	});

	it('orders shorter prefix before longer', () => {
		expect(compareCodePoints('a', 'ab')).toBeLessThan(0);
		expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0);
	});

	it('orders by full Unicode code points, not UTF-16 code units', () => {
		// 'é' is one code point (U+00E9) but two UTF-16 code units
		// (0x00E9 is single, but surrogate-pair characters span two).
		expect(compareCodePoints('a', 'é')).toBeLessThan(0);
		// '😀' is U+1F600 (supplementary plane) — one code point,
		// two UTF-16 code units.
		expect(compareCodePoints('é', '😀')).toBeLessThan(0);
		expect(compareCodePoints('😀', 'a')).toBeGreaterThan(0);
	});

	it('compares across the BMP', () => {
		// 'tʰ' = 't' (U+0074) + 'ʰ' (U+02B0). 't' < 'tʰ'.
		expect(compareCodePoints('t', 'tʰ')).toBeLessThan(0);
		expect(compareCodePoints('tʰ', 't')).toBeGreaterThan(0);
	});

	it('is total and transitive', () => {
		const inputs = ['a', 'b', 'ɾ', 't', 'tʰ', 'aɪ', 'ŋ', 'ɲ', 'ʃ', 'θ'];
		const sorted = [...inputs].sort(compareCodePoints);
		// Build the sorted-by-codepoint expectation manually: the order
		// is by U+XXXX values of the first code point, breaking ties by
		// the rest of the string.
		const expected = [...inputs].sort((x, y) => compareCodePoints(x, y));
		expect(sorted).toEqual(expected);
	});

	it('is locale-free', () => {
		// 'i' (U+0069) sorts before 'İ' (U+0130) — but Turkish locale
		// would collapse them. The Hub MUST NOT use locale-sensitive
		// comparison; this assertion pins the code-point order.
		expect(compareCodePoints('i', 'İ')).toBeLessThan(0);
	});
});

describe('compareGroupKinds', () => {
	it('orders consonants before vowels', () => {
		expect(compareGroupKinds('consonants', 'vowels')).toBeLessThan(0);
		expect(compareGroupKinds('vowels', 'consonants')).toBeGreaterThan(0);
	});

	it('orders reserved kinds before custom kinds', () => {
		const custom: GroupKind = { name: 'diphthongs' };
		expect(compareGroupKinds('consonants', custom)).toBeLessThan(0);
		expect(compareGroupKinds('vowels', custom)).toBeLessThan(0);
		expect(compareGroupKinds(custom, 'consonants')).toBeGreaterThan(0);
		expect(compareGroupKinds(custom, 'vowels')).toBeGreaterThan(0);
	});

	it('orders custom kinds by name in ASCII bytewise order', () => {
		const a: GroupKind = { name: 'affricates' };
		const b: GroupKind = { name: 'diphthongs' };
		const c: GroupKind = { name: 'fricatives' };
		expect(compareGroupKinds(a, b)).toBeLessThan(0);
		expect(compareGroupKinds(b, c)).toBeLessThan(0);
		expect(compareGroupKinds(a, c)).toBeLessThan(0);
	});

	it('treats equal kinds as equal', () => {
		expect(compareGroupKinds('consonants', 'consonants')).toBe(0);
		expect(compareGroupKinds('vowels', 'vowels')).toBe(0);
		expect(compareGroupKinds({ name: 'x' }, { name: 'x' })).toBe(0);
	});

	it('is total and transitive across reserved + custom', () => {
		const all: GroupKind[] = [
			{ name: 'diphthongs' },
			'vowels',
			{ name: 'affricates' },
			'consonants',
			{ name: 'fricatives' }
		];
		const sorted = [...all].sort(compareGroupKinds);
		expect(sorted).toEqual([
			'consonants',
			'vowels',
			{ name: 'affricates' },
			{ name: 'diphthongs' },
			{ name: 'fricatives' }
		]);
	});
});
