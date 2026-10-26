# H04 — Phonemes Page Implementation Plan

**Branch**: `feat/6-hubv010h04-phonemes-page`
**Base**: `release/0.1.0` (no rebase, no merge from main)
**Target PR base**: `release/0.1.0`
**Issue**: #6 [HUB][v0.1.0][H04] Phonemes Page
**Workflow rule**: Everything moves from `release/0.1.0`. At v0.1.0 ship time, `release/0.1.0` → `main`.

## Scope

H04 owns the read-only phoneme viewer. H02 already speaks to the SDK
adapter. H03 already produces the frozen `PhonemeView` tree. H04 only
renders that tree.

The page is the destination for a successfully validated package:

- The Hub never parses, edits or transforms ELANG data here.
- The page reads from `PhonemeView` only; nothing else.
- The "replace-file action" lets the user restart with a different
  package, but the page itself does not own the upload bytes — the
  page owns the lifecycle state and the validated view.

## Tasks

- [x] **H0401** — Build the read-only Phonemes Page.
  - `src/routes/+page.svelte` has four explicit phases:
    `idle`, `validating`, `view`, `error`. No silent transitions,
    no implicit state.
  - The page renders only validated view-model data. No SDK payloads,
    no `unknown` casts, no metadata the SDK did not emit.
  - The page header shows the language name, identifier, language
    version, and spec/container versions. NO authorship badge —
    `PackageView` deliberately does not carry one (H0302).
  - The "Upload another file" button is the only path out of
    `view` or `error` and returns the page to `idle`.
- [x] **H0402** — Render consonant inventory.
  - The reserved `consonants` group renders first (H0307) and is
    labelled "Consonants".
  - Every root in the group is listed with its IPA + romanization.
  - Roots with no validated `phoneticFeature` (H0304) are shown
    without inventing a chart position — they are visible in the
    list, distinct from "tabulated" roots. The chart-style
    organisation is reserved for languages that actually carry
    classifier metadata (not in v0.1.0).
- [x] **H0403** — Render vowel inventory.
  - Same shape as H0402 but labelled "Vowels".
  - No position is invented for un-positioned vowels; the list view
    remains the source of truth.
- [x] **H0404** — Provide complete phoneme list / detail views.
  - Every validated root is reachable from the page in the
    canonical display order (H0307).
  - Every allophone is listed under its parent root, with the
    condition tree (when present).
  - Multi-symbol IPA and supplementary-plane IPA (H0303) survive
    byte-exactly into the DOM. No NFC, no case-fold, no surrogate
    splitting. The IPA font (Doulos SIL fallback chain) renders
    them legibly.
- [x] **H0405** — Render optional phonological details.
  - Conditions render as a readable tree (`ConditionTree.svelte`)
    using the `displayText` carried on every `WhenView` node.
    Nested `or` and `group` nodes are NOT flattened.
  - Allophones show their `roman`, the roman kind (`explicit` /
    `inherited` / `absent` from H0306), and their `when` block.
  - Diagnostics from the SDK verdict render as a small advisory
    list. They never block success.
  - The `phonemeResourcePath` is shown as a small caption so the
    user can confirm which ELD resource was loaded.
- [x] **H0406** — Reliable IPA typography.
  - Font stack: `Doulos SIL` → `Charis SIL` → `Gentium Plus` →
    `serif`. All three are SIL OFL fonts with broad Unicode
    coverage. The page loads them through the `app.html`
    `<link>` tags (no build-time bundling) and falls back to the
    user agent's serif when none are available.
  - IPA is rendered at `font-feature-settings: "kern"` on, with
    `font-variant-ligatures: no-common-ligatures` so tie bars and
    combining diacritics stay visible (the default serif ligature
    `fi`/`fl` would otherwise clip a combining tilde bar).
  - The IPA span gets `lang="und-fonipa"` so screen readers and
    the user agent know it is phonetics, not natural language
    text.
- [x] **H0407** — Responsive + keyboard-accessible layout.
  - The viewer works at ≥ 320 px viewport widths. The metadata
    header collapses from a row to a column at the `sm` breakpoint.
  - The full phoneme list, the consonant block and the vowel block
    are reachable from a single skip-link and a `<nav>` of
    in-page anchors.
  - Every interactive control is a real `<button>` or
    `<a>` (no `div`-with-handler), has a visible focus ring, and
    has an accessible name from visible text or `aria-label`.
  - Colour contrast meets WCAG AA against the `gray-50` page
    background. Tested for the muted metadata text and for the
    "Upload another file" outline button.
- [x] **H0408** — End-to-end successful-viewing test.
  - `src/routes/page.test.ts` (controller-level integration test)
    covers:
    - `idle` phase exposes the upload prompt hook.
    - `validating` phase carries `fileName`, `fileSize`, `progress`,
      and `cancel`.
    - `view` phase exposes the validated view: language name,
      identifier, version, IPA + romanization for at least one
      root, allophone with condition, and the "Upload another
      file" button (`replace()`).
    - `error` phase exposes the typed error message and the
      "Upload another file" button.
    - The "Upload another file" button transitions from `view`
      back to `idle` and clears the previous view (no stale data).
  - `src/lib/phonemes/controller.test.ts` covers the state
    machine: every transition, every cancel, every supersede
    (H0106 invariant preserved).
  - `src/lib/phonemes/error-mapper.test.ts` covers the mapping
    from `SdkFailure` / `PhonemeViewError` to bounded,
    user-readable text.
  - `src/lib/phonemes/client.test.ts` covers the page-side
    request transport: every `PhonemeRequestOutcome` branch.
  - `src/routes/api/phonemes/server.test.ts` covers the endpoint
    boundary: 200, 400 empty body, 413 oversized body
    (Content-Length AND read length), 503 missing URL config,
    bytes forwarded verbatim.
  - `src/routes/read-only-audit.test.ts` greps `src/routes/` and
    `src/lib/` for the forbidden vocabulary (accounts, persistence,
    social, discovery, moderation, editor) so a regression in any
    of them lights up red rather than shipping as a silent
    scope-creep PR.
  - **No** edit / publish / social / accounts / persistence
    controls reach the page. The H04 audit grep is part of the
    test suite.

## Module layout (src/lib/phonemes/)

- `controller.ts` — `PhonemePageController`, a state machine
  parallel to H01's `UploadController` but scoped to the page
  lifecycle. Carries a monotonic `generation` counter so a slow
  supersede cannot overwrite a newer result.
- `error-mapper.ts` — `mapSdkError`, `mapViewError` — bounded,
  UI-safe strings.
- `index.ts` — public barrel; nothing here is mutated, every
  state is `Object.freeze`d.

## Components (src/lib/components/)

- `PhonemeViewer.svelte` — top-level viewer; takes a `PhonemeView`.
- `PhonemeMetadata.svelte` — package header.
- `PhonemeGroupSection.svelte` — one group (consonants / vowels /
  custom).
- `PhonemeRootRow.svelte` — one root + its allophones.
- `PhonemeAllophoneRow.svelte` — one allophone.
- `ConditionTree.svelte` — recursive renderer for `WhenView`.
- `PhonemeDiagnosticsList.svelte` — SDK advisory list.
- `UploadProgress.svelte` — `role="progressbar"` for `validating`.
- `PhonemeErrorBlock.svelte` — typed error display.

## Endpoint (src/routes/api/phonemes/)

- `+server.ts` — `POST` opaque binary body, returns the full
  `SdkValidateResult`. The browser uses this to drive the page
  state machine. The endpoint is the same boundary H01's
  `/api/validate` is (just returns the full payload instead of a
  thin summary); at v0.1.0 ship time the two will live next to
  each other on `release/0.1.0`.
- `server.test.ts` — boundary tests (size cap, JSON shape,
  service-unavailable mapping).

## Page route (src/routes/)

- `+page.svelte` — the page. Replaces the H00 placeholder. Hosts
  the state machine, the file picker, the viewer, the
  replace-file button.

## Quality gates

- `npm run check` — 0 errors / 0 warnings
- `npm run lint` — clean
- `npm test` — every existing test still passes + new H04 tests
- `npm run coverage` — `src/lib/phonemes/**` ≥ 90 % lines;
  component tests cover the rendered branches
- `npm run build` — Cloudflare adapter succeeds

## Read-only invariant (carried from H03)

The viewer never mutates the `PhonemeView`. Every view object is
already frozen on construction; the components render from
properties only, never from reassignments.

## IPA preservation (carried from H03)

The viewer never calls `.normalize()`, `.toLowerCase()`, or
`Array.from(s)` on an IPA string. The HTML wrapper around each
IPA span is `lang="und-fonipa"`; the textContent is set by Svelte
from the view-model string.

## Out of scope (deferred)

- H05 hardening & release.
- Editor / write paths.
- Any account, persistence, publication, discovery, social,
  ranking, duplicate detection or moderation feature.
- WASM-side rendering of the same view model.
- Sharing or downloading the validated view as a JSON file.

## Verification artifacts

- Plan: this document.
- Tracking comment on #6.
- Coverage report: `coverage/lcov.info`.
