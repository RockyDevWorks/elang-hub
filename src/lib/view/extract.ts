/**
 * Top-level view-model extractor (H03 entry point).
 *
 * The Hub receives an `SdkValidateResult` from the SDK adapter. That
 * result carries the validated `inventory` payload as `unknown`; the
 * Hub cannot trust the shape of that payload. The view extractor is
 * the one place that turns the SDK's verdict into a `PhonemeView` —
 * a read-only, UI-ready tree — or a typed error.
 *
 * The extractor never throws. Every failure mode (missing payload,
 * malformed shape, hostile service) is a `PhonemeViewError` the UI
 * can render deliberately.
 *
 * Two distinct empty-vs-error cases (H0307):
 *
 *   - `ok: true, view.isEmpty: true` — the package validated
 *     successfully and the inventory is empty. The UI shows an
 *     explicit "No phonemes defined" placeholder. This is NOT an
 *     error.
 *   - `ok: false, error.code: 'inventory_narrow_failed'` — the SDK
 *     payload did not match the documented `InventoryPayload` shape.
 *     The UI shows a typed extraction error. This IS an error.
 */

import type { SdkDiagnostic, SdkValidateResult } from '../sdk/contract';
import { SUPPORTED_BINARY_CONTAINER_VERSION, SUPPORTED_SPEC_VERSION } from '../sdk/contract';

import { buildPackageView, type PackageView } from './package';
import { buildPhonemeInventoryView, type PhonemeInventoryView } from './phonemes';
import { narrowInventoryPayload, type NarrowError } from './inventory';

/** Diagnostic code emitted when the SDK inventory payload fails to narrow. */
export const PHONEME_VIEW_EXTRACTION_FAILED = 'phoneme_view_extraction_failed' as const;

/** A successful phoneme view. The view is fully frozen. */
export interface PhonemeView {
	readonly ok: true;
	readonly view: {
		readonly package: PackageView;
		/**
		 * The resource path the EPF manifest declared for the phoneme
		 * inventory (H0301). The Hub never hardcodes this — it always
		 * comes from the SDK contract. The UI may show it as a small
		 * caption so the user knows which resource was loaded.
		 */
		readonly phonemeResourcePath: string;
		readonly inventory: PhonemeInventoryView;
		readonly diagnostics: readonly SdkDiagnostic[];
	};
}

/** A failed extraction. The Hub renders the typed error; never empty state. */
export interface PhonemeViewError {
	readonly ok: false;
	/** A Hub-facing diagnostic code, always `PHONEME_VIEW_EXTRACTION_FAILED`. */
	readonly code: typeof PHONEME_VIEW_EXTRACTION_FAILED;
	/** A bounded, user-safe message. */
	readonly message: string;
	/**
	 * The path inside the SDK payload that failed. Optional — narrow
	 * errors that don't carry a path use the top-level code only.
	 */
	readonly path?: string;
	/** The original `NarrowError` for logs/telemetry; not for UI. */
	readonly cause: NarrowError;
}

/** Discriminated union of successful view or typed extraction failure. */
export type PhonemeViewResult = PhonemeView | PhonemeViewError;

/**
 * Build a `PhonemeView` from an `SdkValidateResult`. The function is
 * total — it never throws. Empty inventories are returned as a
 * successful view (`view.inventory.isEmpty: true`); only a payload
 * that fails to narrow to `InventoryPayload` produces an error.
 */
export function extractPhonemeView(result: SdkValidateResult): PhonemeViewResult {
	const narrow = narrowInventoryPayload(result.inventory);
	if (!narrow.ok) {
		return {
			ok: false,
			code: PHONEME_VIEW_EXTRACTION_FAILED,
			message: 'The validated phoneme inventory could not be read.',
			...(narrow.error.path !== undefined ? { path: narrow.error.path } : {}),
			cause: narrow.error
		};
	}

	const specVersions = {
		specVersion: result.specVersion ?? SUPPORTED_SPEC_VERSION,
		binaryContainerVersion: result.binaryContainerVersion ?? SUPPORTED_BINARY_CONTAINER_VERSION
	};

	const packageView = buildPackageView(narrow.value.package, specVersions);
	const inventoryView = buildPhonemeInventoryView(narrow.value.inventory);

	return {
		ok: true,
		view: Object.freeze({
			package: packageView,
			phonemeResourcePath: result.phonemeResourcePath,
			inventory: inventoryView,
			diagnostics: Object.freeze([...result.diagnostics])
		})
	};
}
