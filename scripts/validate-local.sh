#!/usr/bin/env bash
#
# scripts/validate-local.sh — the local validation suite for ELANG Hub.
#
# Runs every check that CI runs on a push or PR, locally, so a contributor
# can confirm green before pushing. The same set of tools backs the
# `validation` workflow in `.github/workflows/validation.yml`; if a check
# passes here, the matching CI job will pass.
#
# Usage:
#   scripts/validate-local.sh                # run everything that is available
#   scripts/validate-local.sh --required      # fail fast on required check failure
#   scripts/validate-local.sh --skip build    # skip the slow Cloudflare build
#   scripts/validate-local.sh --help
#
# A check is skipped (not failed) when its binary is not on PATH. Every
# skipped check is reported in the summary so the contributor can install
# the missing tool and re-run. A `--strict` mode (TODO: future) would
# fail when any check is skipped — useful for CI mirror environments.
#
# Why a shell script and not an npm script: the suite includes tools
# that are not npm-installable (gitleaks, zizmor, lychee, syft, cargo-*)
# and would each need a custom npm wrapper otherwise. A single script
# with `command -v` gates is shorter, more honest about the tool
# boundary, and runs without `npm install` first.

set -uo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Resolve the repo root from the script's own location so the script
# works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Required npm-backed checks. These always run because they are part
# of the project's own toolchain.
REQUIRED_CHECKS=(
    "lint:npm run lint"
    "typecheck:npm run check"
    "test:npm test"
)

# Optional npm-backed checks. Skipped via --skip or by name.
OPTIONAL_NPM_CHECKS=(
    "build:npm run build"
    "audit:npm audit --audit-level=moderate"
)

# Tool-gated checks. Each entry maps a display name to the binary that
# must be on PATH. The argument list is the command to invoke from the
# repo root.
TOOL_CHECKS=(
    "jscpd:jscpd --config .jscpd.json src"
    "knip:npx --yes knip"
    "gitleaks:gitleaks detect --source . --no-banner --config .gitleaks.toml"
    "zizmor:zizmor --format plain .github/workflows"
    "lychee:lychee --offline --no-progress --exclude-file .lycheeignore '**/*.md' '**/*.ts' '**/*.svelte'"
    "syft:syft scan source-dir:. -o spdx-json"
)

# Tools that have no work to do on elang-hub because the repo has no
# Rust source. These are documented in the suite so the elang-hub and
# elang-rs validation menus stay aligned; the local script reports each
# as "not applicable" rather than attempting to run it.
RUST_ONLY_TOOLS=(
    "cargo-fuzz"
    "cargo-mutants"
    "cargo-hack"
    "cargo-server-checks"
    "proptest"
    "miri"
)

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

FAIL_FAST=0
SKIP=()
for arg in "$@"; do
    case "${arg}" in
        --required)
            FAIL_FAST=1
            ;;
        --skip)
            shift
            SKIP+=("$@")
            break
            ;;
        --skip=*)
            SKIP+=("${arg#--skip=}")
            ;;
        -h|--help)
            sed -n '2,30p' "$0"
            exit 0
            ;;
        *)
            printf 'unknown argument: %s\n' "${arg}" >&2
            exit 2
            ;;
    esac
done

is_skipped() {
    local name="$1"
    for s in "${SKIP[@]}"; do
        if [[ "${s}" == "${name}" ]]; then
            return 0
        fi
    done
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
    C_RESET=$'\033[0m'
    C_BOLD=$'\033[1m'
    C_DIM=$'\033[2m'
    C_RED=$'\033[31m'
    C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'
    C_BLUE=$'\033[34m'
else
    C_RESET='' C_BOLD='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE=''
fi

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
NA_COUNT=0
FAILED_CHECKS=()

run_check() {
    local name="$1"
    local cmd="$2"
    local start
    start=$(date +%s)

    printf '%s==>%s %s%s%s\n' "${C_BLUE}" "${C_RESET}" "${C_BOLD}" "${name}" "${C_RESET}"
    printf '%s   $ %s%s\n' "${C_DIM}" "${cmd}${C_RESET}"

    # shellcheck disable=SC2086
    if eval "${cmd}"; then
        local elapsed=$(( $(date +%s) - start ))
        printf '%s   ✓ pass%s (%ss)\n' "${C_GREEN}" "${C_RESET}" "${elapsed}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        local code=$?
        local elapsed=$(( $(date +%s) - start ))
        printf '%s   ✗ fail%s (%ss, exit %d)\n' "${C_RED}" "${C_RESET}" "${elapsed}" "${code}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_CHECKS+=("${name}")
        if [[ ${FAIL_FAST} -eq 1 ]]; then
            printf '%s   fail-fast: aborting%s\n' "${C_RED}" "${C_RESET}"
            exit "${code}"
        fi
        return "${code}"
    fi
}

skip_check() {
    local name="$1"
    local reason="$2"
    printf '%s~~>%s %s%s%s %s(skip: %s)%s\n' \
        "${C_YELLOW}" "${C_RESET}" "${C_BOLD}" "${name}" "${C_RESET}" \
        "${C_DIM}" "${reason}" "${C_RESET}"
    SKIP_COUNT=$((SKIP_COUNT + 1))
}

na_check() {
    local name="$1"
    local reason="$2"
    printf '%s--%s %s%s%s %s(n/a: %s)%s\n' \
        "${C_DIM}" "${C_RESET}" "${C_DIM}" "${name}" "${C_RESET}" \
        "${C_DIM}" "${reason}" "${C_RESET}"
    NA_COUNT=$((NA_COUNT + 1))
}

tool_available() {
    command -v "$1" >/dev/null 2>&1
}

# ─────────────────────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────────────────────

printf '%sELANG Hub — local validation suite%s\n' "${C_BOLD}" "${C_RESET}"
printf '%s   repo: %s%s\n' "${C_DIM}" "${REPO_ROOT}${C_RESET}"

for entry in "${REQUIRED_CHECKS[@]}"; do
    name="${entry%%:*}"
    cmd="${entry#*:}"
    if is_skipped "${name}"; then
        skip_check "${name}" "explicit --skip"
        continue
    fi
    run_check "${name}" "${cmd}" || true
done

for entry in "${OPTIONAL_NPM_CHECKS[@]}"; do
    name="${entry%%:*}"
    cmd="${entry#*:}"
    if is_skipped "${name}"; then
        skip_check "${name}" "explicit --skip"
        continue
    fi
    run_check "${name}" "${cmd}" || true
done

for entry in "${TOOL_CHECKS[@]}"; do
    name="${entry%%:*}"
    cmd="${entry#*:}"
    if is_skipped "${name}"; then
        skip_check "${name}" "explicit --skip"
        continue
    fi
    binary="${cmd%% *}"
    if ! tool_available "${binary}"; then
        skip_check "${name}" "${binary} not on PATH"
        continue
    fi
    run_check "${name}" "${cmd}" || true
done

for name in "${RUST_ONLY_TOOLS[@]}"; do
    na_check "${name}" "no Rust source in this repo (see RockyDevWorks/elang-rs)"
done

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT + NA_COUNT))
printf '\n%sSummary%s\n' "${C_BOLD}" "${C_RESET}"
printf '  %s%d passed%s  ' "${C_GREEN}" "${PASS_COUNT}" "${C_RESET}"
printf '%s%d failed%s  ' "${C_RED}" "${FAIL_COUNT}" "${C_RESET}"
printf '%s%d skipped%s  ' "${C_YELLOW}" "${SKIP_COUNT}" "${C_RESET}"
printf '%s%d n/a%s  ' "${C_DIM}" "${NA_COUNT}" "${C_RESET}"
printf '%stotal %d%s\n' "${C_DIM}" "${TOTAL}" "${C_RESET}"

if [[ ${FAIL_COUNT} -gt 0 ]]; then
    printf '\n%sFailed checks:%s\n' "${C_RED}" "${C_RESET}"
    for name in "${FAILED_CHECKS[@]}"; do
        printf '  - %s\n' "${name}"
    done
    exit 1
fi

if [[ ${SKIP_COUNT} -gt 0 ]]; then
    printf '\n%sInstall skipped tools to widen the local suite — the same tools run unconditionally in CI.%s\n' \
        "${C_DIM}" "${C_RESET}"
fi

exit 0
