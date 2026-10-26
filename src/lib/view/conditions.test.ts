/**
 * Tests for the condition view models (H0305).
 *
 * The conditions module mirrors the validated ELD `when` AST. These
 * tests pin the structural invariants:
 *
 *   - `predicate` is a leaf.
 *   - `group` is AND of ≥ 2 children.
 *   - `or` is binary OR of exactly 2 children.
 *   - `when` is implicit AND of ≥ 1 child.
 *
 * The Hub never flattens `or` or `group` nodes — the UI uses the
 * structured tree to render nested forms when the user expands a
 * row.
 */

import { describe, expect, it } from 'vitest';
import { groupView, orView, predicateView, renderPredicate, whenView } from './conditions';

describe('renderPredicate', () => {
	it('formats a word-position predicate', () => {
		expect(renderPredicate({ kind: 'word-position', value: 'initial' })).toBe(
			'word-position: initial'
		);
	});

	it('formats a syllable-position predicate', () => {
		expect(renderPredicate({ kind: 'syllable-position', value: 'nucleus' })).toBe(
			'syllable-position: nucleus'
		);
	});

	it('preserves IPA bytes exactly in cross-phoneme predicates', () => {
		// H0303: the Hub MUST NOT re-normalize IPA. The display text
		// must contain the exact string the SDK sent.
		expect(renderPredicate({ kind: 'previous-phoneme', ipa: 'aɪ' })).toBe('previous-phoneme: aɪ');
		expect(renderPredicate({ kind: 'next-phoneme', ipa: 'tʰ' })).toBe('next-phoneme: tʰ');
		// Even an unusual (but valid) IPA identifier — the SDK has
		// already validated it against the pinned repertoire.
		expect(renderPredicate({ kind: 'previous-phoneme', ipa: 'ŋ' })).toBe('previous-phoneme: ŋ');
	});
});

describe('predicateView', () => {
	it('builds a frozen predicate view with display text', () => {
		const v = predicateView({ kind: 'word-position', value: 'initial' });
		expect(v.kind).toBe('predicate');
		if (v.kind === 'predicate') {
			expect(v.predicate).toEqual({ kind: 'word-position', value: 'initial' });
			expect(v.displayText).toBe('word-position: initial');
		}
		expect(Object.isFrozen(v)).toBe(true);
	});
});

describe('groupView', () => {
	it('ANDs ≥ 2 children', () => {
		const v = groupView([
			predicateView({ kind: 'word-position', value: 'initial' }),
			predicateView({ kind: 'previous-phoneme', ipa: 'a' })
		]);
		expect(v.kind).toBe('group');
		if (v.kind !== 'group') return;
		expect(v.children).toHaveLength(2);
		expect(v.displayText).toBe('(word-position: initial AND previous-phoneme: a)');
		expect(Object.isFrozen(v)).toBe(true);
		expect(Object.isFrozen(v.children)).toBe(true);
	});

	it('rejects a group with fewer than 2 children', () => {
		expect(() => groupView([predicateView({ kind: 'word-position', value: 'initial' })])).toThrow(
			/at least 2 children/
		);
	});

	it('preserves declaration order of children', () => {
		const v = groupView([
			predicateView({ kind: 'word-position', value: 'final' }),
			predicateView({ kind: 'word-position', value: 'initial' })
		]);
		expect(v.kind).toBe('group');
		if (v.kind !== 'group') return;
		const first = v.children[0];
		const second = v.children[1];
		expect(first.kind).toBe('predicate');
		expect(second.kind).toBe('predicate');
	});
});

describe('orView', () => {
	it('ORs exactly two children', () => {
		const v = orView(
			predicateView({ kind: 'word-position', value: 'initial' }),
			predicateView({ kind: 'word-position', value: 'final' })
		);
		expect(v.kind).toBe('or');
		if (v.kind === 'or') {
			expect(v.displayText).toBe('(word-position: initial OR word-position: final)');
		}
		expect(Object.isFrozen(v)).toBe(true);
	});

	it('preserves the binary-OR tree (no flattening)', () => {
		const inner = orView(
			predicateView({ kind: 'word-position', value: 'initial' }),
			predicateView({ kind: 'word-position', value: 'final' })
		);
		const outer = orView(inner, predicateView({ kind: 'previous-phoneme', ipa: 'a' }));
		if (outer.kind === 'or') {
			expect(outer.left.kind).toBe('or');
			expect(outer.right.kind).toBe('predicate');
		}
	});
});

describe('whenView', () => {
	it('implicit-ANDs ≥ 1 child', () => {
		const v = whenView([predicateView({ kind: 'word-position', value: 'medial' })]);
		expect(v.children).toHaveLength(1);
		expect(v.displayText).toBe('word-position: medial');
		expect(Object.isFrozen(v)).toBe(true);
	});

	it('rejects an empty when', () => {
		expect(() => whenView([])).toThrow(/at least 1 child/);
	});

	it('handles a deeply nested when', () => {
		const v = whenView([
			groupView([
				predicateView({ kind: 'word-position', value: 'initial' }),
				predicateView({ kind: 'previous-phoneme', ipa: 's' })
			]),
			orView(
				predicateView({ kind: 'syllable-position', value: 'onset' }),
				predicateView({ kind: 'syllable-position', value: 'coda' })
			)
		]);
		expect(v.children).toHaveLength(2);
		expect(v.displayText).toBe(
			'(word-position: initial AND previous-phoneme: s) AND (syllable-position: onset OR syllable-position: coda)'
		);
	});
});
