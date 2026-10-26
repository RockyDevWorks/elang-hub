/**
 * Deterministic ordering for phoneme view models (H0307).
 *
 * The Hub renders the same inventory the same way on every machine and
 * on every render. Two consequences:
 *
 *   1. Every comparator here is total, transitive, and locale-free.
 *   2. The order matches what the SDK's canonical ELD serialization
 *      would produce — groups first in canonical order, then roots and
 *      allophones by IPA code points, then custom-group names by
 *      ASCII byte order.
 *
 * NEVER use `String.prototype.localeCompare` (locale-sensitive) or the
 * default `<` on strings (UTF-16 code-unit order, which puts surrogate
 * halves out of order).
 */

/**
 * A total, locale-free code-point comparator for arbitrary strings.
 *
 * Compares two strings by their sequence of Unicode code points (full
 * code points, so supplementary-plane characters count as one). Shorter
 * strings sort before their longer prefixes. This matches UTF-8
 * bytewise sort for valid Unicode — the same order elang-rs uses for
 * canonical ELD serialization.
 *
 * @returns negative if `a < b`, positive if `a > b`, zero if equal.
 */
export function compareCodePoints(a: string, b: string): number {
	if (a === b) return 0;
	// String iterator yields code points (handles surrogate pairs).
	const ai = a[Symbol.iterator]();
	const bi = b[Symbol.iterator]();
	while (true) {
		const an = ai.next();
		const bn = bi.next();
		if (an.done && bn.done) return 0;
		if (an.done) return -1;
		if (bn.done) return 1;
		const ac = an.value.codePointAt(0);
		const bc = bn.value.codePointAt(0);
		// `codePointAt` on a code point returned by the iterator is
		// always defined — the iterator only yields complete code points.
		// The `?? 0` is a TypeScript-only belt-and-braces.
		const diff = (ac ?? 0) - (bc ?? 0);
		if (diff !== 0) return diff;
	}
}

export type GroupKind = 'consonants' | 'vowels' | { readonly name: string };

/**
 * Group canonical order (H0307).
 *
 * The two reserved group kinds (`consonants`, `vowels`) are pinned to
 * positions 0 and 1; every other kind (a custom group) sorts by name in
 * ASCII bytewise order. Custom group names are constrained to
 * `[a-z0-9-]` by the EPF schema, so bytewise and code-point order
 * coincide — but we use bytewise anyway because that is the contract.
 */
export function compareGroupKinds(a: GroupKind, b: GroupKind): number {
	if (a === 'consonants' && b === 'consonants') return 0;
	if (a === 'vowels' && b === 'vowels') return 0;
	if (a === 'consonants') return -1;
	if (a === 'vowels') {
		if (b === 'consonants') return 1;
		return -1; // b is custom
	}
	if (b === 'consonants') return 1;
	if (b === 'vowels') return 1;
	// Both are custom groups: bytewise order on the validated name.
	const an = a.name;
	const bn = b.name;
	if (an < bn) return -1;
	if (an > bn) return 1;
	return 0;
}
