# H03 — Extraction & View Models Implementation Plan

**Branch**: `feat/5-hubv010h03-extraction-view-models`
**Base**: `release/0.1.0` (no rebase, no merge from main)
**Target PR base**: `release/0.1.0`
**Issue**: #5 [HUB][v0.1.0][H03] Extraction & View Models
**Workflow rule**: Everything moves from `release/0.1.0`. At v0.1.0 ship time, `release/0.1.0` → `main`.

## Scope

H03 sits between the SDK adapter (H02) and the phoneme page (H04). It owns the
read-only `PhonemeView` tree the UI renders and the typed contract the
validation service must speak.

The Hub does NOT parse, validate, or transform ELANG data. The SDK has done
all that. H03 only:

1. Receives an `SdkValidateResult` (a typed `unknown` inventory payload +
   the manifest-derived phoneme path + spec versions).
2. Narrows the inventory payload to a typed `InventoryPayload` shape.
3. Builds a frozen `PhonemeView` tree in canonical display order.
4. Surfaces extraction failures as a typed `PhonemeViewError`.

## Architectural changes to the SDK adapter

The H02 SDK adapter left the validated phoneme path implicit. H03 needs it
explicit so the Hub never hardcodes `Linguistics/phonemes.eld`. One
additive change to the H02 contract:

- `SdkValidateResult.phonemeResourcePath: string` — the EPF-manifest-derived
  path the SDK validated against the resource index. Required on every
  successful `validate` call; absence is a typed `malformed_response`
  failure.

`SdkValidateResult.inventory` stays `unknown` at the SDK layer. The H03
view layer narrows.

## Tasks

- [x] **H0301** — Surface the manifest phoneme path through the SDK
      adapter.
  - `src/lib/sdk/contract.ts` — add `phonemeResourcePath: string` to
    `SdkValidateResult`.
  - `src/lib/sdk/client.ts` — `parseValidate` enforces the new field.
  - `src/lib/sdk/stages.test.ts`, `src/lib/sdk/client.test.ts` —
    existing tests updated; missing-field path now reported as a
    `malformed_response` typed failure (stronger guarantee than before).
- [x] **H0302** — Map language name, language release, and supported
      descriptor metadata safely.
  - `src/lib/view/package.ts` — `PackageView` carries `name`,
    `languageVersion`, `identifier`, `namespace`, `languageName`,
    `description: string | null`, and the spec/container versions the
    Hub validated against. NO authorship badge: the view deliberately
    has no `verifiedBy`, `author`, `signer`, `publisher`, or `trusted`
    field. Integrity is not authorship.
  - `src/lib/view/package.test.ts` — pins field preservation and the
    absence of authorship fields.
- [x] **H0303** — Preserve validated IPA strings byte-exactly.
  - `src/lib/view/inventory.ts` — `narrowInventoryPayload` copies the
    strings; no `normalize`, no `toLowerCase`, no `codePointAt`-to-array
    round-trip.
  - `src/lib/view/ordering.ts` — `compareCodePoints` is a code-point
    iterator (handles surrogate pairs), NOT a UTF-16 code-unit compare
    and NOT `localeCompare`.
  - Tests pin precomposed vs decomposed, supplementary-plane IPA, and
    that the comparator handles them deterministically.
- [x] **H0304** — Stable view model for present phonetic features and
      classifications without fabricating.
  - The Hub only renders what the SDK returned. There is no
    `phoneticFeature` field on `RootView` or `AllophoneView`; nothing
    is fabricated. `RootView` and `AllophoneView` carry the validated
    IPA, romanization, and optional condition exactly as the SDK
    emitted them.
- [x] **H0305** — Map allophones and conditions read-only; preserve
      references.
  - `src/lib/view/conditions.ts` — discriminated union over `predicate`
    (leaf), `group` (AND ≥ 2), and `or` (binary OR). Every node carries
    a `displayText` for the common single-string case; the renderer can
    also walk the tree for a nested form.
  - `src/lib/view/inventory.ts` — `conditionPayloadToView` walks the
    wire-format tree without flattening. IPA references (`previous-phoneme`,
    `next-phoneme`) survive byte-exactly.
  - Tests cover every leaf type, OR-of-OR, group-of-OR, and rejected
    shapes.
- [x] **H0306** — Map romanization and grouping with explicit
      absent-data handling.
  - `src/lib/view/romanization.ts` — `AllophoneRoman` distinguishes
    `explicit`, `inherited` (C-16: allophone with no `roman` inherits
    the parent's exact-case romanization), and `absent` (reserved for
    forward compatibility — not used in v0.1.0).
  - The view carries `romanKind` so the UI can choose a deliberate
    presentation; the `roman` field is the resolved, displayed text.
  - `description: null` is preserved as null on `PackageView` (NOT
    coerced to `''`).
- [x] **H0307** — Deterministic display ordering and empty states.
  - Group order: `consonants` → `vowels` → custom by ASCII bytewise
    name (`compareGroupKinds`).
  - Root / allophone order: code-point order (`compareCodePoints`).
  - Empty inventory: `PhonemeView.view.inventory.isEmpty === true` —
    a successful view, NOT an error.
  - Extraction error: `PhonemeViewResult.ok === false` with
    `PHONEME_VIEW_EXTRACTION_FAILED` and a typed `cause`.
  - Tests pin every ordering rule across the supplementary plane and
    Unicode edge cases.
- [x] **H0308** — Test extraction fidelity.
  - `src/lib/view/extract.test.ts` — 20 tests across varied
    inventories (minimal, allophones, conditions, custom groups),
    Unicode cases (BMP, supplementary, precomposed/decomposed),
    optional fields (null description, empty allophones, absent
    romanization), and manifest-defined paths (H0301: the SDK-supplied
    `phonemeResourcePath` is exposed verbatim — the Hub cannot
    substitute a default).
  - `src/lib/view/inventory.test.ts` — 46 tests covering every
    `NarrowErrorCode` and the closed-set path annotation.
  - Coverage: 97.62% line coverage on `src/lib/view/**` (extract.ts
    100%).

## Module layout (src/lib/view/)

- `ordering.ts` — code-point comparator + group canonical order.
- `conditions.ts` — condition view models (predicate / group / or /
  when), all frozen, all with displayText.
- `romanization.ts` — `AllophoneRoman` enum, `classifyAllophoneRoman`,
  `displayAllophoneRoman`.
- `inventory.ts` — typed `InventoryPayload` contract, defensive
  `narrowInventoryPayload`, `conditionPayloadToView`.
- `phonemes.ts` — `PhonemeInventoryView`, `GroupView`, `RootView`,
  `AllophoneView`.
- `package.ts` — `PackageView`.
- `extract.ts` — top-level `extractPhonemeView`, the
  `PHONEME_VIEW_EXTRACTION_FAILED` error code.
- `index.ts` — public barrel; every H04 caller imports from here.

## Quality gates

- `npm run check` — 0 errors
- `npm run lint` — clean
- `npm test` — 195 tests pass (was 80; H03 added 115)
- `npm run coverage` — 93.53% statements, 94.61% lines, 97.62% on
  `src/lib/view/**`
- `npm run build` — Cloudflare adapter succeeds

## Empty states vs errors (H0307)

| Condition                            | Verdict                                               | UI render             |
| ------------------------------------ | ----------------------------------------------------- | --------------------- |
| Valid empty inventory (`groups: []`) | `{ ok: true, view.inventory.isEmpty }`                | "No phonemes defined" |
| Valid inventory with groups          | `{ ok: true, view.inventory.isEmpty: false }`         | Render the view       |
| Malformed SDK payload                | `{ ok: false, code: PHONEME_VIEW_EXTRACTION_FAILED }` | Typed error           |
| SDK `validate` failure               | (returned by `SdkClient.validate`)                    | H02 error mapping     |

The Hub NEVER conflates an empty inventory with a processing error.

## Read-only invariant

Every view object is `Object.freeze`d on construction. No mutation API is
exported from `src/lib/view/`. Tests assert the frozen property at every
level.

## IPA preservation

No `s.normalize('NFC')`, no `s.toLowerCase()`, no `Array.from(s)` round-trip.
The narrow function copies strings. The comparator is `String`'s iterator
(yielding full code points, including supplementary-plane characters).
