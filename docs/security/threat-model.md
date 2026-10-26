# ELANG Hub — Security Threat Model (H0501)

This document records the threats considered for v0.1.0, the controls
that mitigate them, and the threats that are explicitly out of scope
because the Hub has no code path that could reach them. The
boundaries described here are the ones the Hub defends; the deeper
archive-parsing threats are defended by the validation service and
the ELANG Rust SDK it wraps, and that defence is documented in the
SDK's own `docs/security-limits.md` and corroborated by the
H0501-read-only audit at
`/opt/data/cache/delegation/subagent-summary-0-20261026_123429_154801.txt`
(28 KiB; also archived in `docs/security/sdk-audit-2026-10-26.md`).

The Hub's role is intentionally narrow: it accepts a `.elang`
package, forwards the bytes to a separate validation service, and
renders the typed verdict. The page never parses, validates,
unpacks, or otherwise interprets the package itself.

## 1. Trust boundaries

| Boundary                               | Direction | Content                                 | Authority |
| -------------------------------------- | --------- | --------------------------------------- | --------- |
| Browser → Hub page                     | in        | File picker selection (`File`)          | User      |
| Hub page → `/api/phonemes`             | out       | `Uint8Array` (opaque package bytes)     | Hub       |
| `/api/phonemes` → SDK service          | out       | `Uint8Array` (same bytes)               | Hub       |
| SDK service → SDK reader               | out       | `Uint8Array` (same bytes)               | Hub       |
| SDK reader → `inspect/verify/validate` | internal  | typed Rust values                       | SDK       |
| SDK → Hub endpoint                     | back      | `SdkResult` (typed JSON)                | SDK       |
| Hub endpoint → Hub page                | back      | `SdkResult` (same JSON)                 | Hub       |
| Hub page → DOM                         | out       | `SdkResult` fields rendered into Svelte | Hub       |

Every byte that originates in a user selection crosses three
boundaries on the way to a verdict and three more on the way back to
the DOM. Every boundary on the path is documented below.

## 2. What the Hub does NOT do

The following classes of attack are out of scope because the Hub has
no code path that could exercise them, and this is verified by
static inspection (no `fs`/`path`/`writeFile`/`createWriteStream`
imports under `src/`; no `innerHTML`/`outerHTML`/`{@html}`/`eval`/
`new Function`/`document.write` in production code; no
`phonemeResourcePath` is fetched or written):

- **Archive parsing.** The Hub never inspects the package bytes. The
  endpoint forwards them as `Uint8Array`; the page never sees them
  as anything other than opaque bytes.
- **Filesystem writes.** The Hub never writes to disk. It has no
  storage, no cache, no temp files. There is no path-traversal
  risk because there is no path to traverse.
- **Resource extraction.** The Hub never invokes the SDK's `unpack`
  path, so the documented `elang unpack` TOCTOU race
  (`docs/security-limits.md:116`, `symlink_metadata` → `create_new`
  without `O_NOFOLLOW`) does not apply.
- **Symlink interpretation.** The ELANG container format carries no
  symlink entry — the index entry has only path/offset/sizes/
  digest/compression-byte (`crates/elang-container/src/index.rs:483-492`),
  no file-mode or link-target field.

## 3. Decompression bombs

### Defence

The Hub does not decompress anything. The three-layer defence the
SDK applies (`crates/elang-container/src/frame.rs:480-482`,
`crates/elang-core/src/limits.rs:22`, `crates/elang-container/src/
frame.rs:429-458`) is the line of defence for the endpoint's
forwarded bytes:

1. **Frame header is inspected before any decompression** — the
   `inspect` function performs _no_ decode, so a forged header is
   cheap to reject.
2. **Frame must declare its decompressed size** — the field is not
   optional. A bomb's true size is known before a byte is produced.
3. **Window ceiling (128 MiB)** and **per-resource (1 GiB) +
   aggregate (8 GiB) budgets** — checked before allocation, with a
   streaming re-check at `frame.rs:525-533`.

The SDK enforces _absolute byte ceilings_, not a compression-ratio
ceiling. The audit's empirical validation found ~32,700:1 expansion
ratios being accepted (a 2,071 B frame expanding to 64 MiB). The
Hub therefore cannot rely on "the input is small" as a defence; it
must bound the input bytes itself.

### Hub controls

- **Client-side cap (H0503).** `src/lib/upload/limits.ts` rejects
  selections above 16 MiB _before_ the browser buffers the file.
- **Server-side cap.** The endpoint reads the body incrementally
  with a 16 MiB ceiling enforced while reading (mirrors the SDK's
  body cap). A `Content-Length` header above the cap is also
  short-circuited before the body stream is opened.
- **Wall-clock timeout (30 s).** `composeAbortSignal` fires
  regardless of caller cancellation, bounding the Hub's wait for
  the SDK service. This does not guarantee that SDK decompression
  completes within 30 s. A selection within the 16 MiB upload cap
  remains subject to the SDK's absolute limits: a 128 MiB window,
  1 GiB per resource and 8 GiB aggregate. The observed ~32,700:1
  expansion ratio is not a ceiling and does not justify the timeout.
- **No archive-level ceiling on the read path.** The SDK has no
  total-archive-byte cap (`MAX_COMPRESSED_ARCHIVE_BYTES` is
  writer-side only — `docs/security-limits.md:47`, open task
  **T0420**). The Hub's 16 MiB upload cap is the operative ceiling
  on what the SDK ever sees.

### Verification

- Unit tests for `stripTrailingSlashes`, `clampSdkString`,
  `assertBodyWithinLimit`, `composeAbortSignal` in
  `src/lib/sdk/bounds.test.ts`.
- Controller tests for the client-side cap in
  `src/lib/phonemes/controller.test.ts` (rejects a 17 MiB
  selection without calling `stream()`).
- Endpoint tests for the server-side cap in
  `src/routes/api/phonemes/server.test.ts`.

## 4. Path traversal

### Defence

The Hub never writes to disk and never extracts resources, so path
traversal is not a filesystem risk for the Hub. The defence is
structural: there is no path to traverse.

If the Hub ever invokes `elang unpack` (it does not), the SDK
applies its own lexical validation at `crates/elang-core/src/ids.rs:
24-75` (`ResourcePath::new` rejects absolute, drive-absolute,
backslash, NUL, `.`/`..`/empty segments, and paths over 1024 UTF-8
bytes). The validation runs on the _decode_ path at
`crates/elang-container/src/index.rs:452-465` (UTF-8 → NFC →
`ResourcePath::new`), so even a hand-crafted archive cannot
smuggle a traversal payload past the index.

### Hub controls

None — none needed. The page never fetches `phonemeResourcePath`
and the endpoint never writes anything to disk.

## 5. Parser abuse

### Defence

The Hub has no parser. The SDK's parsers (`elang_kdl`, `elang_epf`,
`elang_eld`) carry their own depth guards:

- KDL nesting depth: 64 (`crates/elang-kdl/src/parse.rs:251-256`,
  `crates/elang-core/src/limits.rs:45`). Checked _before_
  recursive descent.
- ELD condition nesting: 8 (`crates/elang-eld/src/when.rs:54,427-438`).
- No JSON or TOML parser in the SDK consumes untrusted input — the
  only `serde_json` use is the embedded IPA repertoire at
  `crates/elang-repertoire/src/repertoire.rs:190,327` (`include_str!`-
  embedded, not attacker-controlled).

### Known gaps in the SDK's parser-abuse story

These are documented in the audit (not new findings of mine):

1. **Archive-wide KDL budgets are declared but not threaded in the
   reader.** `MAX_NODES_PER_ARCHIVE` (10 M, `limits.rs:59`) and
   `MAX_DECODED_STRING_BYTES_PER_ARCHIVE` (1 GiB, `limits.rs:67`)
   exist and the KDL crate supports them — but the convenience
   wrappers (`elang_kdl::parse`, `elang_epf::parse`, `elang_eld::parse`)
   create a fresh `BudgetTracker::new()` per call
   (`crates/elang-kdl/src/parse.rs:52-55`,
   `crates/elang-epf/src/parse.rs:59-60`,
   `crates/elang-eld/src/parse.rs:51` →
   `elang_kdl::parse(input)`). The 8 GiB byte ceiling is the
   effective backstop, so this is a _documentation-vs-implementation
   divergence_, not an unbounded-memory hole.
2. **`MAX_RETAINED_DIAGNOSTICS` (100) is unused in production.**
   Harmless because the reader fails fast on the first error
   (`crates/elang-reader/src/stages.rs:124`, CLI
   `crates/elang-cli/src/main.rs:507-512`). Diagnostic flooding
   is therefore not a concern — the opposite design.
3. **`MAX_SEMANTIC_REFERENCES` / `MAX_SEMANTIC_TRAVERSAL_DEPTH` are
   declared but unenforced** — reserved for ELD's semantic phase
   (`docs/security-limits.md:155-156`).
4. **No end-to-end archive-level fuzz target.** All fuzzing is
   component-level. A mutated-whole-`Package::open`→`validate`
   target does not exist.

### Hub controls

The Hub caps the number of diagnostics the SDK can surface to the
DOM at `MAX_SDK_DIAGNOSTICS = 200` (H0502), so even a service that
returns a large diagnostic array cannot blow up the page render.

## 6. Unsafe rendering and injection

### Defence

The Hub's render layer is Svelte. Svelte's default template
escapes every interpolation as HTML-entity text, so a package-
controlled string in `{diagnostic.message}` is rendered as inert
text. The audit (`rg '{@html|innerHTML|outerHTML|eval|new Function|
document.write' src/`) found zero production occurrences.

A Content Security Policy (`script-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`, `connect-src 'self'`) is configured on the
Kit 3 Vite plugin (`vite.config.ts`) as defence in depth.

### Hub controls

- **`MAX_SDK_STRING_LENGTH = 4096`** clamps every string the
  client receives from the SDK (`diagnostic.message`,
  `diagnostic.path`, failure `message`, failure `path`,
  `phonemeResourcePath`) at the boundary. Truncation is marked
  with `…` so a screen-reader user is not told the text ended
  naturally.
- **`MAX_SDK_DIAGNOSTICS = 200`** caps the diagnostic array length.
- **`stripTrailingSlashes`** replaces the previous quadratic
  `replace(/\/+$/, '')` at the URL boundary with a linear scan. A
  regression test runs 200 k slashes through the scan with a time
  budget the previous implementation could not meet.
- **Super-linear pattern grep** — no `*$`, `+$`, `*?`, `+?` regexes
  over user-controlled or environment-controlled strings remain
  in `src/`.

### Verification

- `src/lib/sdk/bounds.test.ts` — `stripTrailingSlashes` and
  `clampSdkString` tests, including the 200 k-slash regression
  pin.
- `src/lib/sdk/client.test.ts` — hostile-response handling:
  oversized `phonemeResourcePath`, oversized failure message /
  path, oversized diagnostic message / path, diagnostic-count cap,
  HTML/script-like content carried verbatim, non-string diagnostic
  message dropped.

## 7. Privacy, cleanup and error recovery (H0503)

### Defence

- **No persistence.** The Hub has no database, no cache, no storage.
  The endpoint does not write the body to disk. The page holds the
  bytes only for the duration of one validation run; the controller
  emits a `view` or `error` state and the `File` reference is
  dropped when the page transitions to `idle` (via `replace` or
  `cancel`).
- **No telemetry.** The Hub has no analytics, no beacons, no
  remote logging. The endpoint never logs the body. This is
  enforced on every CI run by `src/routes/privacy-audit.test.ts`,
  which re-reads the shipped source and fails the build if any
  console log, client-side storage call, beacon, filesystem write
  or hardcoded third-party `fetch` URL appears.
- **Reset / cancel / failure cleanup.** Every controller transition
  to `idle` increments the generation counter and aborts any
  in-flight `AbortSignal`, so a slow run cannot overwrite a
  subsequent run's state. The bytes are forwarded to the endpoint
  via `request(bytes, …)` and dropped on response.
- **Replaced files do not leak.** A second `select(file)` call
  aborts the previous `AbortController` and supersedes the
  in-flight run. The streaming read is cancelled
  (`reader.cancel().catch(() => {})`).
- **Environment-controlled secrets are typed.** `SDK_SERVICE_URL` is
  declared in `src/env.ts` via `defineEnvVars` from
  `@sveltejs/kit/env` and imported as a typed named binding from
  `$app/env/private`. There is no `process.env` access in
  production code (`rg 'process\.env' src/`).

## 8. Accessibility and supported browsers (H0504)

See `docs/accessibility.md` for the full H0504 record. Summary:
keyboard flows are exercised through the four-phase state machine;
`aria-label` and `aria-live` regions are wired; IPA strings carry
`lang="und-fonipa"`; contrast meets WCAG AA on the documented
backgrounds. Browser support matrix is pinned in
`package.json > browserslist` (Chrome/Edge ≥ 111, Firefox ≥ 128,
Safari/iOS Safari ≥ 16.4).

## 9. Performance and resource budgets (H0506)

See `docs/resource-budgets.md` for the full H0506 record. Summary:
all input sizes are bounded at every boundary, every operation
carries a wall-clock timeout or `AbortSignal`, and the rendering
budget is finite (`MAX_SDK_DIAGNOSTICS`, `MAX_SDK_STRING_LENGTH`).

The bounds are pinned by `src/routes/budgets.test.ts`, which drives
the real SDK client, the real page controller and the real viewer
at the documented ceilings — including the upstream SDK's inventory
ceilings of 16 groups, 256 roots and 16 allophones per root.

## 10. Cancellation and bounded processing (H0506)

Every fetch the Hub initiates carries an `AbortSignal`:

- The SDK call composes the caller's signal with a 30 s timeout
  (`composeAbortSignal`). Cancellation propagates to the network
  read.
- The page's file-stream reader honours the controller's signal
  between chunks and cancels the underlying stream on abort
  (`reader.cancel().catch(() => {})`).
- The endpoint's body reader releases the lock in a `finally` and
  cancels on oversize detection
  (`void reader.cancel().catch(() => {})`).

A stale response cannot win a race with a newer selection: the
controller's monotonic generation counter gates every state
transition (H0408).
