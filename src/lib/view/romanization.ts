/**
 * Romanization view models (H0306).
 *
 * An allophone's romanization in ELD is *optional*: when the `roman`
 * child is absent the allophone inherits the parent root's exact-case
 * romanization (C-16). The Hub must not collapse those two cases into
 * a single "no roman" string — the user needs to see the difference
 * because an inherited romanization is still a romanization the
 * language defines, just inherited rather than explicit.
 *
 * Roots always carry an explicit romanization (REQ-ELD); only
 * allophones can omit it.
 */

/**
 * The three valid romanization states for an allophone.
 *
 *   - `explicit`: the allophone has its own `roman` field.
 *   - `inherited`: the allophone omits `roman`; the parent root's
 *     romanization applies.
 *   - `absent`: reserved for languages that disable romanization
 *     altogether (not part of v0.1.0 — every allophone is either
 *     `explicit` or `inherited`). Kept for forward-compatibility so
 *     later ELANG versions can introduce a roman-free mode without a
 *     view-layer churn.
 */
export type AllophoneRoman =
	| { readonly kind: 'explicit'; readonly text: string }
	| { readonly kind: 'inherited' }
	| { readonly kind: 'absent' };

/**
 * Distinguish a bare absent roman (inherited) from a declared absent
 * roman (none of these exist in v0.1.0, but reserved for future).
 *
 * The Hub MUST use this function on every allophone — never store the
 * raw `string | null` from the SDK. The point of H0306 is that the UI
 * has a deliberate answer to "what does the user see when this
 * allophone has no roman field?".
 */
export function classifyAllophoneRoman(roman: string | null): AllophoneRoman {
	if (roman === null) return Object.freeze({ kind: 'inherited' });
	if (roman === '') return Object.freeze({ kind: 'absent' });
	return Object.freeze({ kind: 'explicit', text: roman });
}

/**
 * The single, user-readable form of an allophone romanization. Returns
 * the explicit text for `explicit`, the parent's roman for
 * `inherited`, and a deliberate dash for `absent`.
 *
 * `parentRoman` is required for the `inherited` case — the SDK cannot
 * resolve inheritance on its own (the JSON payload only carries the
 * parent's view-model romanization, not a back-reference).
 */
export function displayAllophoneRoman(state: AllophoneRoman, parentRoman: string): string {
	switch (state.kind) {
		case 'explicit':
			return state.text;
		case 'inherited':
			return parentRoman;
		case 'absent':
			return '—';
	}
}
