/**
 * Package metadata view model (H0302).
 *
 * The Hub maps the validated EPF `metadata` block onto a flat,
 * read-only view the UI can render. The view is deliberately
 * descriptive of the *package* (its name, its identifier, its version)
 * and never claims authorship, signing or any verification of who
 * produced it.
 *
 * Why no "verified by" badge: the SDK contract only proves that the
 * package's declared resources have the hashes the package itself
 * declared. That proves integrity, not authorship. A package can be
 * perfectly intact and still come from anyone. The Hub must not
 * upgrade "integrity verified" to "author verified" — that is a
 * separate problem out of scope for v0.1.0.
 */

import type { PackagePayload } from './inventory';

/**
 * The validated spec version the SDK ran against. The Hub displays
 * this so the user can confirm the package speaks a dialect of ELANG
 * the Hub understands. Comes from the SDK, not from the package.
 */
export interface SpecVersions {
	readonly specVersion: string;
	readonly binaryContainerVersion: string;
}

/**
 * The package metadata view. Frozen on construction; consumers must
 * not mutate it.
 */
export interface PackageView {
	/** Full URN, e.g. `urn:elang:language:rocky:aelith:1.0.0`. */
	readonly identifier: string;
	/** URN namespace slug. */
	readonly namespace: string;
	/** URN language-name slug. */
	readonly languageName: string;
	/** `MAJOR.MINOR.PATCH` from the language-version field. */
	readonly languageVersion: string;
	/** Human-readable language name from `metadata.name`. */
	readonly name: string;
	/** `metadata.description`, or `null` when absent. */
	readonly description: string | null;
	/** The spec/container versions this package was validated against. */
	readonly specVersions: SpecVersions;
}

/**
 * Build the package view from a validated payload + spec versions.
 *
 * The function is total — every field is non-null after it returns.
 * `description: null` is preserved; the UI renders an explicit
 * "no description provided" placeholder.
 */
export function buildPackageView(payload: PackagePayload, spec: SpecVersions): PackageView {
	return Object.freeze({
		identifier: payload.identifier,
		namespace: payload.namespace,
		languageName: payload.languageName,
		languageVersion: payload.languageVersion,
		name: payload.name,
		description: payload.description,
		specVersions: Object.freeze({
			specVersion: spec.specVersion,
			binaryContainerVersion: spec.binaryContainerVersion
		})
	});
}
