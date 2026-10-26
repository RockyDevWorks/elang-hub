/**
 * Pure presentation decisions for the H04 phoneme viewer.
 *
 * These are deliberately string-only functions so they can be
 * unit-tested without rendering. Svelte components consume them
 * and bind the result to the template — no Svelte-side
 * transformation of the view model.
 *
 * Rules:
 *
 *   1. IPA strings are preserved byte-exactly (H0303). The
 *      functions here never call `.normalize`, `.toLowerCase` or
 *      `Array.from` on IPA.
 *   2. Empty / missing fields render as deliberate placeholders
 *      (`—` for absent romanization, "No description provided"
 *      for null description, "No phonemes defined" for empty
 *      inventory). The viewer NEVER invents a value the SDK did
 *      not emit (H0304).
 *   3. Group labels are the canonical lowercase plural for
 *      reserved groups; custom groups keep the validated slug.
 *   4. Romanization kind renders as a deliberate three-way label
 *      so the user can see the difference between `explicit`,
 *      `inherited` (C-16) and `absent` (reserved for forward
 *      compatibility; never appears in v0.1.0 data).
 */

import type { AllophoneRoman } from '../view';

/** User-facing label for a reserved group. */
export const RESERVED_GROUP_LABELS: Readonly<Record<'consonants' | 'vowels', string>> =
	Object.freeze({
		consonants: 'Consonants',
		vowels: 'Vowels'
	});

/** Title-case a validated custom-group slug for display. */
export function labelForCustomGroup(slug: string): string {
	// Custom group names are constrained to `[a-z]+(?:-[a-z]+)*`
	// by the SDK (H0307). Replace `-` with a space and title-case
	// each piece. No Unicode transform beyond ASCII case fold —
	// custom group names never carry diacritics.
	return slug
		.split('-')
		.map((piece) => (piece.length === 0 ? piece : piece[0].toUpperCase() + piece.slice(1)))
		.join(' ');
}

/**
 * Compute the display label for any `GroupKind`. Reserved kinds
 * use the canonical plural; custom kinds are title-cased from the
 * slug. The function is total — the SDK has already validated
 * the slug pattern.
 */
export function labelForGroupKind(
	kind: 'consonants' | 'vowels' | { readonly name: string }
): string {
	if (kind === 'consonants' || kind === 'vowels') return RESERVED_GROUP_LABELS[kind];
	return labelForCustomGroup(kind.name);
}

/**
 * Label for an `AllophoneRoman`. Returns the three-way
 * description so the user can see whether the romanization was
 * explicit (the allophone has its own `roman`), inherited
 * (C-16: falls back to the parent root's roman), or absent
 * (reserved; never appears in v0.1.0 data).
 */
export function labelForAllophoneRoman(roman: AllophoneRoman): string {
	switch (roman.kind) {
		case 'explicit':
			return 'explicit';
		case 'inherited':
			return 'inherited from root';
		case 'absent':
			return 'not provided';
	}
}

/**
 * Render the placeholder for a null description. The placeholder
 * is intentional — a missing description is a deliberate
 * metadata gap, not a bug.
 */
export const NO_DESCRIPTION_PLACEHOLDER = 'No description provided.';

/** Placeholder for a group that carries no roots. */
export const NO_PHONEMES_PLACEHOLDER = 'This package defines no phonemes.';

/** Placeholder for an empty group (no roots). */
export const NO_ROOTS_PLACEHOLDER = 'No phonemes in this group.';

/** Placeholder for a root with no allophones. */
export const NO_ALLOPHONES_PLACEHOLDER = 'No allophones.';

/** Accessible label for the upload picker button. */
export const UPLOAD_PICKER_LABEL = 'Choose an ELANG package to validate';

/** Accessible label for the upload drop zone. */
export const UPLOAD_DROP_ZONE_LABEL =
	'Drag and drop an ELANG package here, or use the picker above';

/** Label for the "Upload another file" button (visible on view + error). */
export const REPLACE_FILE_LABEL = 'Upload another file';

/** Label for the cancel button (visible while validating). */
export const CANCEL_LABEL = 'Cancel';

/**
 * Format a byte count for display. The page uses the result as
 * text; no locale-sensitive formatting (the user agent's
 * formatter is good enough for v0.1.0 and we don't want a
 * locale dependency for a single line).
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

/**
 * Compute a short accessible summary of the inventory for the
 * page header's status line.
 */
export function summarizeInventory(view: {
	readonly rootCount: number;
	readonly allophoneCount: number;
	readonly isEmpty: boolean;
}): string {
	if (view.isEmpty) return NO_PHONEMES_PLACEHOLDER;
	const rootLabel = view.rootCount === 1 ? '1 phoneme' : `${view.rootCount} phonemes`;
	if (view.allophoneCount === 0) return rootLabel;
	const alloLabel = view.allophoneCount === 1 ? '1 allophone' : `${view.allophoneCount} allophones`;
	return `${rootLabel}, ${alloLabel}`;
}
