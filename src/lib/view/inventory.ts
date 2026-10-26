/**
 * Inventory typed contract (H03).
 *
 * The SDK adapter (`src/lib/sdk/contract.ts`) returns the validated
 * phoneme inventory as `unknown` on `SdkValidateResult.inventory`. The
 * Hub CANNOT just trust the shape — the service could be hostile,
 * misbehaving, or simply running an older revision. The view layer
 * owns the typed contract here and narrows the unknown payload to that
 * contract via [`narrowInventoryPayload`].
 *
 * # Wire format
 *
 * The wire format is the JSON shape the validation service sends in
 * `SdkValidateResult.inventory`. It mirrors the validated Rust model
 * 1:1 so the Fly.io wrapper can produce it mechanically from
 * `elang_core::model::eld::PhonemeInventory` and
 * `elang_core::model::epf::EpfPackage`.
 *
 * # Fidelity
 *
 * `narrowInventoryPayload` is a defensive parser: any deviation from
 * the documented shape produces an `ExtractionError` rather than a
 * thrown exception. The Hub never crashes the UI on bad SDK output;
 * it surfaces a typed error and lets the renderer handle it.
 *
 * The Hub does NOT re-validate IPA strings, group cardinalities,
 * uniqueness or reference resolution. Anything that survived
 * `elang validate` is treated as ground truth.
 */

import type { ConditionPredicate, WhenView } from './conditions';
import { groupView, orView, predicateView, whenView } from './conditions';

/** The Hub-side typed shape of the validated EPF metadata block. */
export interface PackagePayload {
	/** Full URN, e.g. `urn:elang:language:rocky:aelith:1.0.0`. */
	readonly identifier: string;
	/** URN namespace slug, e.g. `rocky`. */
	readonly namespace: string;
	/** URN language-name slug, e.g. `aelith`. */
	readonly languageName: string;
	/** `MAJOR.MINOR.PATCH` from the language-version field. */
	readonly languageVersion: string;
	/** Human-readable language name from `metadata.name`. */
	readonly name: string;
	/** `metadata.description`, or `null` when absent. */
	readonly description: string | null;
}

/**
 * A condition tree, exactly as the SDK produces it. The Hub re-walks
 * this into a [`WhenView`] without transforming the strings.
 */
export interface ConditionPayload {
	/** Top-level implicit AND of these children (≥ 1). */
	readonly children: readonly ConditionPayloadNode[];
}

export type ConditionPayloadNode =
	| { readonly kind: 'predicate'; readonly predicate: ConditionPredicate }
	| { readonly kind: 'group'; readonly children: readonly ConditionPayloadNode[] }
	| {
			readonly kind: 'or';
			readonly left: ConditionPayloadNode;
			readonly right: ConditionPayloadNode;
	  };

/** One allophone as carried over the wire. */
export interface AllophonePayload {
	/** The allophone's IPA identifier. Preserved byte-exactly. */
	readonly ipa: string;
	/**
	 * The allophone's explicit romanization, or `null` when the
	 * allophone inherits the parent's romanization (C-16).
	 */
	readonly roman: string | null;
	readonly when: ConditionPayload | null;
}

/** One root phoneme as carried over the wire. */
export interface RootPayload {
	/** The root's IPA identifier. Preserved byte-exactly. */
	readonly ipa: string;
	/** The root's required romanization. */
	readonly roman: string;
	readonly when: ConditionPayload | null;
	readonly allophones: readonly AllophonePayload[];
}

/** One phoneme group as carried over the wire. */
export interface GroupPayload {
	/**
	 * Either a reserved kind (`consonants` / `vowels`) or a custom
	 * group object whose `name` matches the regex `[a-z]+(?:-[a-z]+)*`.
	 */
	readonly kind: 'consonants' | 'vowels' | { readonly name: string };
	readonly roots: readonly RootPayload[];
}

/** The validated phoneme inventory body (ELD section of the package). */
export interface InventoryBodyPayload {
	readonly groups: readonly GroupPayload[];
}

/**
 * The full validated payload the validation service sends on
 * `SdkValidateResult.inventory`. Includes the EPF metadata and the
 * phoneme inventory.
 */
export interface InventoryPayload {
	readonly package: PackagePayload;
	readonly inventory: InventoryBodyPayload;
}

/**
 * Reasons the narrow function can reject a payload. The set is closed
 * — every error has a stable code so the UI can render a deliberate
 * message and (for telemetry) report exactly what went wrong.
 */
export type NarrowErrorCode =
	| 'inventory_not_object'
	| 'package_section_invalid'
	| 'identifier_invalid'
	| 'namespace_invalid'
	| 'language_name_invalid'
	| 'language_version_invalid'
	| 'name_invalid'
	| 'description_invalid'
	| 'inventory_section_invalid'
	| 'groups_invalid'
	| 'group_invalid'
	| 'group_kind_invalid'
	| 'group_name_invalid'
	| 'roots_invalid'
	| 'root_invalid'
	| 'root_ipa_invalid'
	| 'root_roman_invalid'
	| 'allophones_invalid'
	| 'allophone_invalid'
	| 'allophone_ipa_invalid'
	| 'allophone_roman_invalid'
	| 'condition_invalid'
	| 'condition_predicate_invalid';

export interface NarrowError {
	readonly code: NarrowErrorCode;
	/** A bounded, stable human message — safe for UI rendering. */
	readonly message: string;
	/** Optional dotted path to the offending field, e.g. `inventory.groups[2]`. */
	readonly path?: string;
}

/** Discriminated union of a successful narrow or a typed rejection. */
export type NarrowResult<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: NarrowError };

/**
 * Narrow the SDK's opaque `inventory` field into an `InventoryPayload`.
 *
 * The function NEVER throws; every failure is a `NarrowError` so the
 * UI can render a typed error message. The function only inspects the
 * shape; it does NOT validate IPA repertoire membership, uniqueness,
 * cardinality bounds, or any ELD semantic rule — those are the SDK's
 * job.
 */
export function narrowInventoryPayload(input: unknown): NarrowResult<InventoryPayload> {
	if (!isRecord(input)) {
		return err('inventory_not_object', 'SDK inventory payload was not a JSON object.');
	}

	const pkgResult = narrowPackage(input.package);
	if (!pkgResult.ok) return pkgResult;

	const invResult = narrowInventoryBody(input.inventory);
	if (!invResult.ok) return invResult;

	return ok({ package: pkgResult.value, inventory: invResult.value });
}

/* ------------------------------------------------------------------ */
/* package section                                                     */
/* ------------------------------------------------------------------ */

function narrowPackage(value: unknown): NarrowResult<PackagePayload> {
	if (!isRecord(value)) {
		return err(
			'package_section_invalid',
			'SDK inventory was missing the `package` section.',
			'package'
		);
	}

	const identifierResult = narrowNonEmptyString(
		value.identifier,
		'identifier',
		'identifier_invalid'
	);
	if (!identifierResult.ok) return identifierResult;
	// Defensive format check: every validated identifier URN begins
	// with the fixed prefix. The Hub does NOT re-parse the URN
	// components here — only verifies it has the right shape so a
	// hostile service can't smuggle in arbitrary text under the
	// `identifier` field. The SDK's LanguageIdentifier::parse
	// already validated the full structure upstream.
	if (!identifierResult.value.startsWith('urn:elang:language:')) {
		return err(
			'identifier_invalid',
			'SDK package identifier is not a `urn:elang:language:` URN.',
			'package.identifier'
		);
	}

	const namespaceResult = narrowNonEmptyString(value.namespace, 'namespace', 'namespace_invalid');
	if (!namespaceResult.ok) {
		return rebase(namespaceResult.error, 'package.namespace');
	}

	const languageNameResult = narrowNonEmptyString(
		value.languageName,
		'languageName',
		'language_name_invalid'
	);
	if (!languageNameResult.ok) {
		return rebase(languageNameResult.error, 'package.languageName');
	}

	const versionResult = narrowSemVerString(
		value.languageVersion,
		'languageVersion',
		'language_version_invalid'
	);
	if (!versionResult.ok) {
		return rebase(versionResult.error, 'package.languageVersion');
	}

	const nameResult = narrowNonEmptyString(value.name, 'name', 'name_invalid');
	if (!nameResult.ok) {
		return rebase(nameResult.error, 'package.name');
	}

	const descriptionResult = narrowOptionalString(
		value.description,
		'description',
		'description_invalid'
	);
	if (!descriptionResult.ok) {
		return rebase(descriptionResult.error, 'package.description');
	}

	return ok({
		identifier: identifierResult.value,
		namespace: namespaceResult.value,
		languageName: languageNameResult.value,
		languageVersion: versionResult.value,
		name: nameResult.value,
		description: descriptionResult.value
	});
}

/* ------------------------------------------------------------------ */
/* inventory body                                                      */
/* ------------------------------------------------------------------ */

function narrowInventoryBody(value: unknown): NarrowResult<InventoryBodyPayload> {
	if (!isRecord(value)) {
		return err(
			'inventory_section_invalid',
			'SDK inventory was missing the `inventory` section.',
			'inventory'
		);
	}
	const groupsResult = narrowArray(value.groups, 'groups', 'groups_invalid');
	if (!groupsResult.ok) return rebase(groupsResult.error, 'inventory.groups');
	const out: GroupPayload[] = [];
	for (let i = 0; i < groupsResult.value.length; i++) {
		const gResult = narrowGroup(groupsResult.value[i]);
		if (!gResult.ok) return rebase(gResult.error, `inventory.groups[${i}]`);
		out.push(gResult.value);
	}
	return ok({ groups: Object.freeze(out) });
}

function narrowGroup(value: unknown): NarrowResult<GroupPayload> {
	if (!isRecord(value)) {
		return err('group_invalid', 'Group entry was not a JSON object.');
	}
	const kindResult = narrowGroupKind(value.kind);
	if (!kindResult.ok) return rebase(kindResult.error, 'kind');
	const rootsResult = narrowArray(value.roots, 'roots', 'roots_invalid');
	if (!rootsResult.ok) return rebase(rootsResult.error, 'roots');
	const roots: RootPayload[] = [];
	for (let i = 0; i < rootsResult.value.length; i++) {
		const rResult = narrowRoot(rootsResult.value[i]);
		if (!rResult.ok) return rebase(rResult.error, `roots[${i}]`);
		roots.push(rResult.value);
	}
	return ok({ kind: kindResult.value, roots: Object.freeze(roots) });
}

function narrowGroupKind(value: unknown): NarrowResult<GroupPayload['kind']> {
	if (value === 'consonants' || value === 'vowels') {
		return ok(value);
	}
	// The wire format for a custom group is the bare object
	// `{ "name": "<slug>" }` — the object shape itself is the
	// discriminator; the reserved groups are strings, so any object
	// here is unambiguously custom.
	if (isRecord(value) && typeof value.name === 'string') {
		if (!isValidCustomGroupName(value.name)) {
			return err(
				'group_name_invalid',
				`Custom group name ${JSON.stringify(value.name)} is not a valid ELD group name.`
			);
		}
		return ok({ name: value.name });
	}
	return err(
		'group_kind_invalid',
		'Group kind must be the string "consonants" / "vowels" or an object {"name":"<slug>"}.'
	);
}

/** Custom group name: `[a-z]+(?:-[a-z]+)*`, 1..=32 chars. */
function isValidCustomGroupName(name: string): boolean {
	if (name.length === 0 || name.length > 32) return false;
	if (!/^[a-z]+(?:-[a-z]+)*$/.test(name)) return false;
	return true;
}

function narrowRoot(value: unknown): NarrowResult<RootPayload> {
	if (!isRecord(value)) {
		return err('root_invalid', 'Root entry was not a JSON object.');
	}
	const ipaResult = narrowNonEmptyString(value.ipa, 'ipa', 'root_ipa_invalid');
	if (!ipaResult.ok) return rebase(ipaResult.error, 'ipa');
	const romanResult = narrowNonEmptyString(value.roman, 'roman', 'root_roman_invalid');
	if (!romanResult.ok) return rebase(romanResult.error, 'roman');
	const whenResult = narrowOptionalCondition(value.when);
	if (!whenResult.ok) return rebase(whenResult.error, 'when');
	const allosResult = narrowArray(value.allophones, 'allophones', 'allophones_invalid');
	if (!allosResult.ok) return rebase(allosResult.error, 'allophones');
	const allophones: AllophonePayload[] = [];
	for (let i = 0; i < allosResult.value.length; i++) {
		const aResult = narrowAllophone(allosResult.value[i]);
		if (!aResult.ok) return rebase(aResult.error, `allophones[${i}]`);
		allophones.push(aResult.value);
	}
	return ok({
		ipa: ipaResult.value,
		roman: romanResult.value,
		when: whenResult.value,
		allophones: Object.freeze(allophones)
	});
}

function narrowAllophone(value: unknown): NarrowResult<AllophonePayload> {
	if (!isRecord(value)) {
		return err('allophone_invalid', 'Allophone entry was not a JSON object.');
	}
	const ipaResult = narrowNonEmptyString(value.ipa, 'ipa', 'allophone_ipa_invalid');
	if (!ipaResult.ok) return rebase(ipaResult.error, 'ipa');
	const romanResult = narrowOptionalString(value.roman, 'roman', 'allophone_roman_invalid');
	if (!romanResult.ok) return rebase(romanResult.error, 'roman');
	const whenResult = narrowOptionalCondition(value.when);
	if (!whenResult.ok) return rebase(whenResult.error, 'when');
	return ok({
		ipa: ipaResult.value,
		roman: romanResult.value,
		when: whenResult.value
	});
}

function narrowOptionalCondition(value: unknown): NarrowResult<ConditionPayload | null> {
	if (value === null || value === undefined) return ok(null);
	const result = narrowCondition(value);
	if (!result.ok) return result;
	return result;
}

function narrowCondition(value: unknown): NarrowResult<ConditionPayload> {
	if (!isRecord(value)) {
		return err('condition_invalid', '`when` block was not a JSON object.');
	}
	if (!Array.isArray(value.children)) {
		return err('condition_invalid', '`when` block is missing a `children` array.');
	}
	const childrenResult = narrowConditionChildren(value.children);
	if (!childrenResult.ok) return childrenResult;
	return ok({ children: childrenResult.value });
}

function narrowConditionChildren(value: unknown[]): NarrowResult<readonly ConditionPayloadNode[]> {
	const out: ConditionPayloadNode[] = [];
	for (let i = 0; i < value.length; i++) {
		const nodeResult = narrowConditionNode(value[i]);
		if (!nodeResult.ok) return rebase(nodeResult.error, `children[${i}]`);
		out.push(nodeResult.value);
	}
	return ok(Object.freeze(out));
}

function narrowConditionNode(value: unknown): NarrowResult<ConditionPayloadNode> {
	if (!isRecord(value)) {
		return err('condition_invalid', 'Condition node was not a JSON object.');
	}
	switch (value.kind) {
		case 'predicate':
			return narrowPredicateNode(value);
		case 'group': {
			if (!Array.isArray(value.children)) {
				return err('condition_invalid', '`group` node is missing its `children` array.');
			}
			const childrenResult = narrowConditionChildren(value.children);
			if (!childrenResult.ok) return childrenResult;
			return ok({ kind: 'group', children: childrenResult.value });
		}
		case 'or': {
			const leftResult = narrowConditionNode(value.left);
			if (!leftResult.ok) return rebase(leftResult.error, 'left');
			const rightResult = narrowConditionNode(value.right);
			if (!rightResult.ok) return rebase(rightResult.error, 'right');
			return ok({ kind: 'or', left: leftResult.value, right: rightResult.value });
		}
		default:
			return err(
				'condition_invalid',
				'Condition node `kind` is not one of `predicate` / `group` / `or`.'
			);
	}
}

function narrowPredicateNode(value: Record<string, unknown>): NarrowResult<ConditionPayloadNode> {
	const predicateResult = narrowPredicate(value.predicate);
	if (!predicateResult.ok) return rebase(predicateResult.error, 'predicate');
	return ok({ kind: 'predicate', predicate: predicateResult.value });
}

function narrowPredicate(value: unknown): NarrowResult<ConditionPredicate> {
	if (!isRecord(value)) {
		return err('condition_predicate_invalid', 'Predicate was not a JSON object.');
	}
	const kind = value.kind;
	switch (kind) {
		case 'word-position': {
			const v = value.value;
			if (v === 'initial' || v === 'medial' || v === 'final') {
				return ok({ kind: 'word-position', value: v });
			}
			return err(
				'condition_predicate_invalid',
				'word-position value must be initial/medial/final.'
			);
		}
		case 'syllable-position': {
			const v = value.value;
			if (v === 'onset' || v === 'nucleus' || v === 'coda') {
				return ok({ kind: 'syllable-position', value: v });
			}
			return err(
				'condition_predicate_invalid',
				'syllable-position value must be onset/nucleus/coda.'
			);
		}
		case 'previous-phoneme':
		case 'next-phoneme': {
			const ipa = value.ipa;
			if (typeof ipa !== 'string' || ipa.length === 0) {
				return err('condition_predicate_invalid', `${kind} predicate is missing its IPA string.`);
			}
			return ok({ kind, ipa } as ConditionPredicate);
		}
		default:
			return err(
				'condition_predicate_invalid',
				'Predicate `kind` is not one of word-position/syllable-position/previous-phoneme/next-phoneme.'
			);
	}
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function narrowNonEmptyString(
	value: unknown,
	field: string,
	code: NarrowErrorCode
): NarrowResult<string> {
	if (typeof value !== 'string' || value.length === 0) {
		return err(code, `\`${field}\` must be a non-empty string.`);
	}
	return ok(value);
}

function narrowOptionalString(
	value: unknown,
	field: string,
	code: NarrowErrorCode
): NarrowResult<string | null> {
	if (value === null || value === undefined) return ok(null);
	if (typeof value !== 'string') {
		return err(code, `\`${field}\` must be a string or null.`);
	}
	return ok(value);
}

function narrowArray(
	value: unknown,
	field: string,
	code: NarrowErrorCode
): NarrowResult<unknown[]> {
	if (!Array.isArray(value)) {
		return err(code, `\`${field}\` must be an array.`);
	}
	return ok(value);
}

function narrowSemVerString(
	value: unknown,
	field: string,
	code: NarrowErrorCode
): NarrowResult<string> {
	const result = narrowNonEmptyString(value, field, code);
	if (!result.ok) return result;
	// Hub does not re-validate SemVer semantics; it just refuses a
	// payload that obviously fails the format. The SDK has done the
	// real check.
	if (!/^\d+\.\d+\.\d+$/.test(result.value)) {
		return err(code, `\`${field}\` is not a MAJOR.MINOR.PATCH string.`);
	}
	return ok(result.value);
}

function ok<T>(value: T): NarrowResult<T> {
	return { ok: true, value };
}

function err(code: NarrowErrorCode, message: string, path?: string): NarrowResult<never> {
	return path === undefined
		? { ok: false, error: { code, message } }
		: { ok: false, error: { code, message, path } };
}

function rebase(error: NarrowError, path: string): NarrowResult<never> {
	const oldPath = error.path;
	const newPath = oldPath === undefined ? path : `${path}.${oldPath}`;
	return { ok: false, error: { code: error.code, message: error.message, path: newPath } };
}

/* ------------------------------------------------------------------ */
/* AST → view conversion                                               */
/* ------------------------------------------------------------------ */

/**
 * Walk a `ConditionPayloadNode` tree and produce the equivalent
 * `ConditionExpressionView` tree. The wire format and the view model
 * share the same shape, so this is a structural re-tag with display
 * text attached at every node.
 */
function payloadToExpression(node: ConditionPayloadNode): {
	readonly view: import('./conditions').ConditionExpressionView;
} {
	if (node.kind === 'predicate') {
		return { view: predicateView(node.predicate) };
	}
	if (node.kind === 'group') {
		const childViews = node.children.map((c) => payloadToExpression(c).view);
		return { view: groupView(childViews) };
	}
	const left = payloadToExpression(node.left).view;
	const right = payloadToExpression(node.right).view;
	return { view: orView(left, right) };
}

/**
 * Convert a `ConditionPayload` (wire shape) to a `WhenView` (view
 * shape). The conversion is structural — no string transformation on
 * IPA references, no flattening of `or`/`group` nodes.
 */
export function conditionPayloadToView(payload: ConditionPayload): WhenView {
	const children = payload.children.map((c) => payloadToExpression(c).view);
	return whenView(children);
}
