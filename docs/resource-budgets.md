# Resource budgets (H0506)

The Hub bounds every input that crosses a trust boundary, every
output that reaches the DOM, and every operation that depends on
the network or the user's patience. The constants below are the
public contract; the tests in `src/routes/budgets.test.ts` pin them
at the layers the Hub owns, and the upstream SDK enforces the
inventory ceilings before the Hub ever sees the payload.

A defence-in-depth principle runs through this list: the client
catches pathological input before any byte is read; the SDK adapter
catches it again before any byte is sent; the validation service
enforces the inventory's own invariants; and every layer times
itself so an unresponsive downstream cannot wedge the request
thread.

---

## Hard limits

| Limit                    | Constant                 | Value                             | Enforced at                                                                                                                  | Pinned by                                                                             |
| ------------------------ | ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Client upload cap        | `MAX_FILE_BYTES`         | 16 MiB                            | `PhonemePageController.select` (before any read) and the browser file input                                                  | `src/routes/budgets.test.ts` (at-cap accepted, one-byte-over rejected, no fetch made) |
| Server body cap          | `MAX_SDK_BODY_BYTES`     | 16 MiB                            | `src/routes/api/phonemes/+server.ts` and `SdkClient.assertBodyWithinLimit`                                                   | `src/lib/sdk/client.test.ts` and `src/routes/api/phonemes/server.test.ts`             |
| Response body cap        | `MAX_SDK_RESPONSE_BYTES` | 4 MiB                             | `SdkClient` while reading the response stream                                                                                | `src/routes/budgets.test.ts` (one byte over → `malformed_response`)                   |
| Diagnostic cap           | `MAX_SDK_DIAGNOSTICS`    | 200                               | `SdkClient` after parsing                                                                                                    | `src/routes/budgets.test.ts` (201 returned → 200 kept)                                |
| String cap               | `MAX_SDK_STRING_LENGTH`  | 4 096 code units (`+ 1` ellipsis) | `SdkClient` via `clampSdkString`                                                                                             | `src/routes/budgets.test.ts` (over-cap → `…`-terminated, length `MAX + 1`)            |
| Round-trip timeout       | `DEFAULT_SDK_TIMEOUT_MS` | 30 s                              | `SdkClient` via `composeAbortSignal`                                                                                         | `src/routes/budgets.test.ts` (1 ms timeout → `timeout` code)                          |
| File count per selection | `MAX_FILE_COUNT`         | 1                                 | Page file input (no `multiple` attribute); the page handler selects the first file of a multi-file drop and ignores the rest | `src/routes/budgets.test.ts` (picker has no `multiple`)                               |

The client and server caps are pinned to the same value by
`src/lib/upload/limits.test.ts` so the two cannot drift apart.

---

## Inventory ceilings (inherited from the upstream SDK)

The validation service enforces these caps and rejects over-ceiling
payloads upstream. The Hub never enforces them itself; it assumes
anything `elang validate` accepted is ground truth. The Hub DOES
exercise the ceilings in its rendering path so a regression in the
view layer is caught even though the ceilings themselves are
guaranteed by the SDK.

| Ceiling                         | Value | Source                                  | Pinned by                                                    |
| ------------------------------- | ----- | --------------------------------------- | ------------------------------------------------------------ |
| Groups in an inventory          | 16    | `crates/elang-core/src/model/eld.rs:28` | `src/routes/budgets.test.ts` (16-group render)               |
| Root phonemes across all groups | 256   | `crates/elang-core/src/model/eld.rs:30` | `src/routes/budgets.test.ts` (256-root render)               |
| Allophones per root             | 16    | `crates/elang-core/src/model/eld.rs:26` | `src/routes/budgets.test.ts` (16-allophones-per-root render) |

The worst-case combined inventory the SDK can ever produce is
`16 × 256 × 16 = 65 536` allophones. Rendering all of it in one go
stresses the DOM harder than it stresses the Hub's correctness, so
the ceilings are exercised independently — the Hub's job is to
render whatever the SDK emits; the SDK's job is to refuse anything
it shouldn't.

---

## Cancellation and bounded processing

Every Hub-side operation carries a wall-clock cap or an
`AbortSignal`, and every operation composes them so an adversarial
or pathological input cannot wedge the request thread:

- **Caller signal.** `SdkClient.validate(..., opts)` honours
  `opts.signal` before the service is contacted (line 110) and
  after (line 187). A caller abort is reported as `cancelled`, not
  `timeout` — the UI offers "try another file", not "the service
  is slow".
- **Internal timeout.** `composeAbortSignal` composes a
  caller-owned signal with an internal timer so the round-trip
  always has a deadline. The composed signal is fresh every call so
  callers can pass a reusable signal without leaking a previous
  run's abort.
- **Page controller.** `PhonemePageController` runs every
  selection with its own `AbortController`; `controller.cancel()`
  aborts the in-flight run, bumps the generation counter, and
  returns to `idle`. A slow run that finishes after a replacement
  upload is a no-op — the generation guard short-circuits every
  callback so a stale response never overwrites a fresh one.
- **Supersede.** Every new `select` aborts the previous run and
  bumps the generation. Tests pin both the abort behaviour and the
  bounded emission count across many sequential uploads.

These properties are pinned by `src/routes/budgets.test.ts` in the
"cancellation and bounded processing" describe block.

---

## Why each bound is what it is

- **16 MiB upload cap** matches the upstream SDK's
  `MAX_SDK_BODY_BYTES` and the H01 page's historical limit.
  Anything larger is rejected before any byte is read into browser
  memory, so a 2 GB selection cannot exhaust the tab before the
  page complains.
- **4 MiB response cap** caps memory growth from a malicious or
  pathological service response (e.g. a JSON payload shaped like a
  zip bomb). The cap is enforced mid-read, before the body is
  buffered.
- **200 diagnostics** is a render budget: every entry is rendered
  as a list item, so an unbounded array would grow the DOM
  unboundedly. 200 entries are enough to surface every meaningful
  failure without ever producing an unbounded render.
- **4 096 code units per string** is the threshold above which a
  package-controlled string becomes an unbounded layout cost, an
  unbounded DOM node, and an unbounded copy of attacker-chosen
  bytes in memory. The ellipsis marker (`…`) is appended so a
  screen-reader user is never told the text ended naturally.
- **30 s round-trip timeout** matches the upstream SDK's
  `DEFAULT_SDK_TIMEOUT_MS` and is short enough that a wedged
  service cannot strand a user, long enough that a real
  validation of a multi-megabyte package can complete.

---

## Where the budgets are not enforced

- **Archive parsing.** The Hub does not parse `.elang` archives
  and has no filesystem-write path of its own. Archive and parser
  security is an SDK / validation-service concern; the
  `docs/security/sdk-audit-2026-10-26.md` record covers the
  delegated boundary.
- **Inventory content.** The Hub does not validate IPA repertoire,
  group cardinalities, uniqueness, or reference resolution. The
  SDK has done that work upstream.
- **Service availability.** The Hub cannot bound the validation
  service's latency beyond the 30 s timeout; that is the
  upstream's concern. The Hub surfaces a typed `service_unavailable`
  or `timeout` failure and the user can retry.

---

## Privacy invariants

The Hub never persists or transmits the package bytes outside the
single round-trip to the validation service on the same origin
(`.connect-src 'self'`). No client-side storage (no `localStorage`,
no `sessionStorage`, no `indexedDB`, no `Cache Storage`), no
telemetry, no `console.*`, no third-party `fetch` URLs, and no
server-side filesystem writes. The invariants are enforced by
`src/routes/privacy-audit.test.ts` rather than merely documented;
see `docs/security/threat-model.md` for the threat model.

---

## Adding a new bound

When a new bound is introduced:

1. Declare it in `src/lib/sdk/bounds.ts` (or `src/lib/upload/limits.ts`
   for client-side limits) with the JSDoc explaining what it caps
   and why.
2. Enforce it at the smallest layer that can do so without
   ambiguity (the SDK adapter for service-bound limits, the page
   controller for client-bound limits).
3. Pin it in `src/routes/budgets.test.ts` with one "accepts at the
   cap" test and one "rejects one byte over" test. Both assertions
   are required: the positive case proves the cap is wired in, the
   negative case proves the cap is bounded.
4. Add a row to the table above.
