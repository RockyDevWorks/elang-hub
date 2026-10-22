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
- **Deployment:** Cloudflare Pages via `@sveltejs/adapter-cloudflare`

**Rationale:**

- SvelteKit provides excellent DX, flexible rendering (SSR/SSG/CSR), and strong TypeScript support
- Tailwind CSS enables rapid UI development with consistent design
- shadcn-svelte delivers accessible, well-tested components without heavy framework lock-in
- Cloudflare Pages offers fast edge delivery, zero-config deployment, and generous free tier

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
Cloudflare Pages (SvelteKit frontend)
    ↓ HTTP POST /validate
Fly.io validation API
    ↓ exec `elang validate`
elang-rs CLI (Rust binary)
    ↓ return validation results + extracted phoneme data
Fly.io API (JSON response)
    ↓
Cloudflare Pages renders phoneme viewer
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
- Cloudflare Pages provides excellent global edge performance for static/SSR content
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
- Cloudflare Pages documentation: https://developers.cloudflare.com/pages
- Fly.io documentation: https://fly.io/docs
