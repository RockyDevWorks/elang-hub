/**
 * Privacy, retention and logging invariant audit (H0503).
 *
 * The Hub's privacy posture is a set of ABSENCES: it does not log,
 * it does not persist, it does not beacon, it does not write the
 * package to disk, and the browser never talks to a third party.
 *
 * `docs/security/threat-model.md` states those absences. A statement
 * in a document is not an enforcement mechanism — the next PR could
 * add a `console.log(body)` and the doc would still say "no
 * telemetry" while the claim quietly became false. This audit is the
 * enforcement: it re-reads the shipped source on every CI run and
 * fails the build if any of those absences stops holding.
 *
 * It mirrors `read-only-audit.test.ts` in structure — a filesystem
 * walk over the source trees with a table of forbidden patterns — so
 * the two invariants are enforced the same way and read the same way.
 *
 * Only shipped code is scanned. Test files are excluded: a test may
 * legitimately construct a fake `File`, stub `fetch`, or assert on
 * storage APIs, and none of that ships.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface Rule {
	/** Human name of the invariant, used in the failure message. */
	readonly name: string;
	/** The pattern that indicates a violation. */
	readonly pattern: RegExp;
	/** Why the invariant exists. */
	readonly reason: string;
}

const RULES: readonly Rule[] = [
	{
		name: 'console logging',
		pattern: /\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir|table)\b/,
		reason:
			'The Hub has no log sink. A package byte, a file name or a resource path must never be written to one.'
	},
	{
		name: 'client-side storage',
		pattern: /\b(localStorage|sessionStorage|indexedDB|caches)\b|\bdocument\s*\.\s*cookie\b/,
		reason:
			'The Hub retains nothing. The package lives in memory for one validation run and is then dropped.'
	},
	{
		name: 'remote logging or telemetry',
		pattern: /\bsendBeacon\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b/,
		reason:
			'The Hub has no telemetry. A beacon or socket would ship package or usage data off-origin.'
	},
	{
		name: 'filesystem access',
		pattern:
			/\bfrom\s+['"](node:)?fs(\/promises)?['"]|\brequire\(\s*['"](node:)?fs['"]\s*\)|\bfs\s*\.\s*(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|copyFile|copyFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync)\b/,
		reason:
			'The endpoint accepts opaque bytes and forwards them. Writing them to disk would create a retention surface the v0.1.0 scope forbids.'
	},
	{
		name: 'hardcoded third-party endpoint',
		pattern: /\bfetch\s*\(\s*['"]https?:\/\//,
		reason:
			'The browser may only talk to its own origin. A literal third-party URL would be an exfiltration path out of the page.'
	}
];

/** Source trees that make up the shipped Hub. */
const AUDIT_ROOTS = ['src/routes', 'src/lib'] as const;

const EXCLUDE_DIRS = new Set(['node_modules', '.svelte-kit', 'coverage', 'dist', 'build']);
const ALLOWED_EXTENSIONS = new Set(['.ts', '.svelte', '.js', '.mjs']);

interface Finding {
	readonly file: string;
	readonly line: number;
	readonly snippet: string;
	readonly rule: Rule;
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
		for (const rule of RULES) {
			if (rule.pattern.test(line)) {
				findings.push({ file, line: i + 1, snippet: line.trim(), rule });
			}
		}
	}
	return findings;
}

describe('H03 privacy, retention and logging invariant', () => {
	const files: string[] = [];
	for (const root of AUDIT_ROOTS) walk(root, files);

	// Test files are not shipped code. A test may construct a fake
	// `File`, stub `fetch`, or assert on a storage API.
	const shipped = files.filter((f) => !/\.(test|spec)\.ts$/.test(f));

	it(`scans ${shipped.length} shipped source files across ${AUDIT_ROOTS.join(' + ')}`, () => {
		expect(shipped.length).toBeGreaterThan(0);
	});

	for (const rule of RULES) {
		it(`does not ship ${rule.name}`, () => {
			const allFindings: Finding[] = [];
			for (const file of shipped) allFindings.push(...scan(file));
			const offending = allFindings.filter((f) => f.rule === rule);
			if (offending.length > 0) {
				const lines = offending.map((f) => `  ${f.file}:${f.line}  ${f.snippet}`).join('\n');
				throw new Error(
					`Privacy invariant violated: ${rule.name}.\nReason: ${rule.reason}\n${lines}`
				);
			}
			expect(offending).toHaveLength(0);
		});
	}
});
