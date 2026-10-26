/**
 * Condition view models (H0305).
 *
 * The `when` block from an ELD root or allophone is a tree of atomic
 * predicates combined with AND (`group`) and OR (`or`) operators. The
 * Hub never edits a condition — it only displays it.
 *
 * The view layer mirrors the validated AST 1:1 (no flattening of
 * `or`/`group` nodes) so the renderer can show the original structure.
 * Each node additionally carries a `displayText` for the most common
 * "show as a single string" use case.
 *
 * The Hub NEVER re-parses a condition; the SDK has done that. The view
 * only formats.
 */

/** A validated word-position predicate value (steering §8). */
export type WordPosition = 'initial' | 'medial' | 'final';

/** A validated syllable-position predicate value (steering §8). */
export type SyllablePosition = 'onset' | 'nucleus' | 'coda';

/**
 * A leaf predicate: one of the four atomic conditions the SDK accepts.
 * IPA references (`previous-phoneme`, `next-phoneme`) are stored
 * byte-exactly as the SDK sent them — the Hub MUST NOT re-normalize.
 */
export type ConditionPredicate =
	| { readonly kind: 'word-position'; readonly value: WordPosition }
	| { readonly kind: 'syllable-position'; readonly value: SyllablePosition }
	| { readonly kind: 'previous-phoneme'; readonly ipa: string }
	| { readonly kind: 'next-phoneme'; readonly ipa: string };

/**
 * The structured condition tree. Mirrors the validated Rust AST:
 *
 *   - `predicate` — a leaf.
 *   - `group` — AND of ≥ 2 children. The view preserves the
 *     declaration order of children.
 *   - `or` — binary OR of exactly 2 children.
 */
export type ConditionExpressionView =
	| {
			readonly kind: 'predicate';
			readonly predicate: ConditionPredicate;
			readonly displayText: string;
	  }
	| {
			readonly kind: 'group';
			readonly children: readonly ConditionExpressionView[];
			readonly displayText: string;
	  }
	| {
			readonly kind: 'or';
			readonly left: ConditionExpressionView;
			readonly right: ConditionExpressionView;
			readonly displayText: string;
	  };

/**
 * The top-level `when` block: an implicit AND of ≥ 1 direct child
 * (steering §8 / REQ-WHEN-002). An explicit empty `when {}` is invalid
 * upstream, so the view never receives one.
 */
export interface WhenView {
	readonly children: readonly ConditionExpressionView[];
	readonly displayText: string;
}

/**
 * Upper bound on the rendered length of any `displayText`. Defence in
 * depth against a hostile SDK that somehow made it through validation:
 * the Hub truncates with an ellipsis instead of rendering arbitrary
 * control characters.
 */
const MAX_DISPLAY_TEXT = 200;

function bounded(text: string): string {
	if (text.length <= MAX_DISPLAY_TEXT) return text;
	return text.slice(0, MAX_DISPLAY_TEXT - 1) + '…';
}

/**
 * Render a single predicate as a short, user-readable string.
 *
 * The strings are bounded (no host Unicode re-casing, no normalisation)
 * and round-trippable from the SDK payload: the same predicate sent by
 * the SDK renders identically on every client.
 */
export function renderPredicate(p: ConditionPredicate): string {
	switch (p.kind) {
		case 'word-position':
			return `word-position: ${p.value}`;
		case 'syllable-position':
			return `syllable-position: ${p.value}`;
		case 'previous-phoneme':
			return `previous-phoneme: ${p.ipa}`;
		case 'next-phoneme':
			return `next-phoneme: ${p.ipa}`;
	}
}

/**
 * Build a `ConditionExpressionView` from a `ConditionPredicate`. The
 * view is frozen; the predicate it wraps is the same string the SDK
 * emitted (no transformation).
 */
export function predicateView(p: ConditionPredicate): ConditionExpressionView {
	return Object.freeze({
		kind: 'predicate' as const,
		predicate: p,
		displayText: bounded(renderPredicate(p))
	});
}

/**
 * Build a `group` expression view (AND of children, ≥ 2). The view
 * layer enforces the same arity rule as the Rust model so a malformed
 * payload is still caught here.
 */
export function groupView(children: readonly ConditionExpressionView[]): ConditionExpressionView {
	if (children.length < 2) {
		// The SDK should never emit a malformed `group`; if it does,
		// we still refuse to construct an invalid view. Throwing keeps
		// the bug visible to tests instead of letting the UI render
		// semantically-wrong "and of one predicate" text.
		throw new Error('condition group requires at least 2 children');
	}
	const display = bounded(`(${children.map((c) => c.displayText).join(' AND ')})`);
	return Object.freeze({
		kind: 'group' as const,
		children: Object.freeze([...children]),
		displayText: display
	});
}

/** Build a binary `or` expression view. */
export function orView(
	left: ConditionExpressionView,
	right: ConditionExpressionView
): ConditionExpressionView {
	const display = bounded(`(${left.displayText} OR ${right.displayText})`);
	return Object.freeze({
		kind: 'or' as const,
		left,
		right,
		displayText: display
	});
}

/** Build the top-level `when` view (implicit AND of children, ≥ 1). */
export function whenView(children: readonly ConditionExpressionView[]): WhenView {
	if (children.length < 1) {
		throw new Error('when block requires at least 1 child');
	}
	const display = bounded(children.map((c) => c.displayText).join(' AND '));
	return Object.freeze({
		children: Object.freeze([...children]),
		displayText: display
	});
}
