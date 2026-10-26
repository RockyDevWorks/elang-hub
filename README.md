# ELANG Hub

ELANG Hub is the companion application for exploring validated `.elang`
language packages.

## v0.1.0 — Phoneme Viewer

The first release accepts an ELANG v0.1.0 `.elang` package, runs the
ELANG SDK's full validation pipeline (`validate` mode — inspect +
verify + descriptor + ELD semantics), and renders a read-only Phoneme
Page using the validated phonological definitions.

v0.1.0 does **not** include user accounts, persistent publication,
language discovery, social features, or leaderboards. Those remain
planned for incremental releases through Hub v1.0.0.

## Documentation

- **[`docs/user-guide.md`](./docs/user-guide.md)** — End-user
  documentation: what you can upload, how to use it, what the error
  messages mean, known limitations, privacy at a glance.
- **[`docs/operator-guide.md`](./docs/operator-guide.md)** — Local
  development, environment configuration, SDK integration contract,
  deployment shape, operational checks, debugging tips.
- **[`docs/scope-v0.1.0.md`](./docs/scope-v0.1.0.md)** — Approved
  product scope and explicitly deferred features.
- **[`docs/accessibility.md`](./docs/accessibility.md)** — H0504
  accessibility record (axe coverage, contrast, keyboard and
  screen-reader flows, browser support matrix).
- **[`docs/resource-budgets.md`](./docs/resource-budgets.md)** — H0506
  resource budgets (client-side caps, SDK response caps, inherited
  inventory ceilings, cancellation semantics).
- **[`docs/security/threat-model.md`](./docs/security/threat-model.md)** —
  H0501 trust boundaries, attack surface and privacy invariants.
- **[`docs/decisions/0001-architecture-and-deployment.md`](./docs/decisions/0001-architecture-and-deployment.md)** —
  Architecture decision record (SDK-as-a-service model).
- **[`docs/sdk-compatibility-policy.md`](./docs/sdk-compatibility-policy.md)** —
  Governance: how the Hub pins the SDK, when updates are allowed,
  what the matrix looks like.

## Development

```bash
npm ci
npm run dev          # local dev server (reads SDK_SERVICE_URL from .env)
npm test             # Vitest
npm run coverage     # Vitest + v8 coverage
npm run check        # svelte-check
npm run lint         # Prettier + ESLint
npm run build        # production build (Cloudflare adapter)
npm audit --omit=dev # dependency audit
```

Node `>= 22.17`. See [`docs/operator-guide.md`](./docs/operator-guide.md)
for the full procedure, the env vars and the deployment shape.

## Project tracking

Organization GitHub Project: **LINGUA FRANCA**. Implementation is
tracked using a master release issue (`#17`), phase issues and Kiro
task IDs, following the conventions in `RockyDevWorks/elang-rs`.
