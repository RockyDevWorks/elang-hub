# ADR 0001: Architecture and Deployment Strategy

## Status

Accepted

## Context

ELANG Hub v0.1.0 is a read-only phoneme viewer that accepts `.elang` v0.1.0 packages, validates them via the ELANG Rust SDK, and renders phonological data in a web interface.

Key constraints:

- The authoritative ELANG validation logic lives in `elang-rs` (Rust)
- `elang-rs` does not currently provide WASM bindings
- Server-side execution of the Rust CLI is required for validation
- v0.1.0 scope: upload → validate → render (no accounts, persistence, discovery, or social features)

## Decision

### Frontend Stack

**SvelteKit** with the following technologies:

- **Language:** TypeScript
- **Build tool:** Vite (bundled with SvelteKit)
- **Styling:** Tailwind CSS
- **Component library:** shadcn-svelte (accessible, customizable components)
- **Icons:** Lucide icons
- **Deployment:** Cloudflare Workers via `@sveltejs/adapter-cloudflare`

**Compatibility note:** The emitted static assets remain compatible with Cloudflare Pages.

**Rationale:**

- SvelteKit provides excellent DX, flexible rendering (SSR/SSG/CSR), and strong TypeScript support
- Tailwind CSS enables rapid UI development with consistent design
- shadcn-svelte delivers accessible, well-tested components without heavy framework lock-in
- Cloudflare Workers provides global edge execution for the SvelteKit frontend via the adapter’s Workers entry point

### Pinned major versions

The Hub pins its framework majors explicitly. The SvelteKit 3 and
Tailwind 4 upgrades were tracked in [issue #20](https://github.com/RockyDevWorks/elang-hub/issues/20)
and ship in v0.1.0.

| Package                             | Pinned major | Version at v0.1.0 |
| ----------------------------------- | ------------ | ----------------- |
| `@sveltejs/kit`                     | 3            | `^3.1.0`          |
| `@sveltejs/adapter-cloudflare`      | 8            | `^8.0.1`          |
| `@sveltejs/vite-plugin-svelte`      | 7            | `^7.3.1`          |
| `svelte`                            | 5            | `^5.57.1`         |
| `vite`                              | 8            | `^8.0.12`         |
| `tailwindcss` / `@tailwindcss/vite` | 4            | `^4.3.3`          |
| `vitest`                            | 4            | `^4.1.12`         |
| `typescript`                        | 6            | `^6.0.3`          |

**Rationale for pinning:**

- **SvelteKit 3 and Tailwind 4 together.** SvelteKit 3 changes the
  defaults for `request.json`, `cookies` and `error`, and Tailwind 4
  replaces `tailwind.config.js` with the `@theme` directive in CSS.
  Migrating both in one change reduces churn, because the Tailwind 4
  configuration format and the SvelteKit 3 plugin surface overlap.
- **`adapter-cloudflare` 8 in lockstep.** The adapter major must match
  the kit major; 7.x is built against kit 2.x and would break at deploy
  time, not at build time.
- **No `overrides` block.** The advisory that originally forced a pin
  (`undici`, pulled in by `miniflare` via `wrangler`) is cleared at the
  source: `wrangler` is declared as a direct devDependency at `^4.153.0`,
  which resolves `miniflare` 5.20261023 and `undici` 7.30.1 naturally.
  The current locked dependency tree passes
  `npm audit --audit-level=moderate` without an `overrides` block.
  Dependencies must be audited whenever they change; a later parent
  release may reintroduce a vulnerable transitive dependency.
- **Known non-blocking item.** SvelteKit 3 deprecates the
  `config.alias` option; the warning is retained rather than silenced,
  so the deprecation stays visible until the migration to subpath
  imports is done deliberately.

### Backend Architecture

**Separate validation service** deployed to **Fly.io**:

- Lightweight Rust or Node.js API wrapper around the `elang` CLI
- Accepts `.elang` file uploads via HTTP
- Executes `elang validate` and returns structured JSON results
- Stateless, no persistent storage in v0.1.0

**Rationale:**

- Fly.io natively supports running compiled Rust binaries in Docker containers
- Clean architectural separation: frontend (UI/presentation) vs. backend (validation logic)
- Fly.io free tier provides 3 shared VMs (256MB RAM) — sufficient for v0.1.0 validation workload
- Avoids complexity of compiling `elang-rs` to WASM (not currently supported upstream)
- Backend can be independently scaled, tested, and evolved

### Data Flow

```
User uploads .elang file
    ↓
Cloudflare Workers (SvelteKit frontend)
    ↓ HTTP POST /validate
Fly.io validation API
    ↓ exec `elang validate`
elang-rs CLI (Rust binary)
    ↓ return validation results + extracted phoneme data
Fly.io API (JSON response)
    ↓
Cloudflare Workers renders phoneme viewer
```

### SDK Integration Policy

- Pin to a specific `elang-rs` release tag or commit SHA for the v0.1.0 validation service
- Document the supported ELANG specification version (`0.0.1-1` binary container `0.1.0`)
- Validation service uses the `elang validate` CLI command (stages 1–12)
- No custom parsing, modification, or reimplementation of ELANG normative rules in the Hub codebase

## Consequences

### Positive

- Clear separation of concerns: UI and validation logic are independently deployable
- Leverages authoritative ELANG validation without forking or reimplementing
- SvelteKit + Tailwind + shadcn-svelte = fast UI development with great DX
- Cloudflare Workers provides global edge delivery for static assets and SSR content
- Fly.io free tier keeps infrastructure costs at zero for v0.1.0
- Architecture supports future enhancements (caching, rate limiting, multi-region validation)

### Negative

- Introduces network latency: validation requires round-trip to Fly.io
- Two deployment targets (Cloudflare + Fly.io) vs. monolithic serverless deployment
- Requires CORS configuration and secure API authentication
- File upload size limits must be enforced (both client-side and server-side)

### Neutral

- Future WASM support in `elang-rs` would enable client-side validation, eliminating the backend service
- Migration to alternative hosting (Vercel, Railway, self-hosted) remains straightforward due to clean API boundary

## Compliance

- **REQ-HUB-001:** No ELANG v0.1.0 normative rules are reimplemented; validation delegated to authoritative SDK
- **REQ-HUB-002:** Untrusted file uploads are processed server-side with bounded resource limits
- **REQ-HUB-003:** No out-of-scope features (accounts, persistence, discovery) introduced in v0.1.0

## References

- ELANG Hub Issue #2: [HUB][v0.1.0][H00] Setup & CI
- `elang-rs` repository: https://github.com/RockyDevWorks/elang-rs
- SvelteKit documentation: https://svelte.dev/docs/kit
- Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
- Fly.io documentation: https://fly.io/docs

## Amendment history

- **2026-10-26 (v0.1.0).** Added § "Pinned major versions" recording the
  SvelteKit 3, `adapter-cloudflare` 8, Tailwind 4, Vite 8, Svelte 5,
  Vitest 4, TypeScript 6 and the rationale for landing both Kit 3 and
  Tailwind 4 together. Corrected the deployment-target wording from
  "Cloudflare Pages" to "Cloudflare Workers (static assets
  Pages-compatible)" to match what `@sveltejs/adapter-cloudflare` 8
  actually emits and what `docs/operator-guide.md` documents. The
  `undici` advisory is now cleared by pinning `wrangler ^4.153.0` as a
  direct devDependency, so the `overrides` block is empty.
