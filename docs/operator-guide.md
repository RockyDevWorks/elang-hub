# ELANG Hub v0.1.0 — Operator Guide

## Who this is for

You are running, deploying, extending or auditing ELANG Hub — the
SvelteKit application that fronts the ELANG SDK validation service for
the read-only Phoneme Viewer release.

This guide covers local development, environment configuration, the
SDK integration contract, the validation pipeline as the Hub sees it,
and the Cloudflare deployment shape. For end-user documentation, see
[`user-guide.md`](./user-guide.md). For the security threat model, see
[`security/threat-model.md`](./security/threat-model.md). For the
architectural decision that picks the SDK-as-a-service model, see
[`decisions/0001-architecture-and-deployment.md`](./decisions/0001-architecture-and-deployment.md).

---

## 1. Architecture in one paragraph

ELANG Hub is a SvelteKit application deployed to Cloudflare. The
browser talks only to the Hub's own origin; the Hub's only outbound
server-side hop is to the ELANG SDK validation service, which runs the
authoritative `elang-rs` CLI and returns a typed JSON verdict. The Hub
never parses or interprets `.elang` content — every structural and
semantic decision is the SDK's. The Hub renders the verdict and
nothing else.

The phoneme viewer is a single route (`/`) with a four-phase state
machine (`idle` → `validating` → `view` | `error`) and zero persistence.

---

## 2. Local development

### 2.1 Prerequisites

- **Node.js ≥ 22.17** (declared in `package.json`'s `engines`).
- npm. The repo pins lockfile entries; use `npm ci` for reproducible
  installs.
- Optional: a Cloudflare account and `wrangler` for a production-shaped
  local run.

### 2.2 First-time setup

```bash
git clone https://github.com/RockyDevWorks/elang-hub.git
cd elang-hub
npm ci
```

### 2.3 Environment variables

The Hub reads exactly one environment variable: `SDK_SERVICE_URL`. It
is the base URL of the ELANG SDK validation service. The browser never
sees this value — it is consumed by the server endpoint at
`src/routes/api/phonemes/+server.ts`.

For local development, point it at any reachable SDK service:

```bash
# .env (uncommitted; only the local dev server reads it)
SDK_SERVICE_URL=https://sdk-staging.example.internal
```

The endpoint will report `503 — The validation service URL is not
configured on this deployment` if the variable is absent at boot.

### 2.4 Common commands

| Goal                                  | Command                |
| ------------------------------------- | ---------------------- |
| Run the dev server                    | `npm run dev`          |
| Run the test suite                    | `npm test`             |
| Run with coverage                     | `npm run coverage`     |
| Type-check                            | `npm run check`        |
| Lint (Prettier + ESLint)              | `npm run lint`         |
| Auto-format                           | `npm run format`       |
| Production build                      | `npm run build`        |
| Local preview of the production build | `npm run preview`      |
| Audit dependencies                    | `npm audit --omit=dev` |

`svelte-kit sync` is invoked automatically by `check`, `test`,
`coverage` and the Cloudflare build. It materialises
`.svelte-kit/tsconfig.json` so `$lib` and `$app/env/*` resolve. If you
see "cannot resolve `$lib/...`" failures, run `npx svelte-kit sync`
manually before re-running.

### 2.5 What CI runs

The CI workflow (`.github/workflows/ci.yml`) runs every commit on every
PR. The jobs are:

- `lint` — `npm run lint` (Prettier + ESLint over the whole repo).
- `typecheck` — `npm run check` (`svelte-check` against the SvelteKit
  tsconfig).
- `build` — `npm run build` (Vite + the Cloudflare adapter).
- `audit` — `npm audit --audit-level=moderate`.
- `test` — `npm run coverage` (Vitest + v8 coverage; uploads to Codecov
  on a best-effort basis).
- `sonar` — SonarCloud quality gate (external).
- `codeql` — CodeQL security analysis.

Run the same gates locally before pushing. The SvelteKit CI quality
gates skill has the full procedure with the failure-mode catalogue.

---

## 3. Project layout

```
src/
├── app.d.ts                        # SvelteKit ambient types
├── env.ts                          # declared env vars (SDK_SERVICE_URL)
├── lib/
│   ├── components/                 # Svelte UI (UploadPrompt, PhonemeViewer, …)
│   ├── phonemes/                   # page controller, request transport, mapper
│   ├── sdk/                        # SDK adapter (the only file that knows
│   │                               #   about the service URL)
│   ├── upload/limits.ts            # client-side upload caps (H0503)
│   └── view/                       # H03 view model (narrow `inventory: unknown`)
└── routes/
    ├── +page.svelte                # the single route the v0.1.0 viewer ships
    ├── page.test.ts                # page-level test
    ├── upload-flow.test.ts         # H0505 end-to-end pipeline test
    ├── budgets.test.ts             # H0506 budget pinning tests
    ├── privacy-audit.test.ts       # H0503 enforced privacy invariant
    └── api/phonemes/+server.ts     # POST endpoint that proxies to the SDK
docs/
├── user-guide.md                   # end-user documentation (H0507)
├── operator-guide.md               # this file (H0507)
├── accessibility.md                # H0504 record
├── resource-budgets.md             # H0506 record
├── scope-v0.1.0.md                 # product scope
├── sdk-compatibility-policy.md     # SDK pinning policy (governance)
├── elang-sdk-version.md            # current SDK version pin
├── ci-automation-setup.md          # CI/CD configuration
├── decisions/0001-…                # architecture decision record
└── security/
    ├── threat-model.md             # H0501 threat model
    └── sdk-audit-2026-10-26.md     # verbatim SDK audit record
```

The boundary between `src/lib/sdk/` and the rest is deliberate: every
other module imports from `./contract` (transport-agnostic types) and
has no idea the SDK is reachable over HTTP. The implementation can be
swapped (for example, for a future WASM binding) without touching any
caller.

---

## 4. SDK compatibility

### 4.1 What the Hub supports in v0.1.0

| Layer                  | Supported value                              | Source                      |
| ---------------------- | -------------------------------------------- | --------------------------- |
| ELANG specification    | `0.0.1-1`                                    | `src/lib/sdk/contract.ts`   |
| ELANG binary container | `0.1.0`                                      | `src/lib/sdk/contract.ts`   |
| ELD phoneme inventory  | schema `0.1.0`                               | `docs/elang-sdk-version.md` |
| EPF package manifest   | schema `0.1.0`                               | `docs/elang-sdk-version.md` |
| `elang-rs` SDK release | the tag pinned in the SDK service deployment | `docs/elang-sdk-version.md` |

Any other version is a typed failure (`unsupported_spec_version` or
`unsupported_binary_container_version`) surfaced with the precise
"what we support vs. what you sent" message. The Hub never silently
downgrades or upgrades.

### 4.2 How the Hub integrates

Per ADR 0001, the Hub speaks HTTP to a separate validation service
that wraps the `elang-rs` CLI. The Hub itself does not invoke the CLI
directly — there is no shelling out from the SvelteKit process, no
embedded SDK, no filesystem handoff. The integration contract lives in
`src/lib/sdk/contract.ts` and the transport in `src/lib/sdk/client.ts`.

This shape has three consequences worth knowing:

1. **The browser never sees the SDK service URL.** The Hub's
   `/api/phonemes` endpoint receives the bytes and forwards them over
   the server-to-server link. The browser's CSP can be tight (see
   `vite.config.ts`) and the service URL stays a deployment secret.
2. **The Hub never parses `.elang`.** Every byte is opaque from the
   Hub's perspective. This is REQ-HUB-001 / REQ-SDK-001 — the Hub
   does not reimplement the SDK's normative rules. A future SDK
   release with a different parser cannot break the Hub, because the
   Hub never calls the parser.
3. **The SDK contract is the contract.** The Hub's rendering is bound
   to the typed shape `SdkResult` (and its `inspect`/`verify`/`validate`
   members). An SDK release that breaks this shape is a breaking
   change at the contract level and requires an explicit Hub version
   bump per `sdk-compatibility-policy.md`.

### 4.3 Updating the SDK

The pin is held by the SDK service deployment, not by the Hub
repo. To upgrade:

1. Pick the new `elang-rs` tag and pin it in the SDK service's
   Dockerfile.
2. Confirm the tag's `SdkResult` shape is backward-compatible with the
   version `src/lib/sdk/contract.ts` is built against.
3. If the contract moved, update `src/lib/sdk/contract.ts` first and
   let `src/lib/sdk/client.ts` and the rest of the Hub follow.
4. Run the full Hub test suite against the new service.
5. If the ELANG spec or container version moved, update
   `SUPPORTED_SPEC_VERSION` / `SUPPORTED_BINARY_CONTAINER_VERSION`
   and the matching checks in `version.ts` and the failure messages.
6. Update `docs/elang-sdk-version.md` with the new pin and the diff.
7. Roll out: deploy the SDK service first, then the Hub.

The policy forbids automated dependency updates to the SDK pin —
see `sdk-compatibility-policy.md` for the rationale (minor updates
require manual review; major updates require a Hub version bump).

---

## 5. Validation pipeline

### 5.1 Three SDK modes, one Hub call

The SDK exposes three modes of operation, with monotonically stronger
guarantees:

| Mode       | Stage      | Stronger modes?                                     | Integrity? | Allowed to set `ok: true`?                     |
| ---------- | ---------- | --------------------------------------------------- | ---------- | ---------------------------------------------- |
| `inspect`  | `inspect`  | No — inspect only. Never presented as verification. | No         | Yes (but the Hub does not call it for v0.1.0). |
| `verify`   | `verify`   | Requires SHA-256 integrity of every resource.       | Yes        | Yes (but the Hub does not call it for v0.1.0). |
| `validate` | `validate` | Requires inspect + verify + descriptor + ELD.       | Yes        | Yes (and the Hub calls **only this** mode).    |

The Hub's `/api/phonemes` endpoint always calls `validate` — see
`+server.ts` line 139. The contract forbids presenting a weaker mode
as a substitute for a stronger one (a successful `inspect` against a
package with a corrupted resource would be a false positive). For
v0.1.0, `validate` is the only mode the Hub uses.

### 5.2 Pipeline shape

```
┌─────────────────┐  POST /api/phonemes (octet-stream)  ┌──────────────────┐
│ Browser (page)  │ ─────────────────────────────────▶ │ Hub SvelteKit    │
│                 │ ◀───────────────────────────────── │ /api/phonemes    │
└─────────────────┘  200 + SdkResult (JSON)            │  (proxy only)    │
                                                      └────────┬─────────┘
                                                               │ POST <SDK_SERVICE_URL>/validate
                                                               ▼
                                                      ┌──────────────────┐
                                                      │ ELANG SDK service│
                                                      │ (runs elang-rs)  │
                                                      └──────────────────┘
```

The Hub's contract with the page is:

- 200 + `SdkResult` body when the SDK responded (success or typed
  failure). Both `ok: true` and `ok: false` are 200 — the SDK has
  spoken, and the page's mapper is responsible for rendering. The
  browser distinguishes "your package is invalid" from "the service
  is down" by inspecting `result.code`, not by HTTP status.
- 413 when the request body exceeds `MAX_SDK_BODY_BYTES` (mirrors the
  SDK's adapter limit).
- 503 when the SDK service is unreachable or `SDK_SERVICE_URL` is
  unconfigured.
- 504 on a transport timeout.
- 400 on a malformed request (empty body, wrong content type).

### 5.3 Bounds

Every length on the wire is bounded; the values and the rationale
live in `docs/resource-budgets.md`. The headline numbers:

| Layer                     | Bound                                  | Pin                          |
| ------------------------- | -------------------------------------- | ---------------------------- |
| Upload (client)           | 16 MiB                                 | `src/lib/upload/limits.ts`   |
| Endpoint body             | 16 MiB                                 | `src/lib/sdk/bounds.ts`      |
| SDK response              | 4 MiB                                  | `src/lib/sdk/bounds.ts`      |
| Renderable groups         | 16 (inherited from SDK)                | `src/routes/budgets.test.ts` |
| Renderable roots          | 256 (inherited from SDK)               | `src/routes/budgets.test.ts` |
| Allophones per root       | 16 (inherited from SDK)                | `src/routes/budgets.test.ts` |
| Diagnostics per response  | 200                                    | `src/lib/sdk/bounds.ts`      |
| Renderable message string | `MAX_SDK_STRING_LENGTH + 1` (ellipsis) | `src/lib/sdk/bounds.ts`      |
| Round-trip timeout        | `DEFAULT_SDK_TIMEOUT_MS`               | `src/lib/sdk/bounds.ts`      |

The Hub does not enforce the SDK's inventory ceilings — it **renders**
at each ceiling so a regression in the rendering path is caught where
the SDK's guarantee ends. See `docs/resource-budgets.md` §3 for the
rationale.

---

## 6. Deployment

### 6.1 Targets

The Hub ships from one source tree to two deployment targets.

| Target                       | Adapter                          | Build command        | Runtime              |
| ---------------------------- | -------------------------------- | -------------------- | -------------------- |
| Cloudflare Workers (v0.1.0)  | `@sveltejs/adapter-cloudflare` 8 | `npm run build`      | workerd (V8 isolate) |
| Container / self-hosted Node | `@sveltejs/adapter-node` 6       | `npm run build:node` | Node.js ≥ 22.17      |

`npm run build` still produces the Workers bundle — the Cloudflare
deployment path is unchanged by the container work. SvelteKit builds
exactly one adapter per invocation, so the adapter is selected at
build time in `vite.config.ts` (`BUILD_TARGET=node` selects the Node
one). Every other setting — CSP, preprocess, the `$lib` alias, the
Tailwind pipeline — is shared, so the two targets cannot drift apart
in configuration.

### 6.2 Required environment

- `SDK_SERVICE_URL` — the SDK service base URL. On Cloudflare, set it
  in the Workers dashboard under Settings → Variables (or via
  `wrangler secret put SDK_SERVICE_URL`). In a container, pass it as
  an environment variable (see §6.4).

  A misconfigured deployment fails loudly: `POST /api/phonemes`
  responds 503 with the message "The validation service URL is not
  configured on this deployment." The static page is unaffected.

- `ORIGIN` — container only. SvelteKit uses it for absolute URL
  construction and for its CSRF origin check. Set it to the public
  origin of the Hub (for example `https://hub.example.com`). The
  image defaults to `http://localhost:3000`, which suits local use
  only.

- `PORT` / `HOST` — container only. The image defaults to `3000` and
  `0.0.0.0`.

### 6.3 Build

```bash
npm ci
npm run build        # Cloudflare Workers bundle
npm run build:node   # Node server bundle (consumed by the container)
```

The build reads `vite.config.ts`. The Cloudflare adapter bundle lands
under `.svelte-kit/output/cloudflare/`; the Node adapter bundle lands
under `build/`, where `index.js` is the server entrypoint and
`client/` holds the static assets. The CSP is wired in
`vite.config.ts` and applied at the response layer — see §7.

### 6.4 Container deployment (Docker)

The repository ships a `Dockerfile` and a `docker-compose.yml` that
run the Hub as a standalone Node server.

```bash
cp .env.example .env    # then edit SDK_SERVICE_URL
docker compose up --build
```

The Hub is then on <http://localhost:3000>.

**Image shape.** The `Dockerfile` is a three-stage build:

1. `deps` — `npm ci` with the full dependency tree.
2. `build` — `npm run build:node`, producing `build/`.
3. `runtime` — `npm ci --omit=dev` (production dependencies only) plus
   the `build/` output, running as the unprivileged `node` user
   (uid 1000) with `node build/index.js` as its entrypoint.

SvelteKit's server code is bundled into `build/server/`, so the
runtime stage needs only the production dependencies — `@lucide/svelte`
and its transitive tree — rather than the whole toolchain.

**Runtime configuration.** Every value comes from the environment; no
secret is baked into the image.

| Variable          | Required | Default in image        | Purpose                         |
| ----------------- | -------- | ----------------------- | ------------------------------- |
| `SDK_SERVICE_URL` | yes      | —                       | SDK validation service base URL |
| `ORIGIN`          | no       | `http://localhost:3000` | Public origin of the Hub        |
| `PORT`            | no       | `3000`                  | Listen port                     |
| `HOST`            | no       | `0.0.0.0`               | Listen address                  |

**Health.** The image declares a `HEALTHCHECK` that fetches `/` using
Node's built-in `fetch` — no extra packages. `docker compose ps`
reports the container as `healthy` once the server answers.

**Hardening.** `docker-compose.yml` runs the container with a read-only
root filesystem (plus a `tmpfs` at `/tmp`), all Linux capabilities
dropped, and `no-new-privileges`. The app performs no filesystem
writes at runtime, so none of these restrict it. Relax one by
overriding it in a `docker-compose.override.yml` — add a writable
path to the `tmpfs` list rather than disabling `read_only`.

**Not containerised.** The ELANG SDK validation service is a separate
deployment (`elang-rs`). Point `SDK_SERVICE_URL` at your Fly.io
deployment or another reachable instance.

**Verification.** CI runs `docker compose up --build` and asserts that
the container serves `GET /` with 200, reports healthy, and fails
closed with 503 on `POST /api/validate` when the validation service is
unconfigured.

### 6.5 What does NOT ship

The v0.1.0 deploy ships only the SvelteKit app — there is no separate
API service, no background worker, no scheduled job, no KV or D1
binding, no Durable Object. The runtime shape is "page + one
outbound HTTPS call per validation."

---

## 7. Security posture at a glance

The threat model (`docs/security/threat-model.md`) is the source of
truth. The operator-relevant highlights:

- **CSP.** `connect-src 'self'` in production. The browser can only
  talk to the Hub's origin; the SDK service is reached server-side,
  not browser-side.
- **No third-party fetches in the shipped code.** Enforced by
  `src/routes/privacy-audit.test.ts`. The pattern matches literal,
  single-quoted, double-quoted AND template-literal `fetch(...)` calls
  with hardcoded URLs.
- **No client-side persistence.** Enforced by the same suite: the
  forbidden patterns cover `localStorage`, `sessionStorage`,
  `IndexedDB`, `document.cookie`, `navigator.sendBeacon`, `EventSource`,
  `WebSocket` and filesystem APIs.
- **No payload logging.** Server logs contain only typed error codes
  and bounded messages, never package bytes.
- **Super-linear regex off the request path.** The SDK client strips
  trailing slashes with an explicit backwards scan rather than
  `/\\/+$/`, and the endpoint uses the same helper.
- **Output safety.** Strings rendered into the DOM go through Svelte's
  text interpolation (escapes HTML), and C0 controls + DEL are
  stripped from optional detail text before display.

---

## 8. Operational checks

A reasonable pre-deploy smoke test:

```bash
npm ci
npm run lint
npm run check
npm test
npm run coverage
npm run build
npm audit --omit=dev
```

On the deployed worker:

- `GET /` — renders the upload page.
- `GET /` with the browser dev tools open — confirm only requests to
  the Hub's origin appear in the network panel. There should be no
  third-party request.
- `POST /api/phonemes` with no body — expect 400.
- `POST /api/phonemes` with > 16 MiB — expect 413.
- `POST /api/phonemes` with a valid `.elang` package — expect 200 and
  the phoneme viewer to render.
- `POST /api/phonemes` with an invalid package — expect 200 and an
  error block whose `result.code` is one of the typed SDK codes.
- `POST /api/phonemes` with `SDK_SERVICE_URL` unset on the deployment
  — expect 503.

---

## 9. Debugging tips

- **The page shows "Validation service unavailable" on every request.**
  The SDK service URL is wrong, or the SDK service is down. Check
  `SDK_SERVICE_URL` in the deployment; check the SDK service's own
  health.
- **The page shows "Package too large" on a file you think is small.**
  The 16 MiB cap is on bytes, not characters; check the file's
  reported size in the file picker.
- **The page shows "Validation failed" with no detail.**
  The SDK returned a typed failure but did not include a `path`. The
  Hub surfaces `message` only; this is a package-side issue (re-export
  from your ELANG tooling).
- **A diagnostic's `path` looks corrupted.** Control characters in
  the path are stripped before display. If the SDK sent a path with
  embedded C0 controls (which it should not), what you see is the
  sanitised form — file a bug against the SDK.
- **The page shows "Could not read the validated inventory."** The
  SDK returned `ok: true` but the inventory shape did not match what
  the H03 view model expects. This is a Hub-side regression; check
  the SDK version pin and the test fixtures in
  `src/lib/view/extract.test.ts`.
- **Tests fail with `Cannot find module '$lib/...'` or
  `Cannot resolve $app/env/private`.** Run `npx svelte-kit sync` and
  re-run. The synced tsconfig is what materialises the `$lib` and
  `$app/env` aliases.
- **`npm run lint` reports only the Prettier line.** The fix is
  always `npx prettier --write <path>` (or `npm run format` to do the
  whole tree). The check runs against the entire repo, not just the
  diff — a file that was never prettier-formatted will fail the gate
  on the first commit that touches the surrounding code.

---

## 10. Where to get help

- Hub-side bug: open an issue against `RockyDevWorks/elang-hub` with
  the browser, browser version, file size and the error title or
  diagnostic.
- SDK-side bug or contract mismatch: open an issue against
  `RockyDevWorks/elang-rs`.
- Spec question: the ELANG specification lives in `elang-rs/docs/`.
