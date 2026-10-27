# H02 — SDK Validation Implementation Plan

**Branch**: `feat/4-hubv010h02-sdk-validation`
**Base**: `release/0.1.0` (no rebase, no merge from main)
**Target PR base**: `release/0.1.0`
**Issue**: #4 [HUB][v0.1.0][H02] SDK Validation
**Workflow rule**: Everything moves from `release/0.1.0`. At v0.1.0 ship time, `release/0.1.0` → `main`.

## Architecture (per ADR 0001)

Hub does NOT parse ELANG. The authoritative `elang-rs` SDK does.
The Hub consumes the SDK through one boundary. Per ADR 0001, that boundary is a **separate validation service** (Fly.io) that wraps the `elang` CLI. The Hub speaks HTTP to that service.

For H02, the Hub-side deliverable is:

1. A typed SDK adapter module (`src/lib/sdk/`) that talks to the validation service.
2. A version-compatibility gate that rejects unsupported binary/schema versions.
3. A diagnostic mapper (`src/lib/sdk/errors.ts`) that turns SDK/service failures into bounded, escape-safe user-facing messages.
4. Resource bounds (`src/lib/sdk/bounds.ts`) — time, body, decompression — applied at the adapter boundary.
5. Tests covering malformed containers, corrupted resources, incompatible versions, invalid ELD, and resource exhaustion.

## Tasks

- [ ] **H0201** — Implement the ELANG SDK adapter
  - Files: `src/lib/sdk/contract.ts` (types), `src/lib/sdk/client.ts` (HTTP), `src/lib/sdk/index.ts`
  - Boundary: opaque bytes in, typed result out. No parsing in Hub.
- [ ] **H0202** — Integrate inspect mode
  - Adapter exposes `inspect(bytes, opts)`; never present inspect alone as integrity verification.
- [ ] **H0203** — Integrate verify mode
  - Adapter exposes `verify(bytes, opts)`; SHA-256 integrity required before reporting success.
- [ ] **H0204** — Integrate validate mode
  - Adapter exposes `validate(bytes, opts)`; requires inspect + verify + descriptor + ELD before reporting success.
- [ ] **H0205** — Enforce supported version compatibility
  - `SUPPORTED_SPEC = "0.1.0"`, `SUPPORTED_BINARY_CONTAINER = "0.1.0"`. Reject mismatches explicitly. Distinguish spec version vs binary container version.
- [ ] **H0206** — Map SDK diagnostics to user-facing errors
  - Typed error codes (12, mirroring H01's upload errors). Preserve stage. Escape content. Bound length.
- [ ] **H0207** — Bound processing resources
  - Time budget, body cap (16 MiB), decompression cap, AbortSignal on every call.
- [ ] **H0208** — Test validation stage boundaries
  - Vitest fixtures for: malformed container, corrupted resource, incompatible spec version, incompatible binary container, invalid ELD, oversized package, timeout, cancellation. Verify only fully validated packages reach a success result.

## Quality gates

- `npm run check` — 0 errors
- `npm run lint` — clean
- `npm test` — all pass (fast feedback loop, no coverage)
- `npm run coverage` — full V8 coverage report; consumed by CI
- `npm run build` — Cloudflare adapter succeeds
- Codecov (CI) — uploads `coverage/lcov.info` to
  https://app.codecov.io/github/rockydevworks/elang-hub; currently
  no enforcement gate (v0.1.0 is informational only)

## CI

The CI test job is named `Test (Vitest) + Codecov` and runs:

1. `npm ci` — clean install
2. `svelte-kit sync` — materialise the SvelteKit tsconfig
3. `npm run coverage` — vitest with V8 coverage
4. `codecov-action@v5` — upload `coverage/lcov.info`

Codecov upload is best-effort (`continue-on-error: true`). On
protected branches Codecov may require a `CODECOV_TOKEN` repo
secret — the action is already wired to pass it when present.

## Out of scope (deferred to other phases)

- H01 upload infrastructure lives on `main`, not on this branch. The adapter contract in H02 will be the boundary H01 consumes when release merges to main.
- Phoneme view model (H03 / issue #5)
- Phonemes page (H04 / issue #6)
- Hardening & release (H05 / issue #7)
