/**
 * Public entry point for the H03 phoneme view layer.
 *
 * Callers (the H04 phoneme page) import from this barrel — never from
 * the internal modules — so the implementation can be swapped (e.g.
 * for a server-side render that builds the same view model) without
 * touching the consumers.
 */

export {
	SUPPORTED_SPEC_VERSION,
	SUPPORTED_BINARY_CONTAINER_VERSION,
	type SdkCallOptions,
	type SdkDiagnostic,
	type SdkErrorCode,
	type SdkFailure,
	type SdkInspectResult,
	type SdkMode,
	type SdkResult,
	type SdkSuccess,
	type SdkValidateResult,
	type SdkVerifyResult,
	type ValidationStage,
	asSdkErrorCode
} from '../sdk/contract';

export {
	extractPhonemeView,
	PHONEME_VIEW_EXTRACTION_FAILED,
	type PhonemeView,
	type PhonemeViewError,
	type PhonemeViewResult
} from './extract';

export type { AllophoneView, GroupView, PhonemeInventoryView, RootView } from './phonemes';

export type { PackageView, SpecVersions } from './package';

export type { AllophoneRoman } from './romanization';
export { classifyAllophoneRoman, displayAllophoneRoman } from './romanization';

export type {
	ConditionExpressionView,
	ConditionPredicate,
	SyllablePosition,
	WhenView,
	WordPosition
} from './conditions';
export { groupView, orView, predicateView, renderPredicate, whenView } from './conditions';

export type {
	AllophonePayload,
	ConditionPayload,
	ConditionPayloadNode,
	GroupPayload,
	InventoryBodyPayload,
	InventoryPayload,
	NarrowError,
	NarrowErrorCode,
	NarrowResult,
	PackagePayload,
	RootPayload
} from './inventory';
export { narrowInventoryPayload, conditionPayloadToView } from './inventory';

export type { GroupKind } from './ordering';
export { compareCodePoints, compareGroupKinds } from './ordering';
