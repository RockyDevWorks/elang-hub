# Accessibility & browser support — H0504 record

The H0504 task is _"Run accessibility and supported-browser checks. Verify
keyboard/screen-reader flows, contrast, responsive layouts and IPA rendering on
the documented browser support matrix."_

This document is the record of what was checked, how it was checked, what was
found, and what was changed. Every number below was produced by a command in
this repository; none of it is asserted from documentation memory.

## 1. Scope

| Surface                                                                                                                              | Covered by                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `UploadPrompt`, `UploadProgress`, `PhonemeErrorBlock`, `PhonemeViewer`, `PhonemeDiagnosticsList`, `ConditionTree`, `PhonemeMetadata` | `src/lib/components/accessibility.test.ts`            |
| Every foreground/background colour pair in the component CSS                                                                         | `src/lib/components/contrast.test.ts`                 |
| Browser matrix and the CSS/JS the build actually emits                                                                               | `package.json > browserslist`, `npm run build` output |

## 2. How to re-run the checks

```bash
npx svelte-kit sync
npx vitest run src/lib/components/accessibility.test.ts src/lib/components/contrast.test.ts
npm run build
```

Both suites are part of `npm test` / `npm run coverage`, so CI runs them on
every push. They are not opt-in.

## 3. Automated rule checks (axe-core)

`axe-core@4.10.2` runs against each component rendered in happy-dom, with
`runOnly` set to the WCAG 2.1 A/AA tag set (`wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`). A violation fails the test with the offending node's target
selector in the message — a violation is a defect, not a warning.

Ten axe cases run: one per component, plus an empty-inventory viewer and a
nested-condition tree.

### Rule coverage and exclusions

Only `color-contrast` is excluded from the axe checks.

| Rule                                         | axe coverage / reason for exclusion                                                  | Additional or alternative coverage                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `color-contrast`                             | Needs layout and paint; happy-dom implements neither, so axe cannot compute a ratio. | `contrast.test.ts` computes the ratios from the source CSS — see §5.                             |
| `aria-allowed-attr`, `aria-valid-attr-value` | Included in the WCAG 2.1 A/AA axe checks.                                            | Direct ARIA assertions in the keyboard/screen-reader suite provide additional coverage — see §4. |

### The exclusion is not a blind spot

axe-core is not trusted to pass silently. A temporary sanity suite asserted
that `image-alt`, `button-name` and `nested-interactive` are each reported as
violations when deliberately broken; all three were flagged, then the suite
was deleted. The same was done for `contrast.test.ts`: deliberately regressing
the body text and the drop-zone border made the guard fail with
`measured 1.51:1: expected … to be greater than or equal to 3`.

## 4. Keyboard and screen-reader flows

| Flow                             | Affordance                                                                                                                                                                                                          | Verified by                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reach the file picker            | A real `<button type="button">`, so it is in the tab order and activates on Enter/Space.                                                                                                                            | `exposes the picker as a real button`                                                                                                                                                               |
| Open the file dialog             | The button calls `fileInput.click()`; the input itself is `tabindex="-1"`. A focusable, visually hidden file input would add a second tab stop that opens a dialog on Enter and is announced as an unnamed control. | `keeps the hidden file input out of the tab order`                                                                                                                                                  |
| Know what the drop zone is       | `role="region"` with a non-empty `aria-label`.                                                                                                                                                                      | `exposes the drop zone as a named region`                                                                                                                                                           |
| See focus                        | Every interactive element has a `:focus-visible` outline: `2px solid rgb(37 99 235)`, 5.17:1 on white and 4.72:1 on the error fill.                                                                                 | `contrast.test.ts` (focus-ring pairs)                                                                                                                                                               |
| Hear progress                    | `role="status"` with `aria-live="polite"`, wrapping the progress bar.                                                                                                                                               | `announces validation progress politely`                                                                                                                                                            |
| Know how far along               | `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, the value clamped to 0–100.                                                                                                          | `exposes the progress bar with a bounded value`                                                                                                                                                     |
| Hear a failure                   | `role="alert"` on the error block — asserted, not interruptive.                                                                                                                                                     | `announces errors assertively`                                                                                                                                                                      |
| Cancel a running validation      | A focusable `Cancel` button in the progress panel.                                                                                                                                                                  | Component structure; the button is a native `<button>`.                                                                                                                                             |
| Recover from an error            | A focusable "choose another file" button in the error block and in the page header.                                                                                                                                 | Component structure; native `<button>`.                                                                                                                                                             |
| Skip the header to the inventory | A `Skip to inventory` link, off-screen until focused, then visible on a dark fill with white text (17.74:1).                                                                                                        | `PhonemeViewer.svelte`                                                                                                                                                                              |
| Read IPA correctly               | Every IPA span carries `lang="und-fonipa"`, so a screen reader switches voice instead of reading the symbols as prose.                                                                                              | `marks IPA strings with the und-fonipa language so screen readers switch voice`; also asserted per-component in `PhonemeRootRow.test.ts`, `PhonemeAllophoneRow.test.ts` and `ConditionTree.test.ts` |
| Reach a group section            | An in-page `<nav aria-label="Inventory sections">` with anchor links to each group.                                                                                                                                 | `PhonemeViewer.svelte`                                                                                                                                                                              |

## 5. Contrast

WCAG 2.1 success criteria applied:

- **1.4.3 Contrast (Minimum)** — 4.5:1 for normal text.
- **1.4.11 Non-text Contrast** — 3:1 for the visual boundary of a user
  interface component and for focus indicators.

`src/lib/components/contrast.test.ts` reads the component CSS, extracts the
`rgb(...)` literal from the specific declaration that matters, and computes the
WCAG relative-luminance ratio against the documented background. 33 pairs are
checked; the table below is the enforced set. A 34th test asserts that the
component list in the guard still matches the directory, so adding a component
without extending the guard fails the suite.

| Pair                                              | Foreground         | Background         | Min   | Measured |      |
| ------------------------------------------------- | ------------------ | ------------------ | ----- | -------- | ---- |
| body text on page background                      | `rgb(17 24 39)`    | `rgb(249 250 251)` | 4.5:1 | 16.98:1  | pass |
| muted text on page background                     | `rgb(75 85 99)`    | `rgb(249 250 251)` | 4.5:1 | 7.23:1   | pass |
| subtle muted text on white                        | `rgb(107 114 128)` | `rgb(255 255 255)` | 4.5:1 | 4.83:1   | pass |
| brand link/button text on white                   | `rgb(37 99 235)`   | `rgb(255 255 255)` | 4.5:1 | 5.17:1   | pass |
| white on brand fill (primary button label)        | `rgb(255 255 255)` | `rgb(37 99 235)`   | 4.5:1 | 5.17:1   | pass |
| white on brand hover fill                         | `rgb(255 255 255)` | `rgb(29 78 216)`   | 4.5:1 | 6.70:1   | pass |
| error heading on error fill                       | `rgb(153 27 27)`   | `rgb(254 242 242)` | 4.5:1 | 7.60:1   | pass |
| error body on error fill                          | `rgb(127 29 29)`   | `rgb(254 242 242)` | 4.5:1 | 9.16:1   | pass |
| error block muted filename on error fill          | `rgb(75 85 99)`    | `rgb(254 242 242)` | 4.5:1 | 6.91:1   | pass |
| advisory heading on advisory fill                 | `rgb(146 64 14)`   | `rgb(254 252 232)` | 4.5:1 | 6.85:1   | pass |
| advisory body on advisory fill                    | `rgb(120 53 15)`   | `rgb(254 252 232)` | 4.5:1 | 8.77:1   | pass |
| IPA blue on white                                 | `rgb(30 58 138)`   | `rgb(255 255 255)` | 4.5:1 | 10.36:1  | pass |
| inventory summary blue on white                   | `rgb(30 64 175)`   | `rgb(255 255 255)` | 4.5:1 | 8.72:1   | pass |
| metadata identifier on white                      | `rgb(75 85 99)`    | `rgb(255 255 255)` | 4.5:1 | 7.56:1   | pass |
| metadata `dt` on white                            | `rgb(107 114 128)` | `rgb(255 255 255)` | 4.5:1 | 4.83:1   | pass |
| group section title on white                      | `rgb(17 24 39)`    | `rgb(255 255 255)` | 4.5:1 | 17.74:1  | pass |
| group section muted on white                      | `rgb(107 114 128)` | `rgb(255 255 255)` | 4.5:1 | 4.83:1   | pass |
| root row muted on white                           | `rgb(107 114 128)` | `rgb(255 255 255)` | 4.5:1 | 4.83:1   | pass |
| root row roman on white                           | `rgb(75 85 99)`    | `rgb(255 255 255)` | 4.5:1 | 7.56:1   | pass |
| allophone row roman on white                      | `rgb(75 85 99)`    | `rgb(255 255 255)` | 4.5:1 | 7.56:1   | pass |
| allophone row kind on white                       | `rgb(107 114 128)` | `rgb(255 255 255)` | 4.5:1 | 4.83:1   | pass |
| condition summary on white                        | `rgb(75 85 99)`    | `rgb(255 255 255)` | 4.5:1 | 7.56:1   | pass |
| condition nested on white                         | `rgb(55 65 81)`    | `rgb(255 255 255)` | 4.5:1 | 10.31:1  | pass |
| drop-zone boundary on white (the drag affordance) | `rgb(140 140 140)` | `rgb(255 255 255)` | 3:1   | 3.36:1   | pass |
| drop-zone drag-state border on drag fill          | `rgb(37 99 235)`   | `rgb(239 246 255)` | 3:1   | 4.75:1   | pass |
| drop-zone helper text on the drag-state fill      | `rgb(75 85 99)`    | `rgb(239 246 255)` | 4.5:1 | 6.94:1   | pass |
| progress-bar fill on track                        | `rgb(37 99 235)`   | `rgb(229 231 235)` | 3:1   | 4.17:1   | pass |
| cancel-button border on white                     | `rgb(107 114 128)` | `rgb(255 255 255)` | 3:1   | 4.83:1   | pass |
| replace-button border on white (page)             | `rgb(107 114 128)` | `rgb(255 255 255)` | 3:1   | 4.83:1   | pass |
| replace-button border on error fill               | `rgb(107 114 128)` | `rgb(254 242 242)` | 3:1   | 4.42:1   | pass |
| focus ring on white                               | `rgb(37 99 235)`   | `rgb(255 255 255)` | 3:1   | 5.17:1   | pass |
| focus ring on error fill                          | `rgb(37 99 235)`   | `rgb(254 242 242)` | 3:1   | 4.72:1   | pass |
| skip link label on its dark focus fill            | `rgb(255 255 255)` | `rgb(17 24 39)`    | 4.5:1 | 17.74:1  | pass |

### Findings and fixes

Four contrast failures were found and fixed in this task. All four were real
defects, not stylistic preferences.

1. **Drop-zone boundary — 1.47:1 (needed 3:1).** The dashed border _is_ the
   drag affordance; there is no other visual signal that the region accepts a
   dropped file. Changed from `rgb(209 213 219)` to `rgb(140 140 140)`
   (3.36:1).
2. **Secondary-button borders — 1.47:1 on white, 1.35:1 on the error fill
   (needed 3:1).** The "choose another file" and "cancel" buttons are white
   fills; against the error fill the surface difference is 1.03:1, so the
   border is the only cue that the surface is a control. Changed from
   `rgb(209 213 219)` to `rgb(107 114 128)` — 4.83:1 on white, 4.42:1 on the
   error fill.
3. **Drop-zone helper text on the drag-state fill — 4.44:1 (needed 4.5:1).**
   The default muted grey only fails against the blue drag tint. Added
   `.drop-zone.dragging .muted { color: rgb(75 85 99); }` — 6.94:1.
4. **Error-block muted filename — 4.42:1 (needed 4.5:1).** Same cause as (3):
   `rgb(107 114 128)` against the error fill. Changed to `rgb(75 85 99)` —
   6.91:1.

### Borders that are deliberately left light

Some borders sit below 3:1 and are **not** violations of 1.4.11, because the
boundary is not the information required to identify the component or its
state — the component is already identified by its own text:

- Card, group, metadata and row separators (`rgb(229 231 235)`) — decorative
  rules between content blocks.
- The error block's border (`rgb(252 165 165)`, 1.74:1) and the advisory
  panel's border (`rgb(252 211 77)`, 1.39:1) — the error and advisory states
  are carried by the panel background, the icon, the heading colour and
  `role="alert"`.
- Diagnostic code chips (`rgb(252 211 77)`) — the code text itself is the
  content.

Raising these would be cosmetic churn, not compliance. If the design later
relies on a border as the sole carrier of meaning, it must be added to the
guard table.

## 6. Responsive layout

- `src/app.html` sets `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- The page has one breakpoint, `@media (min-width: 640px)` in
  `src/routes/+page.svelte`, which is where the two-column layout collapses
  to one.
- The metadata grid uses `repeat(auto-fit, minmax(12rem, 1fr))`, so it
  reflows to a single column when the viewport is too narrow for two 12rem
  tracks without a media query.
- Long IPA strings and diagnostic messages wrap rather than overflow; the
  viewer uses flex-column with `flex-wrap` on the rows.

## 7. IPA rendering

The Hub renders IPA strings byte-exactly (H0303), so the font stack must
cover the BMP, the supplementary-plane IPA blocks, combining diacritics and
tie bars.

- Stack: `Doulos SIL`, `Charis SIL`, `Gentium Plus`, `Doulos SIL Web`,
  `Gentium`, `DejaVu Sans`, `serif` — declared as `--ipa-font-stack` in
  `src/app.css`.
- Fonts are SIL OFL licensed and CDN-served; there is no build-time
  bundling, so the cached payload stays small.
- `:lang(und-fonipa)` applies the stack, sets `font-feature-settings: 'kern'`
  so spacing modifiers and letter pairs kern correctly, and sets
  `font-variant-ligatures: no-common-ligatures` — without this, the default
  `fi`/`fl` ligature clips a combining tilde bar.
- When none of the SIL fonts are available the stack falls back to the user
  agent's serif, so the page still renders IPA — just less precisely.

## 8. Browser support matrix

Declared in `package.json > browserslist`, which is what Autoprefixer and
Tailwind's Vite plugin target:

```json
["chrome >= 111", "edge >= 111", "firefox >= 128", "safari >= 16.4", "ios_saf >= 16.4"]
```

Node: `>=22.17` (`package.json > engines`).

### Why these floors

The floors are set by the CSS the build actually emits, not by guesswork. The
built client CSS was inspected:

| Emitted feature                            | Minimum browser support              | Effect on the floor                          |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| `@property` (35 occurrences)               | Chrome 85, Safari 16.4, Firefox 128  | Sets **Safari ≥ 16.4** and **Firefox ≥ 128** |
| `oklch()`                                  | Chrome 111, Safari 15.4, Firefox 113 | Sets **Chrome/Edge ≥ 111**                   |
| `color-mix()`                              | Chrome 111, Safari 16.2, Firefox 113 | Reinforces **Chrome/Edge ≥ 111**             |
| `:is()`, `:where()`, `@layer`, `@supports` | widely available                     | no effect                                    |

Tailwind 4 emits `@supports` fallbacks for browsers that lack `@property`
(the built CSS contains `@supports (color:color-mix(in lab, red, red))` and a
`-webkit-hyphens`/`margin-trim` fallback block), so the page **degrades**
below the floors rather than breaking. The matrix is the supported contract,
not the point at which the page stops rendering.

The client bundle contains no modern built-ins that would raise the floor
(`Object.groupBy`, `Array.fromAsync`, `toSorted`, `structuredClone`,
`AbortSignal.timeout` are all absent), and Vite's default
`baseline-widely-available` target applies.

### iOS Safari

iOS Safari shares the Safari engine, so it inherits the Safari ≥ 16.4 floor.
The one iOS-specific caveat is drag-and-drop: the Hub's drop zone is a
progressive enhancement over the keyboard-reachable file picker button, which
works on every listed browser. No capability is drag-and-drop-only.

## 9. Known limitations

These are real gaps, recorded rather than papered over:

- **No real-browser screen-reader pass.** axe-core plus direct ARIA assertions
  cover the machine-checkable contract, but NVDA/JAWS/VoiceOver have not been
  driven by hand. Manual screen-reader testing is a follow-up.
- **No colour-contrast check in a layout engine.** The ratios are computed
  from the source CSS, which is exact for the flat colour pairs the Hub uses.
  It would not catch a gradient, an image behind text, or a translucent
  overlay — the Hub has none today, but a future change could introduce one.
- **`color-contrast` is disabled in axe**, for the reason above. If the Hub
  ever renders text over an image or a gradient, that rule must be re-enabled
  in a browser-based test rather than left disabled.
- **The browser matrix is a CSS-support contract.** It does not assert
  behaviour on those browsers; there is no cross-browser test run in CI.

## 10. Change log — H0504

| File                                          | Change                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/accessibility.test.ts`    | New. axe-core WCAG 2.1 A/AA over 10 component cases, plus 7 keyboard/screen-reader assertions.                                                 |
| `src/lib/components/contrast.test.ts`         | New. 33 enforced colour pairs + a component-list completeness check.                                                                           |
| `src/lib/components/UploadPrompt.svelte`      | Drop-zone boundary darkened to 3.36:1; drag-state helper text darkened to 6.94:1; hidden file input given `tabindex="-1"` and an `aria-label`. |
| `src/lib/components/UploadProgress.svelte`    | Cancel-button border darkened to 4.83:1.                                                                                                       |
| `src/lib/components/PhonemeErrorBlock.svelte` | Replace-button border darkened to 4.42:1 on the error fill; muted filename line darkened to 6.91:1.                                            |
| `src/routes/+page.svelte`                     | Replace-button border darkened to 4.83:1.                                                                                                      |
| `package.json`                                | `axe-core@^4.10.2` added as a devDependency.                                                                                                   |
