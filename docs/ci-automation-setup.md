# CI/CD and Automation Setup Guide

This document explains the CI/CD pipelines and automation tools configured for ELANG Hub.

## GitHub Actions Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and pull request to validate code quality.

**Jobs:**

- **Lint:** Prettier and ESLint checks
- **Type Check:** svelte-check for TypeScript validation
- **Build:** Production build with Cloudflare adapter
- **Audit:** npm vulnerability scan

**Status:** ✅ Configured and running

---

### 2. Security Workflow (`.github/workflows/security.yml`)

Comprehensive security scanning running on push, PRs, and daily schedule.

**Jobs:**

- **CodeQL:** Static analysis for JavaScript/TypeScript
- **npm audit:** Vulnerability scanning
- **Dependency Review:** PR-only check for vulnerable dependencies
- **OpenSSF Scorecard:** Supply-chain security posture

**Status:** ✅ Configured

**Setup Required:**

- CodeQL will auto-enable on first push to main
- No additional secrets needed for basic scanning

---

### 3. SonarCloud Analysis

Code quality and security analysis with SonarCloud Automatic Analysis.

**Status:** ✅ Configured (Automatic Analysis enabled)

**How it works:**

- SonarCloud automatically analyzes every push to the repository
- No CI workflow needed - analysis runs on SonarCloud's infrastructure
- Results appear in the SonarCloud dashboard and PR comments

**Setup Steps (Already Completed):**

1. **Import repository to SonarCloud:**
   - Go to https://sonarcloud.io
   - Sign in with GitHub
   - Import the `RockyDevWorks/elang-hub` repository

2. **Enable Automatic Analysis:**
   - Project Settings → Analysis Method → Automatic Analysis
   - SonarCloud will analyze code automatically on every push

**Features:**

- Code quality metrics
- Security vulnerability detection
- Code smell identification
- Technical debt tracking
- PR decoration with quality gate status

---

## Automated Dependency Management

### RenovateBot (`renovate.json`)

Automated dependency updates with intelligent grouping.

**Status:** ⚙️ Requires activation

**Setup Steps:**

1. **Install Renovate GitHub App:**
   - Go to https://github.com/apps/renovate
   - Click "Configure"
   - Select RockyDevWorks organization
   - Grant access to `elang-hub` repository

2. **Verify configuration:**
   - Renovate will auto-detect `renovate.json`
   - First run creates a "Configure Renovate" onboarding PR
   - Review and merge the onboarding PR

**Features:**

- Weekly dependency updates (Mondays at 06:00 UTC)
- Grouped updates (SvelteKit, Tailwind, TypeScript/ESLint)
- Separate PRs for major version bumps
- Vulnerability alerts (immediate)
- Lock file maintenance

**Configuration:**

- Auto-merge: Disabled (requires manual approval)
- PR limit: 10 concurrent PRs
- Security updates: Immediate (no stability days)

---

## Automated PR Management

### Mergify (`.github/mergify.yml`)

Automated pull request workflows and merge management.

**Status:** ⚙️ Requires activation

**Setup Steps:**

1. **Install Mergify GitHub App:**
   - Go to https://mergify.com
   - Sign in with GitHub
   - Click "Install Mergify"
   - Select RockyDevWorks organization
   - Grant access to `elang-hub` repository

2. **Verify configuration:**
   - Mergify will auto-detect `.github/mergify.yml`
   - Configuration is active immediately

**Features:**

**Auto-labeling:**

- `frontend` label for `src/` changes
- `documentation` label for docs/markdown changes
- `ci/cd` label for `.github/` changes
- `dependencies` label for package.json changes

**Auto-approval & merge:**

- Renovate non-major updates: auto-approved + auto-merged after CI passes
- Team-approved PRs: auto-merged after CI passes and 1+ approval
- Squash merge enforced for clean linear history

**Safety:**

- Draft PRs excluded from auto-merge
- WIP PRs excluded from auto-merge
- Requires all CI checks to pass before merge
- Conflict detection

---

## CI Status Badges

Add these to README.md:

```markdown
[![CI](https://github.com/RockyDevWorks/elang-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/RockyDevWorks/elang-hub/actions/workflows/ci.yml)
[![Security](https://github.com/RockyDevWorks/elang-hub/actions/workflows/security.yml/badge.svg)](https://github.com/RockyDevWorks/elang-hub/actions/workflows/security.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=RockyDevWorks_elang-hub&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=RockyDevWorks_elang-hub)
```

**Note:** SonarCloud badge reflects Automatic Analysis results (no workflow badge needed).

---

## Workflow Comparison with elang-rs

### Similarities

- ✅ Comprehensive CI with type checking, linting, building
- ✅ Security workflow with CodeQL, auditing, dependency review, OpenSSF Scorecard
- ✅ Automated dependency updates
- ✅ Least-privilege permissions
- ✅ Concurrency control (cancel in-progress runs)

### Differences

- **elang-rs:** Cargo/Rust tooling → **elang-hub:** npm/Node.js tooling
- **elang-rs:** Multi-OS testing (Ubuntu, Windows, macOS) → **elang-hub:** Ubuntu only (frontend)
- **elang-rs:** Dependabot → **elang-hub:** RenovateBot (better npm support)
- **elang-rs:** cargo-deny for license compliance → **elang-hub:** Dependency Review Action
- **elang-rs:** Code coverage with Codecov → **elang-hub:** Deferred to H05 (Hardening)

### New Additions in elang-hub

- ✅ SonarCloud Automatic Analysis (code quality)
- ✅ Mergify (automated PR management)
- ✅ RenovateBot with intelligent grouping for npm ecosystem

---

## Maintenance

### Weekly Tasks (Automated)

- Renovate creates dependency update PRs (Mondays 06:00 UTC)
- Lock file maintenance (if needed)

### Daily Tasks (Automated)

- Security workflow runs (05:30 UTC)
- Vulnerability scanning against updated advisory databases

### Manual Tasks

- Review and approve Renovate major version updates
- Review SonarCloud quality gate reports
- Monitor OpenSSF Scorecard for supply-chain security posture

---

## Troubleshooting

### CI Failing

1. Check GitHub Actions tab for detailed logs
2. Run `npm run check`, `npm run lint`, `npm run build` locally
3. Fix issues and push

### Renovate Not Creating PRs

1. Check Renovate dashboard: https://app.renovatebot.com/dashboard
2. Verify `renovate.json` is valid JSON
3. Check organization/repo access in Renovate app settings

### Mergify Not Auto-merging

1. Verify all CI checks pass
2. Check PR has required approvals
3. Review Mergify dashboard for rule evaluation
4. Ensure PR is not draft or WIP

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [RenovateBot Documentation](https://docs.renovatebot.com/)
- [Mergify Documentation](https://docs.mergify.com/)
- [SonarCloud Documentation](https://docs.sonarcloud.io/)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
