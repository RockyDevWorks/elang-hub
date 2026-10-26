/**
 * Shared view-model fixtures for component tests.
 *
 * Each fixture is a minimal valid H03 view model the components can
 * render. The fixtures are deliberately small — component tests pin
 * the rendering contract, not the view layer's own transformations
 * (those are covered by their own tests under src/lib/view/).
 */

import type {
	AllophoneView,
	ConditionExpressionView,
	GroupView,
	PackageView,
	PhonemeInventoryView,
	RootView,
	WhenView
} from '$lib/view';
import { groupView, orView, predicateView, whenView } from '$lib/view';

export function fixturePackage(overrides: Partial<PackageView> = {}): PackageView {
	return Object.freeze({
		identifier: 'urn:elang:language:test:test:1.0.0',
		namespace: 'test',
		languageName: 'test',
		languageVersion: '1.0.0',
		name: 'Test Language',
		description: 'A minimal test language for component tests.',
		specVersions: Object.freeze({
			specVersion: '0.0.1-1',
			binaryContainerVersion: '0.1.0'
		}),
		...overrides
	});
}

export function fixtureAllophone(overrides: Partial<AllophoneView> = {}): AllophoneView {
	return Object.freeze({
		ipa: 'pʰ',
		roman: 'p',
		romanKind: Object.freeze({ kind: 'explicit' as const, text: 'p' }),
		when: null,
		...overrides
	});
}

export function fixtureRoot(overrides: Partial<RootView> = {}): RootView {
	return Object.freeze({
		ipa: 'p',
		roman: 'p',
		when: null,
		allophones: Object.freeze([]),
		...overrides
	});
}

export function fixtureGroup(overrides: Partial<GroupView> = {}): GroupView {
	return Object.freeze({
		kind: 'consonants',
		displayName: 'consonants',
		roots: Object.freeze([]),
		...overrides
	});
}

export function fixtureInventory(
	overrides: Partial<PhonemeInventoryView> = {}
): PhonemeInventoryView {
	return Object.freeze({
		groups: Object.freeze([]),
		rootCount: 0,
		allophoneCount: 0,
		isEmpty: true,
		...overrides
	});
}

/**
 * A `when` block with one word-position child. Used by ConditionTree
 * tests to verify the leaf rendering path.
 */
export function fixtureSimpleWhen(): WhenView {
	const child: ConditionExpressionView = predicateView({
		kind: 'word-position',
		value: 'initial'
	});
	return whenView([child]);
}

/**
 * A `when` block with an `or` of two leaf predicates. Used by
 * ConditionTree tests to verify the binary-or flattening path.
 */
export function fixtureOrWhen(): WhenView {
	const left: ConditionExpressionView = predicateView({
		kind: 'previous-phoneme',
		ipa: 's'
	});
	const right: ConditionExpressionView = predicateView({
		kind: 'next-phoneme',
		ipa: 't'
	});
	const orExpr: ConditionExpressionView = orView(left, right);
	return whenView([orExpr]);
}

/**
 * A `when` block with a `group` (AND) of two leaf predicates. Used by
 * ConditionTree tests to verify the AND group path.
 */
export function fixtureGroupWhen(): WhenView {
	const left: ConditionExpressionView = predicateView({
		kind: 'word-position',
		value: 'medial'
	});
	const right: ConditionExpressionView = predicateView({
		kind: 'syllable-position',
		value: 'nucleus'
	});
	const groupExpr: ConditionExpressionView = groupView([left, right]);
	return whenView([groupExpr]);
}

/**
 * A `when` block with two leaf predicates of different kinds. The
 * left child uses `previous-phoneme` (a phoneme-targeted predicate
 * rendered with `lang="und-fonipa"`); the right child uses
 * `word-position` (a value-targeted predicate). The mix exercises
 * BOTH branches of the predicate-kind discriminator in
 * ConditionTree.svelte so neither is left uncovered.
 */
export function fixtureMultiPredicateWhen(): WhenView {
	const left: ConditionExpressionView = predicateView({
		kind: 'previous-phoneme',
		ipa: 's'
	});
	const middle: ConditionExpressionView = predicateView({
		kind: 'next-phoneme',
		ipa: 't'
	});
	const right: ConditionExpressionView = predicateView({
		kind: 'word-position',
		value: 'final'
	});
	// Three predicates: previous-phoneme, next-phoneme, and
	// word-position. Together they exercise BOTH operands of the
	// `kind === 'previous-phoneme' || kind === 'next-phoneme'`
	// discriminator: left short-circuits on the first operand,
	// middle satisfies the second operand, right is the fallback
	// value-target branch.
	return whenView([left, middle, right]);
}
