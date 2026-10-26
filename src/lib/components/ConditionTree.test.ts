/**
 * Component tests for `ConditionTree.svelte`.
 *
 * Pins the recursive condition-tree renderer (H0405): leaf
 * predicates render as plain text, `group` (AND) renders with a
 * leading `(` and trailing `)`, and `or` (binary) renders the two
 * sides separated by `OR`. IPA references inside the tree carry
 * `lang="und-fonipa"` so screen readers know it is phonetics.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { predicateView, whenView } from '$lib/view';
import ConditionTree from './ConditionTree.svelte';
import {
	fixtureGroupWhen,
	fixtureMultiPredicateWhen,
	fixtureOrWhen,
	fixtureSimpleWhen
} from './test-fixtures';

describe('ConditionTree', () => {
	it('renders a single word-position predicate inline', () => {
		const { container } = render(ConditionTree, { props: { when: fixtureSimpleWhen() } });
		expect(container.textContent).toContain('word-position: initial');
	});

	it('renders a previous-phoneme predicate with the IPA reference preserved', () => {
		const { container } = render(ConditionTree, { props: { when: fixtureOrWhen() } });
		expect(container.textContent).toContain('previous-phoneme: s');
		expect(container.textContent).toContain('next-phoneme: t');
		// The two predicates are joined by OR; the binary `or`
		// expression renders with `(` and `)`.
		expect(container.textContent).toContain('OR');
		expect(container.textContent).toContain('(');
		expect(container.textContent).toContain(')');
	});

	it('renders a `group` (AND) expression with both predicates present', () => {
		const { container } = render(ConditionTree, { props: { when: fixtureGroupWhen() } });
		expect(container.textContent).toContain('word-position: medial');
		expect(container.textContent).toContain('syllable-position: nucleus');
		expect(container.textContent).toContain(' AND ');
		expect(container.textContent).toContain('(');
		expect(container.textContent).toContain(')');
	});

	it('preserves multi-symbol IPA byte-exactly (no Unicode transform) in predicate references', () => {
		// previous-phoneme with a multi-symbol IPA — the renderer
		// must not normalise, fold, or surrogate-split it.
		const when = {
			children: [
				{
					kind: 'predicate' as const,
					predicate: { kind: 'previous-phoneme' as const, ipa: 't͡ʃ' },
					displayText: 'previous-phoneme: t͡ʃ'
				}
			],
			displayText: 'previous-phoneme: t͡ʃ'
		};
		const { container } = render(ConditionTree, { props: { when } });
		expect(container.textContent).toContain('t͡ʃ');
	});

	it('renders the rich child list when the when block has multiple predicate children', () => {
		// With > 1 child, the component renders one <li> per child
		// with the `span.predicate` markup (not just the summary).
		// The fixture mixes a phoneme-targeted predicate
		// (`previous-phoneme`) with a value-targeted predicate
		// (`word-position`); together they pin BOTH branches of
		// the predicate-kind discriminator.
		const { container } = render(ConditionTree, {
			props: { when: fixtureMultiPredicateWhen() }
		});
		const items = container.querySelectorAll('li');
		expect(items.length).toBe(3);
		const predicates = container.querySelectorAll('span.predicate');
		expect(predicates.length).toBe(3);
		expect(container.textContent).toContain('previous-phoneme: s');
		expect(container.textContent).toContain('next-phoneme: t');
		expect(container.textContent).toContain('word-position: final');
	});

	it('marks IPA references inside predicate children with lang="und-fonipa"', () => {
		// Build a `when` block with one previous-phoneme
		// predicate + one word-position predicate so the rich
		// child list is rendered.
		const previousPhoneme = predicateView({
			kind: 'previous-phoneme',
			ipa: 's'
		});
		const wordPosition = predicateView({
			kind: 'word-position',
			value: 'initial'
		});
		const when = whenView([previousPhoneme, wordPosition]);
		const { container } = render(ConditionTree, { props: { when } });
		const ipaSpans = container.querySelectorAll('span.ipa[lang="und-fonipa"]');
		expect(ipaSpans.length).toBeGreaterThan(0);
		expect(container.textContent).toContain('previous-phoneme: s');
	});
});
