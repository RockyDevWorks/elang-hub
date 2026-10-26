/**
 * Phoneme inventory view models (H0303, H0304).
 *
 * The view layer maps the validated phoneme inventory onto UI-ready
 * shapes:
 *
 *   - IPA strings are copied byte-exactly from the SDK. The Hub does
 *     NOT apply NFC/NFD normalization, case folding or any other host
 *     Unicode transform (H0303).
 *   - Groups are sorted in canonical order (`consonants`, `vowels`,
 *     then custom groups by name). Roots and allophones are sorted
 *     by IPA code points (H0307).
 *   - The view preserves the validated structure of allophones and
 *     conditions (H0305) — the Hub never flattens or re-derives.
 *   - The view never invents a classification the SDK didn't emit
 *     (H0304) — a root with no classifier is just a root with no
 *     classifier.
 */

import type {
	AllophonePayload,
	GroupPayload,
	InventoryBodyPayload,
	RootPayload
} from './inventory';
import type { AllophoneRoman } from './romanization';
import { classifyAllophoneRoman, displayAllophoneRoman } from './romanization';
import type { WhenView } from './conditions';
import { conditionPayloadToView } from './inventory';
import type { GroupKind } from './ordering';
import { compareCodePoints, compareGroupKinds } from './ordering';

/**
 * One validated allophone as the UI sees it.
 *
 * `roman` is the resolved romanization: when the SDK reported an
 * explicit `roman` for this allophone, the view carries that exact
 * string; when the SDK reported `null`, the view carries the parent's
 * romanization but flagged `inheritedFromParent: true` so the renderer
 * can choose a deliberate "inherited" presentation.
 */
export interface AllophoneView {
	/** Byte-exact IPA identifier, preserved from the SDK. */
	readonly ipa: string;
	/**
	 * The romanization the UI should display. Always non-null because
	 * the view resolves inheritance against the parent root's roman.
	 */
	readonly roman: string;
	/** The original classification: explicit / inherited / absent. */
	readonly romanKind: AllophoneRoman;
	readonly when: WhenView | null;
}

/** One validated root phoneme as the UI sees it. */
export interface RootView {
	readonly ipa: string;
	readonly roman: string;
	readonly when: WhenView | null;
	readonly allophones: readonly AllophoneView[];
}

/** One validated phoneme group as the UI sees it. */
export interface GroupView {
	/** Canonical group kind. */
	readonly kind: GroupKind;
	/**
	 * Display label. For reserved groups this is the canonical
	 * lowercase plural (`consonants`, `vowels`); for custom groups it
	 * is the validated custom name.
	 */
	readonly displayName: string;
	readonly roots: readonly RootView[];
}

/**
 * The full phoneme inventory view. Frozen on construction. Empty
 * `groups` is a valid inventory — the SDK enforces the cardinality
 * bounds upstream and the Hub MUST NOT confuse "empty" with "error".
 */
export interface PhonemeInventoryView {
	readonly groups: readonly GroupView[];
	/** Total root-phoneme count across all groups. */
	readonly rootCount: number;
	/** Total allophone count across all groups. */
	readonly allophoneCount: number;
	/** True when the inventory carries no groups at all. */
	readonly isEmpty: boolean;
}

/**
 * Build the phoneme inventory view from a validated payload. The
 * returned view is in canonical display order. The function NEVER
 * throws; an empty `groups` array is rendered as a valid empty
 * inventory (`isEmpty: true`).
 */
export function buildPhonemeInventoryView(body: InventoryBodyPayload): PhonemeInventoryView {
	const groups = [...body.groups]
		.map(buildGroupView)
		.sort((a, b) => compareGroupKinds(a.kind, b.kind));

	let rootCount = 0;
	let allophoneCount = 0;
	for (const g of groups) {
		rootCount += g.roots.length;
		for (const r of g.roots) allophoneCount += r.allophones.length;
	}

	return Object.freeze({
		groups: Object.freeze(groups),
		rootCount,
		allophoneCount,
		isEmpty: groups.length === 0
	});
}

function buildGroupView(payload: GroupPayload): GroupView {
	const kind: GroupKind =
		typeof payload.kind === 'string' ? payload.kind : Object.freeze({ name: payload.kind.name });
	const displayName = typeof payload.kind === 'string' ? payload.kind : payload.kind.name;
	const roots = [...payload.roots]
		.map((r) => buildRootView(r))
		.sort((a, b) => compareCodePoints(a.ipa, b.ipa));
	return Object.freeze({
		kind,
		displayName,
		roots: Object.freeze(roots)
	});
}

function buildRootView(payload: RootPayload): RootView {
	const when = payload.when === null ? null : conditionPayloadToView(payload.when);
	const allophones = [...payload.allophones]
		.map((a) => buildAllophoneView(a, payload.roman))
		.sort((a, b) => compareCodePoints(a.ipa, b.ipa));
	return Object.freeze({
		ipa: payload.ipa,
		roman: payload.roman,
		when,
		allophones: Object.freeze(allophones)
	});
}

function buildAllophoneView(payload: AllophonePayload, parentRoman: string): AllophoneView {
	const romanKind = classifyAllophoneRoman(payload.roman);
	const roman = displayAllophoneRoman(romanKind, parentRoman);
	const when = payload.when === null ? null : conditionPayloadToView(payload.when);
	return Object.freeze({
		ipa: payload.ipa,
		roman,
		romanKind,
		when
	});
}
