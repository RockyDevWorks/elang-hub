/**
 * Public entry point for the H04 phoneme page layer.
 *
 * The page (`src/routes/+page.svelte`) and its sub-components
 * import from this barrel — never from the internal modules —
 * so the implementation can evolve without touching callers.
 *
 * Mirrors H03's `src/lib/view/index.ts`: every public type is
 * `readonly`, every emitted value is frozen.
 */

export {
	PhonemePageController,
	type PhonemePageState,
	type PhonemePageIdle,
	type PhonemePageValidating,
	type PhonemePageView,
	type PhonemePageError,
	type PhonemePageErrorInfo,
	type PhonemePagePhase,
	type RequestPhonemeView
} from './controller';

export {
	mapRequestOutcome,
	viewOutcome,
	sdkErrorOutcome,
	httpErrorOutcome,
	transportErrorOutcome,
	type PhonemeRequestOutcome
} from './error-mapper';

export {
	RESERVED_GROUP_LABELS,
	NO_DESCRIPTION_PLACEHOLDER,
	NO_PHONEMES_PLACEHOLDER,
	NO_ROOTS_PLACEHOLDER,
	NO_ALLOPHONES_PLACEHOLDER,
	UPLOAD_PICKER_LABEL,
	UPLOAD_DROP_ZONE_LABEL,
	REPLACE_FILE_LABEL,
	CANCEL_LABEL,
	labelForGroupKind,
	labelForCustomGroup,
	labelForAllophoneRoman,
	formatBytes,
	summarizeInventory
} from './format';
