<div align="center">

# ELANG Hub

**A platform to explore, share, and discover human and constructed languages through validated ELANG packages.**

<br>

[![CI](https://img.shields.io/github/actions/workflow/status/RockyDevWorks/elang-hub/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/RockyDevWorks/elang-hub/actions/workflows/ci.yml)
[![Security](https://img.shields.io/github/actions/workflow/status/RockyDevWorks/elang-hub/security.yml?branch=main&label=Security&style=flat-square)](https://github.com/RockyDevWorks/elang-hub/actions/workflows/security.yml)
[![Coverage](https://img.shields.io/codecov/c/github/RockyDevWorks/elang-hub/main?label=Coverage&style=flat-square)](https://codecov.io/gh/RockyDevWorks/elang-hub)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.17-339933?logo=node.js&logoColor=white&style=flat-square)](https://nodejs.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white&style=flat-square)](https://svelte.dev/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-3-FF3E00?logo=svelte&logoColor=white&style=flat-square)](https://kit.svelte.dev/)

</div>

ELANG Hub is the reference web application for the [ELANG format](https://github.com/RockyDevWorks/elang-rs).
It is a SvelteKit front end that accepts an `.elang` package, delegates
all structural and semantic validation to the authoritative `elang-rs`
SDK validation service, and renders the verdict — nothing more.
The Hub never parses or interprets `.elang` content; every normative
decision is the SDK's.

This repository holds the application: the upload flow, the SDK
client, the phoneme view layer, the deployment adapters (Cloudflare
Workers for production, Node for self-hosted containers), the tests,
the docs site, and the CI configuration.

## Documentation

- **[`docs/user-guide.md`](docs/user-guide.md)** — End-user
  documentation: what you can upload, how to use it, what the error
  messages mean, known limitations, privacy at a glance.
- **[`docs/operator-guide.md`](docs/operator-guide.md)** — Local
  development, environment configuration, SDK integration contract,
  deployment shape, operational checks, debugging tips.
- **[`docs/scope-v0.1.0.md`](docs/scope-v0.1.0.md)** — Approved
  product scope and explicitly deferred features.
- **[`docs/accessibility.md`](docs/accessibility.md)** — Accessibility
  record (axe coverage, contrast, keyboard and screen-reader flows,
  browser support matrix).
- **[`docs/resource-budgets.md`](docs/resource-budgets.md)** —
  Client-side caps, SDK response caps, inherited inventory ceilings,
  cancellation semantics.
- **[`docs/sdk-compatibility-policy.md`](docs/sdk-compatibility-policy.md)** —
  Governance: how the Hub pins the SDK, when updates are allowed,
  what the compatibility matrix looks like.
- **[`docs/security/threat-model.md`](docs/security/threat-model.md)** —
  Trust boundaries, attack surface, and privacy invariants.
- **[`docs/decisions/0001-architecture-and-deployment.md`](docs/decisions/0001-architecture-and-deployment.md)** —
  Architecture decision record (SDK-as-a-service model).
- **[`docs/ci-automation-setup.md`](docs/ci-automation-setup.md)** —
  CI workflows, badges, and the Codecov / SonarCloud wiring.

The steering contract, plans, and the open-artifact tracker live
under [`.kiro/`](.kiro/) and are the source of truth that the public
docs are derived from.

## Status

Pre-release, tracking **v0.1.0 — Phoneme Viewer**. The first release
accepts an ELANG v0.1.0 `.elang` package, runs the ELANG SDK's full
validation pipeline (`validate` mode — inspect + verify + descriptor

- ELD semantics), and renders a read-only Phoneme Page using the
  validated phonological definitions.

v0.1.0 does **not** include user accounts, persistent publication,
language discovery, social features, or leaderboards. Those remain
planned for incremental releases through Hub v1.0.0. See
[`docs/scope-v0.1.0.md`](docs/scope-v0.1.0.md) for the approved scope
and [`docs/operator-guide.md`](docs/operator-guide.md) for the
release-branch workflow that lands work on `release/0.1.0` first and
merges into `main` only at ship time.

## Version domains

ELANG Hub tracks **independent** version domains. A change in one
does not imply a change in another.

| Domain                  | Value                                                           | Notes                                              |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Hub release             | `0.1.0`                                                         | The application release this code ships as         |
| ELANG Specification     | `0.1.0`                                                         | The normative spec the Hub targets                 |
| ELANG Binary container  | `0.1.0`                                                         | Header major `0`, minor `1`                        |
| EPF (`package.epf`)     | `0.1.0`                                                         | Descriptor schema                                  |
| ELD (phoneme inventory) | `0.1.0`                                                         | `.eld` schema                                      |
| `elang-rs` SDK          | pinned to a release tag or commit SHA by the validation service | Held by the SDK service deployment, not by the Hub |

The Hub is **strict** about the ELANG binary container `0.1.0` and
ELANG specification `0.1.0`. The Hub sends opaque package bytes
to the SDK validation service, then rejects unsupported versions
reported in the SDK response. Future ELANG versions require an
explicit compatibility declaration in
[`docs/sdk-compatibility-policy.md`](docs/sdk-compatibility-policy.md).

## Supported scope

A compliant Hub v0.1.0 session handles exactly this flow:

```text
browse to /                       open the upload page
choose .elang file                client-side size and extension gate
POST /api/phonemes                forward bytes to the SDK service
receive validate verdict          typed JSON, mapped to view state
idle -> validating -> view | error
render phoneme groups, roots,
allophones, conditions,
romanisation, metadata, diagnostics
```

The Hub does **not** define lexicons, phonotactics, morphology,
syntax, semantics, prosody, audio, GUI, dependency management,
repository ownership, or publisher signatures. A successful
validation proves that the SDK accepted the package — it does not
prove who published it. The Hub is **read-only**: nothing is
persisted between requests, no cookies are set, and no analytics
are collected.

## Workspace layout

```text
src/
  routes/                SvelteKit pages and the /api/* server endpoints
    +layout.svelte       shared chrome and accessibility hooks
    +page.svelte         the upload + view page
    api/                 server-side proxy to the SDK service
  lib/
    upload/              drop zone, progress, status, controller, harness
    sdk/                 SDK service client, contract, errors, stages, version
    phonemes/            phoneme view model (extract, inventory, ordering,
                         package, romanisation, conditions)
    view/                H03 view layer — pure presentation of validated data
    components/          Svelte components and their co-located tests
docs/                    user guide, operator guide, ADRs, accessibility,
                         resource budgets, security, scope, CI setup
.kiro/                   steering contract and the v0.1.0 task breakdown
.github/workflows/        CI (lint, typecheck, build, test, coverage) and
                         Security (CodeQL, npm audit, dependency review,
                         OpenSSF Scorecard)
Dockerfile               self-hosted Node container build
docker-compose.yml       local composition with the SDK service
sonar-project.properties SonarCloud project binding
codecov.yml              coverage targets and PR-comment layout
renovate.json            Renovate dependency bot configuration
```

## Building

```sh
npm ci
npm run dev          # local dev server (reads SDK_SERVICE_URL from .env)
npm test             # Vitest unit and integration suite
npm run coverage     # Vitest + v8 coverage (uploaded to Codecov)
npm run check        # svelte-check (TypeScript + Svelte type checking)
npm run lint         # Prettier + ESLint
npm run build        # production build (@sveltejs/adapter-cloudflare)
npm run build:node   # container build (@sveltejs/adapter-node)
npm audit --omit=dev # dependency audit
```

### Toolchain and Node version

The build is pinned by the `engines.node` field in
[`package.json`](package.json) to **`>= 22.17`**. CI installs the
current LTS (Node 26 at the time of writing) via
`actions/setup-node`. Raising the minimum Node version requires an
ADR under [`docs/decisions/`](docs/decisions/) and a coordinated
update of the container image and the Cloudflare Workers runtime
compatibility date.

Two deployment targets ship from one source tree:

- **Cloudflare Workers** (production) — `npm run build`,
  [`@sveltejs/adapter-cloudflare`](https://kit.svelte.dev/docs/adapter-cloudflare).
- **Node HTTP server** (self-hosted container) — `npm run build:node`,
  [`@sveltejs/adapter-node`](https://kit.svelte.dev/docs/adapter-node),
  packaged by the [`Dockerfile`](Dockerfile) at the repo root.

Both targets must pass CI on every PR. See
[`docs/operator-guide.md`](docs/operator-guide.md) for the full
procedure, the environment variables, and the deployment shape.

## Application routes (preview)

The Hub exposes a small, deliberate surface:

```text
GET  /                       upload page (idle state)
POST /api/phonemes           proxy .elang bytes to the SDK validate endpoint
POST /api/validate           validate uploaded .elang bytes in the request body
```

`POST /api/validate` accepts raw package bytes in the request body,
rejects empty uploads (`400`) and uploads over 16 MiB (`413`), and
forwards accepted bytes to the configured SDK validation service.
It returns JSON containing `ok`, `diagnostics`, and `messages`.

All routes are **stateless**. The browser talks only to the Hub's
own origin; the Hub's only outbound server-side hop is to the SDK
service. The page and the API routes share a four-phase state
machine (`idle` → `validating` → `view` | `error`) and refuse to
persist anything between requests.

If `SDK_SERVICE_URL` is unset at runtime, the API endpoints return
`503` with a descriptive error body and the static page still
loads. A misconfigured deployment fails loudly instead of silently
proxying to nowhere.

## Security and trust model

See [`docs/security/threat-model.md`](docs/security/threat-model.md).
In short: the Hub is a thin read-only proxy in front of the SDK
validation service. It defends against malicious uploads with a
hard 16 MiB size cap (enforced on both the page and the server),
a client-side extension check performed by `checkSelection`,
cancellation semantics on client navigation, and zero persistence. It never treats a
validation verdict as proof of publisher identity — that
responsibility belongs to the language author and the publishing
channel, not the Hub.

## License

Licensed under the Apache License, Version 2.0, matching the
upstream [`elang-rs`](https://github.com/RockyDevWorks/elang-rs)
SDK. See [`LICENSE`](LICENSE).
