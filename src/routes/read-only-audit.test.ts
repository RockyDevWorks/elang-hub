/**
 * H04 read-only invariant audit (H0408).
 *
 * The v0.1.0 Hub is a read-only phoneme viewer. The release scope
 * explicitly excludes:
 *
 *   - account creation, sign-in, sessions, passwords
 *   - persistent publication (DB writes, blob storage, file upload
 *     sinks that outlive a single request)
 *   - social features (follows, likes, comments, ratings)
 *   - discovery / search / ranking / duplicate detection
 *   - moderation / flagging / takedowns
 *   - editor / write paths (the view layer is read-only)
 *   - download or sharing of the validated view as JSON
 *
 * This test grep-greps the relevant source trees for the
 * vocabulary of those features so a regression in any of them
 * lights up red rather than shipping as a silent scope-creep PR.
 *
 * It is deliberately a `node:fs` + `node:path` walk rather than a
 * build-time grep — the audit must run in CI even when no source
 * files are touched, and it must read what's actually on disk.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The forbidden vocabulary. Each entry is a regex that matches a
 * feature the Hub v0.1.0 must NOT ship. The patterns are
 * case-insensitive and look for either the bare term or a
 * programmer-facing variant (camelCase, snake_case, kebab-case).
 *
 * Why case-insensitive: the audit is a safety net, not a stylistic
 * review. `AccountService`, `accountService` and `account_service`
 * must all trip.
 */
const FORBIDDEN: ReadonlyArray<{
	readonly name: string;
	readonly pattern: RegExp;
	readonly reason: string;
}> = [
	// Accounts / auth
	{
		name: 'sign-in / sign-up / login / logout',
		pattern: /\b(sign[_-]?in|sign[_-]?up|log[_-]?in|log[_-]?out|authenticate)\b/i,
		reason: 'No accounts in v0.1.0 — see Issue #6, scope boundary.'
	},
	{
		name: 'passwords / credentials / sessions / tokens',
		pattern: /\b(password|credential|session[_-]?token|access[_-]?token|refresh[_-]?token)\b/i,
		reason: 'No auth in v0.1.0 — see Issue #6, scope boundary.'
	},
	// Persistent storage / publication
	{
		name: 'database / persistent blob storage',
		pattern:
			/\b(database|postgres|mysql|sqlite|dynamodb|s3[_-]?bucket|cloudflare[_-]?r2|firebase[_-]?storage)\b/i,
		reason: 'No persistence in v0.1.0 — REQ-HUB-003, Issue #6.'
	},
	// Social / discovery
	{
		name: 'social / follow / like / comment / rate',
		pattern:
			/\b(social[_-]?(feed|graph|share)|follow[_-]?(er|ing)|like[_-]?count|comment[_-]?(thread|list)|rating|review[_-]?score)\b/i,
		reason: 'No social features in v0.1.0 — see Issue #6.'
	},
	{
		name: 'search / discover / rank / duplicate detection',
		pattern:
			/\b(search[_-]?(index|query)|discover[_-]?(y|able)|rank[_-]?by|duplicate[_-]?detect)\b/i,
		reason: 'No discovery in v0.1.0 — see Issue #6.'
	},
	// Moderation
	{
		name: 'moderation / flag / takedown',
		pattern: /\b(moderation|moderat(e|or)|flag[_-]?(content|user)|take[_-]?down)\b/i,
		reason: 'No moderation in v0.1.0 — see Issue #6.'
	},
	// Editor / write paths
	{
		name: 'editor / mutate / write back',
		pattern:
			/\b(editor[_-]?(surface|state|view)|mutate[_-]?inventory|write[_-]?phoneme|publish[_-]?package)\b/i,
		reason: 'Read-only viewer in v0.1.0 — H0301, H0304, Issue #6.'
	}
];

/**
 * Source trees under audit. Tests, plan docs, lockfiles and build
 * output are excluded so the audit only ever scans shipped code.
 */
const AUDIT_ROOTS = ['src/routes', 'src/lib'] as const;

const EXCLUDE_DIRS = new Set(['node_modules', '.svelte-kit', 'coverage', 'dist', 'build']);

const ALLOWED_EXTENSIONS = new Set(['.ts', '.svelte', '.js', '.mjs']);

interface Finding {
	readonly file: string;
	readonly line: number;
	readonly snippet: string;
	readonly feature: string;
	readonly reason: string;
}

function walk(dir: string, out: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (EXCLUDE_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			walk(full, out);
		} else if (st.isFile()) {
			const dot = entry.lastIndexOf('.');
			const ext = dot === -1 ? '' : entry.slice(dot);
			if (ALLOWED_EXTENSIONS.has(ext)) out.push(full);
		}
	}
}

function scan(file: string): Finding[] {
	const findings: Finding[] = [];
	const text = readFileSync(file, 'utf8');
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip comments — the audit cares about shipped behaviour, not
		// documentation references to the exclusion rationale.
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
			continue;
		}
		// Skip lines that are obviously about the read-only invariant
		// itself (e.g. "no accounts", "no persistence") — they're the
		// reason the audit exists, not a violation.
		if (/(no\s+(accounts|persistence|social|auth|editor|moderation|discovery))/i.test(line)) {
			continue;
		}
		for (const { name, pattern, reason } of FORBIDDEN) {
			if (pattern.test(line)) {
				findings.push({ file, line: i + 1, snippet: line.trim(), feature: name, reason });
			}
		}
	}
	return findings;
}

describe('H04 read-only invariant', () => {
	const files: string[] = [];
	for (const root of AUDIT_ROOTS) walk(root, files);
	// Exclude the audit test itself — its job is to *carry* the
	// forbidden vocabulary so it can scan for it elsewhere. Scanning
	// it is a self-match loop, not a real violation.
	const audited = files.filter((f) => !f.endsWith('read-only-audit.test.ts'));

	it(`scans ${files.length} source files across ${AUDIT_ROOTS.join(' + ')}`, () => {
		expect(files.length).toBeGreaterThan(0);
	});

	for (const { name, reason } of FORBIDDEN) {
		it(`does not ship ${name}`, () => {
			const allFindings: Finding[] = [];
			for (const file of audited) allFindings.push(...scan(file));
			const offending = allFindings.filter((f) => f.feature === name);
			if (offending.length > 0) {
				const lines = offending.map((f) => `  ${f.file}:${f.line}  ${f.snippet}`).join('\n');
				throw new Error(`Forbidden feature detected: ${name}.\nReason: ${reason}\n${lines}`);
			}
			expect(offending).toHaveLength(0);
		});
	}
});
