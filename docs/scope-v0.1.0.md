# ELANG Hub v0.1.0 — Product Scope

## Version

v0.1.0 — Phoneme Viewer

## Approved Features

### Core Functionality

1. **Package Upload**
   - Accept `.elang` v0.1.0 package files via web interface
   - Client-side file validation (file extension, basic structure check)
   - Upload to validation service (Fly.io backend)

2. **Validation**
   - Server-side execution of `elang validate` (stages 1–12)
   - Display validation results (success/failure)
   - Show structured diagnostic messages on validation errors

3. **Phoneme Viewer**
   - Read-only display of validated phonological inventory
   - Render phoneme groups
   - Display root phonemes and their IPA symbols
   - Show allophones and phonological conditions
   - Display romanization mappings

### User Experience

- Responsive web interface (mobile, tablet, desktop)
- Accessible UI components (WCAG 2.1 AA compliance target)
- Clear error messages and validation feedback
- Session-based operation (no persistent storage)

## Explicitly Deferred Features

The following features are **NOT** included in v0.1.0:

### Authentication & Accounts
- User registration
- User login
- User profiles
- Session persistence

### Publishing
- Persistent package storage
- Package versioning
- Package ownership
- Package metadata editing

### Discovery & Search
- Package discovery interface
- Search functionality
- Filtering and sorting
- Featured packages or rankings

### Social Features
- User comments
- Package ratings or reviews
- Follows or subscriptions
- Activity feeds

### Community
- Discussion forums
- Package collections
- User-created content beyond packages

### Advanced Features
- Duplicate package detection
- Content moderation
- Leaderboards or rankings
- Package dependency management
- Multi-package comparison

## Technical Boundaries

### Validation
- All validation logic delegated to authoritative `elang-rs` SDK
- No custom parsing or reimplementation of ELANG normative rules
- Validation results are not cached or persisted

### Data Storage
- No database
- No persistent package storage
- Session-based file processing only

### ELANG Version Support
- **Supported:** ELANG v0.1.0 binary container format only
- **Supported:** ELD (phoneme inventory) schema v0.1.0
- Future ELANG versions require explicit compatibility declaration

## Success Criteria

v0.1.0 is considered successful when:

1. A user can upload a valid `.elang` v0.1.0 package
2. The package is validated server-side using the authoritative SDK
3. Validation results are displayed clearly (success or failure with diagnostics)
4. A validated phoneme inventory is rendered in an accessible, responsive web interface
5. The application builds, lints, and type-checks without errors in CI
6. No out-of-scope features are introduced

## Versioning Strategy

- **v0.1.0:** Read-only phoneme viewer (this document)
- **v0.2.0:** Publishing foundation (planned)
- **v0.3.0 – v0.9.0:** Incremental feature releases (discovery, social, rankings, etc.)
- **v1.0.0:** Stable platform with full feature set

## References

- ELANG Hub Issue #2: [HUB][v0.1.0][H00] Setup & CI
- ELANG Hub Issue #17: [HUB][v0.1.0] Master Implementation and Release Tracker
- ELANG specification: https://github.com/RockyDevWorks/elang-rs
- Architecture Decision Record 0001: Architecture and Deployment Strategy
