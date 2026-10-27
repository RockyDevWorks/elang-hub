# ELANG Hub v0.1.0 — User Guide

## Who this is for

You have an `.elang` language package and you want to see the phoneme
inventory it declares — the root phonemes, the allophones, the
phonological conditions, the romanisation — rendered in your browser,
with no software to install.

This guide covers what you can upload, what you will see, what the
error messages mean and what v0.1.0 deliberately does NOT do.

For local development, deployment configuration and SDK integration
details, see [`operator-guide.md`](./operator-guide.md). For the
security posture, see the
[threat model](./security/threat-model.md).

---

## 1. What you need

A single `.elang` package file produced by a tool that targets the
**ELANG binary container v0.1.0** format and the **ELANG
specification v0.1.0**. Concretely, the package must:

- be a `.elang` file (the file extension is part of the format);
- contain a single phoneme inventory (`ELD`) resource that the ELANG
  manifest points at;
- declare a supported specification version (`0.1.0`) and binary
  container version (`0.1.0`) in the container header;
- be **at most 16 MiB** (16 × 1024 × 1024 bytes ≈ 16.78 MB);
- validate cleanly against the authoritative `elang-rs` SDK's
  `validate` pipeline (inspect + verify + descriptor + ELD semantics).

The Hub does **not** invent format checks. Everything structural is
delegated to the SDK. The Hub enforces the size cap on both sides
(page and server) so a 100 MB blob is rejected before it reaches the
network; the structural rules live in the SDK and are summarised in
[`operator-guide.md` §4](./operator-guide.md#4-sdk-compatibility).

---

## 2. How to use it

1. Open the Hub in a supported browser — see
   [`accessibility.md` §8](./accessibility.md#8-browser-support-matrix).
2. The page shows an upload area.
3. Pick one `.elang` file (or drop it into the area).
4. Watch the progress indicator while the Hub forwards the bytes to
   the validation service.
5. The page transitions to one of two states:
   - **Phoneme viewer** — the inventory rendered.
   - **Error** — a title, message and (when available) a detail line
     pointing at the failing field or resource.

If you want to start over, click **Upload another file**.

You can also cancel an in-flight validation from the progress view; the
Hub stops the upload and returns to the upload area.

---

## 3. What the page is showing

The page is a four-state machine:

| Phase        | You see                                              |
| ------------ | ---------------------------------------------------- |
| `idle`       | The upload area.                                     |
| `validating` | File name, size, a progress bar and a Cancel button. |
| `view`       | The validated inventory, grouped by phoneme type.    |
| `error`      | A title, a message and (when present) a detail.      |

While `validating`, the bytes are streamed to the Hub's server
endpoint at `/api/phonemes`, which forwards them to the ELANG SDK
validation service. The Hub never inspects the package itself — the
SDK does the structural and semantic work and the Hub renders the
result.

The phoneme viewer itself is **read-only**. There is no editing, no
saving, no comments, no accounts.

---

## 4. Validation pipeline (what runs on your package)

When the Hub calls the SDK service, it requests the strongest mode,
`validate`. Internally the SDK runs three stages, each one stronger
than the last:

| Stage      | What the SDK checks                                                            |
| ---------- | ------------------------------------------------------------------------------ |
| `inspect`  | Container structure, header versions, resource inventory.                      |
| `verify`   | SHA-256 integrity of every resource against the container's resource manifest. |
| `validate` | EPF descriptor fields and the ELD semantic rules.                              |

The Hub does not present `inspect` or `verify` results as a
substitute for the full pipeline — only `validate` may report
`ok: true` and unlock the phoneme viewer. A weaker mode would
report success on a corrupt package; the contract forbids that.

A failure at any of the three stages is surfaced with the stage
name in the diagnostic so you can tell whether your package has a
structural problem, an integrity problem or a semantic problem.

---

## 5. Privacy at a glance

ELANG Hub is a **session-only** tool. The browser uploads the package
to the Hub's own endpoint (`/api/phonemes`); the endpoint forwards it
to the validation service and discards the bytes on response. Nothing
is stored.

Specifically:

- **No persistence.** The Hub has no database, no file store, no
  client-side `localStorage`, `sessionStorage`, IndexedDB or cookies
  for package content.
- **No logging of payload bytes.** Server-side logs do not contain
  package content. Errors include only the SDK's typed failure code
  and message, not the bytes.
- **No third-party network calls.** The Content Security Policy
  restricts outbound connections to the Hub's own origin; the only
  exception is the server-side hop to the SDK service, which the
  browser never makes directly.
- **No telemetry, analytics or tracking.** No beacons, no pixels, no
  fingerprinting.
- **No accounts, no identities.** The Hub does not collect, store or
  process any user identifier.

The privacy invariants are not just documented — they are enforced by
`src/routes/privacy-audit.test.ts`, which scans the shipped source for
any use of forbidden APIs (filesystem, storage, logging, beacon,
third-party fetch) and fails the build if one is introduced. The
threat model ([§7](./security/threat-model.md#7-privacy-cleanup-and-error-recovery-h0503))
documents the attack surface in detail.

---

## 6. Troubleshooting

Every error the page shows comes from a small closed set of titles
(bound by `error-mapper.ts`). Use the table to match the title you see
to its cause and the next thing to try.

| Title                                  | Code                  | Meaning                                                              | Try next                                                                                     |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Validation service unavailable         | `service_unavailable` | The Hub could not reach the SDK service.                             | Retry; if the problem persists, the service is down — try again later.                       |
| Validation timed out                   | `timeout`             | The SDK did not answer within the round-trip budget.                 | Retry; large packages can be slow. If the problem persists with a small file, report it.     |
| Validation cancelled                   | `cancelled`           | You cancelled, or the page was navigated away from.                  | Pick the file again to retry.                                                                |
| Package too large                      | `package_too_large`   | The file is over the 16 MiB cap.                                     | Reduce the package size, or split it (only one phoneme inventory per package is shown).      |
| Unsupported package version            | `unsupported_version` | `spec_version` or `binaryContainerVersion` is not the supported one. | Rebuild the package with spec `0.1.0` and container `0.1.0`.                                 |
| Unsupported package feature            | `unsupported_feature` | The package uses a feature the current Hub build does not support.   | See [`operator-guide.md` §4](./operator-guide.md#4-sdk-compatibility) for what is supported. |
| Package structure invalid              | `inspect`             | The container is malformed.                                          | Re-export from your ELANG tool; the package must round-trip cleanly.                         |
| Integrity check failed                 | `verify`              | A resource SHA-256 did not match the manifest.                       | The package was modified after signing — regenerate it.                                      |
| Validation failed                      | `validate`            | The EPF descriptor or ELD semantic rules rejected the inventory.     | Read the diagnostic for the field path; fix the inventory and re-export.                     |
| Network unavailable                    | transport `offline`   | Your browser cannot reach the Hub at all.                            | Check your connection and retry.                                                             |
| Could not read the validated inventory | view extractor        | The SDK returned `ok: true` but the inventory shape did not match.   | File a bug; this is a Hub-side regression and should not happen on a conformant SDK.         |
| Unexpected failure                     | `unknown`             | An unrecognised error escaped the SDK.                               | Retry; if reproducible, report it with the file size and approximate contents.               |

If a diagnostic carries a `path` line, that is the SDK's pointer at the
offending field in the package (for example,
`phonemeResourcePath` or `phoneme_inventory.allophones[3].condition`).
The Hub displays it verbatim after stripping C0 controls and the DEL
character, so the value you see is safe to copy.

---

## 7. Known limitations

v0.1.0 is deliberately small. The Hub does **not**:

- accept more than one file at a time;
- accept files larger than 16 MiB;
- accept packages whose `spec_version` is not `0.1.0`;
- accept packages whose `binaryContainerVersion` is not `0.1.0`;
- inspect, edit, lint or re-package `.elang` files;
- render phoneme inventories whose contents the SDK returned but the
  Hub could not narrow (see [`operator-guide.md` §5](./operator-guide.md#5-validation-pipeline));
- run as a desktop or command-line tool — it is a browser application;
- run offline — the validation step requires the SDK service to be
  reachable;
- store anything across page reloads, browser restarts or accounts —
  there are no accounts;
- publish, share, comment on, rank, discover, follow or otherwise
  socially connect packages;
- support ELANG versions other than `0.1.0` / `0.1.0`;
- support ELD schema versions other than `0.1.0`;
- run on browsers older than the matrix in
  [`accessibility.md` §8](./accessibility.md#8-browser-support-matrix);
- accept files dropped with `multiple` selections — the picker is
  configured for exactly one file;
- keep an in-flight validation going if you navigate away — the
  controller aborts the request and returns to the upload area.

These are not bugs; they are the explicit v0.1.0 surface.

---

## 8. Frequently asked questions

**Can I upload an `.eld` file directly?** No. The Hub accepts the
`.elang` binary container; the ELD is the resource inside it. If you
have an `.eld` file, wrap it in a container using the official ELANG
tooling first.

**Why does the error say "package version" when my package opens in
the editor fine?** "Version" here means the on-the-wire versions
declared in the container header (`specVersion` and
`binaryContainerVersion`), not the editor's notion of version. A
package that opens fine but reports `0.0.0` for either will be
rejected — see §1 and §6.

**What does `inventory` mean in the error message?** It refers to the
ELD phoneme inventory resource inside the container. A package may
have many resources; only the one pointed at by the EPF manifest's
`phonemeResourcePath` is shown.

**Where do I find the SDK's diagnostic detail?** Each diagnostic has
a `path` line (the field locator) and a `message` line (the prose
explanation). The Hub shows both, bounded to safe lengths and with
control characters stripped.

**Is the Hub sending my package somewhere?** Only to its own server
endpoint and then to the validation service over TLS. Nothing is
forwarded to any third party. See §5.

**Will the Hub remember my last upload?** No. Every page load starts
at the upload area.

---

## 9. Where to get help

- A bug in the Hub or a regression in the rendering:
  [open an issue](https://github.com/RockyDevWorks/elang-hub/issues)
  with the browser, browser version, file size and the error title.
- A bug in the validation result (the SDK says the package is invalid
  but your authoring tool says it is fine):
  [open an issue against `elang-rs`](https://github.com/RockyDevWorks/elang-rs/issues).
- A question about the package format or the specification: see the
  ELANG specification in the
  [`elang-rs` repository](https://github.com/RockyDevWorks/elang-rs).
