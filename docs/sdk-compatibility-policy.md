# ELANG SDK Compatibility and Dependency Policy

## Purpose

This document defines how ELANG Hub integrates with the authoritative `elang-rs` SDK and manages version compatibility.

## Principles

### 1. Authoritative Validation

- **All validation logic is delegated to `elang-rs`**
- ELANG Hub does not parse, validate, or interpret `.elang` packages directly
- No custom reimplementation of ELANG normative rules in the Hub codebase

### 2. Version Pinning

- The validation backend pins to a specific `elang-rs` release tag or commit SHA
- Version updates require explicit review and testing
- Breaking changes trigger compatibility assessment before upgrade

### 3. Specification Compliance

- Hub v0.1.0 supports **ELANG binary container v0.1.0** only
- Supported specification version: `0.1.0`
- Future ELANG versions require explicit compatibility declaration

## Dependency Management

### elang-rs Integration

**Current approach (v0.1.0):**

- Validation backend (Fly.io) runs the compiled `elang` CLI binary
- CLI operations used:
  - `elang validate <file>` — Execute validation stages 1–12
  - (Future: `elang inspect` and `elang verify` for partial validation modes)

**Pinning strategy:**

- Pin to a specific `elang-rs` Git tag or commit SHA in backend Dockerfile
- Document the pinned version in `docs/elang-sdk-version.md`
- Update only when:
  - Critical bug fixes are released
  - New features are required for Hub functionality
  - Security vulnerabilities are patched

### Version Compatibility Matrix

| Hub Version | ELANG Spec Version | elang-rs Version | Binary Container Version |
| ----------- | ------------------ | ---------------- | ------------------------ |
| v0.1.0      | 0.1.0              | TBD (pinned tag) | 0.1.0                    |

## Update Policy

### Minor Updates (Patch/Fix Releases)

- Automated updates **NOT permitted**
- Manual review required for:
  - Validation behavior changes
  - Diagnostic message format changes
  - Error code additions or deprecations
- Testing requirements:
  - Run Hub test fixtures against new SDK version
  - Verify validation results remain consistent
  - Check diagnostic parsing compatibility

### Major Updates (Breaking Changes)

- Requires Hub version bump and compatibility assessment
- May require:
  - Frontend changes (new validation modes, updated error handling)
  - Backend API changes (new response formats)
  - Documentation updates

## Incompatibility Handling

### When `elang-rs` Introduces Breaking Changes

**Option 1: Compatibility Layer**

- Add version detection logic
- Support multiple SDK versions simultaneously (not recommended for v0.1.0)

**Option 2: Hub Version Bump**

- Release new Hub version with updated SDK dependency
- Clearly communicate breaking changes to users

**Option 3: Defer Upgrade**

- Continue using pinned SDK version until Hub roadmap aligns

### Unsupported ELANG Versions

- If a user uploads an unsupported ELANG version:
  1. Validation fails with clear error message
  2. Hub displays supported version information
  3. User is directed to upgrade their package format

## Testing Requirements

### Before SDK Version Update

1. **Fixture Testing**
   - Run all Hub test fixtures against new SDK
   - Verify validation results match expectations
   - Check diagnostic message parsing

2. **Integration Testing**
   - Test upload → validate → render pipeline end-to-end
   - Verify error handling for invalid packages
   - Confirm UI displays validation results correctly

3. **Regression Testing**
   - Ensure previously valid packages remain valid
   - Check that error messages remain actionable

## Documentation Requirements

### Tracked Information

- Current `elang-rs` version (tag/commit SHA)
- Supported ELANG specification version
- Supported binary container version
- Known incompatibilities or limitations

### Location

- `docs/elang-sdk-version.md` — Current SDK version and compatibility matrix
- Backend `README.md` — Deployment instructions with SDK version
- ADR (if compatibility policy changes) — Rationale for policy updates

## Compliance

- **REQ-SDK-001:** Hub does not reimplement ELANG parsing or validation logic
- **REQ-SDK-002:** SDK version is explicitly pinned and documented
- **REQ-SDK-003:** SDK updates require manual review and testing
- **REQ-SDK-004:** Unsupported ELANG versions fail gracefully with clear messaging

## References

- `elang-rs` repository: https://github.com/RockyDevWorks/elang-rs
- ELANG specification: `elang-rs/docs/specification.md`
- Architecture Decision Record 0001: Architecture and Deployment Strategy
