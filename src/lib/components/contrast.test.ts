/**
 * Contrast regression guard (H0504).
 *
 * Reads the rendered CSS out of every component and the page, picks
 * out the (foreground, background) pairs whose contrast must meet
 * a documented minimum (WCAG 1.4.3 for text, 1.4.11 for the
 * boundary of a UI component), and fails the suite if any pair
 * drifts below it.
 *
 * `color-contrast` in axe-core needs layout and paint, which happy-dom
 * does not implement. This test runs against the source CSS instead:
 * it extracts the `rgb(...)` literal from the exact declaration that
 * matters, and computes the relative-luminance ratio against the
 * documented background.
 *
 * The pairs table is the single source of truth for the Hub's
 * palette constraints. When a component colour changes, this table
 * is what catches the regression.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Pair {
	readonly label: string;
	readonly file: string;
	readonly find: RegExp;
	readonly background: readonly [number, number, number];
	readonly min: number;
	/**
	 * Override the extracted foreground. Use when the pair's relevant
	 * CSS doesn't carry a foreground declaration of its own (e.g. a
	 * hover rule that inherits `color: white` from the base rule).
	 */
	readonly foreground?: readonly [number, number, number];
}

const COMPONENTS_DIR = resolve(process.cwd(), 'src/lib/components');
const PAGE_FILE = resolve(process.cwd(), 'src/routes/+page.svelte');

function listSvelte(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.svelte') && !name.endsWith('.test.svelte'))
		.map((name) => join(dir, name));
}

const FILES = {
	uploadPrompt: join(COMPONENTS_DIR, 'UploadPrompt.svelte'),
	uploadProgress: join(COMPONENTS_DIR, 'UploadProgress.svelte'),
	phonemeErrorBlock: join(COMPONENTS_DIR, 'PhonemeErrorBlock.svelte'),
	phonemeViewer: join(COMPONENTS_DIR, 'PhonemeViewer.svelte'),
	phonemeDiagnosticsList: join(COMPONENTS_DIR, 'PhonemeDiagnosticsList.svelte'),
	phonemeMetadata: join(COMPONENTS_DIR, 'PhonemeMetadata.svelte'),
	phonemeGroupSection: join(COMPONENTS_DIR, 'PhonemeGroupSection.svelte'),
	phonemeRootRow: join(COMPONENTS_DIR, 'PhonemeRootRow.svelte'),
	phonemeAllophoneRow: join(COMPONENTS_DIR, 'PhonemeAllophoneRow.svelte'),
	conditionTree: join(COMPONENTS_DIR, 'ConditionTree.svelte'),
	page: PAGE_FILE
} as const;

const WHITE: readonly [number, number, number] = [255, 255, 255];
const PAGE_BG: readonly [number, number, number] = [249, 250, 251];
const DRAG_FILL: readonly [number, number, number] = [239, 246, 255];
const ERR_FILL: readonly [number, number, number] = [254, 242, 242];
const ADV_FILL: readonly [number, number, number] = [254, 252, 232];
const TRACK: readonly [number, number, number] = [229, 231, 235];

const RGB = /\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)/;

function pickForeground(source: string, regex: RegExp): [number, number, number] {
	const m = source.match(regex);
	if (!m) throw new Error(`pair did not match: ${regex}`);
	const text = m[0];
	// A `color: white` declaration has no rgb() literal — resolve the
	// CSS keyword instead of grabbing the background's rgb() first.
	if (/color:\s*white\b/.test(text)) return [255, 255, 255];
	// Prefer the rgb() that belongs to the `color:` declaration. A
	// comment inside the matched block can mention another rgb() first
	// (e.g. "the old rgb(107 114 128) only reached 4.42:1").
	const colorAt = text.lastIndexOf('color:');
	const scoped = colorAt >= 0 ? text.slice(colorAt) : text;
	const inner = scoped.match(RGB) ?? text.match(RGB);
	if (!inner) throw new Error(`pair matched but no rgb() literal: ${regex}`);
	return [Number(inner[1]), Number(inner[2]), Number(inner[3])];
}

function luminance([r, g, b]: readonly [number, number, number]): number {
	const channel = (v: number): number => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(
	fg: readonly [number, number, number],
	bg: readonly [number, number, number]
): number {
	const a = luminance(fg);
	const b = luminance(bg);
	const [hi, lo] = a > b ? [a, b] : [b, a];
	return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: readonly Pair[] = [
	// ===== WCAG 1.4.3 — normal text (4.5:1) =====
	{
		label: 'body text on page background',
		file: FILES.page,
		find: /color:\s*rgb\(17\s+24\s+39\)/,
		background: PAGE_BG,
		min: 4.5
	},
	{
		label: 'muted text (75/85/99) on page background',
		file: FILES.page,
		find: /color:\s*rgb\(75\s+85\s+99\)/,
		background: PAGE_BG,
		min: 4.5
	},
	{
		label: 'subtle muted text (107/114/128) on white',
		file: FILES.page,
		find: /color:\s*rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'brand link/button text (37/99/235) on white',
		file: FILES.uploadPrompt,
		find: /color:\s*rgb\(37\s+99\s+235\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'white on brand fill (primary button label)',
		file: FILES.uploadPrompt,
		find: /background:\s*rgb\(37\s+99\s+235\);[\s\S]*?color:\s*white/,
		background: [37, 99, 235],
		min: 4.5
	},
	{
		label: 'white on brand hover fill (29/78/216)',
		file: FILES.uploadPrompt,
		find: /\.picker-button:hover\s*\{[\s\S]*?background:\s*rgb\(29\s+78\s+216\)/,
		background: [29, 78, 216],
		min: 4.5,
		foreground: [255, 255, 255]
	},
	{
		label: 'error heading (153/27/27) on error fill',
		file: FILES.phonemeErrorBlock,
		find: /color:\s*rgb\(153\s+27\s+27\)/,
		background: ERR_FILL,
		min: 4.5
	},
	{
		label: 'error body (127/29/29) on error fill',
		file: FILES.phonemeErrorBlock,
		find: /color:\s*rgb\(127\s+29\s+29\)/,
		background: ERR_FILL,
		min: 4.5
	},
	{
		label: 'advisory heading (146/64/14) on advisory fill',
		file: FILES.phonemeDiagnosticsList,
		find: /color:\s*rgb\(146\s+64\s+14\)/,
		background: ADV_FILL,
		min: 4.5
	},
	{
		label: 'advisory body (120/53/15) on advisory fill',
		file: FILES.phonemeDiagnosticsList,
		find: /color:\s*rgb\(120\s+53\s+15\)/,
		background: ADV_FILL,
		min: 4.5
	},
	{
		label: 'IPA blue (30/58/138) on white',
		file: FILES.phonemeViewer,
		find: /color:\s*rgb\(30\s+58\s+138\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'inventory summary blue (30/64/175) on white',
		file: FILES.phonemeViewer,
		find: /color:\s*rgb\(30\s+64\s+175\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'metadata identifier (75/85/99) on white',
		file: FILES.phonemeMetadata,
		find: /color:\s*rgb\(75\s+85\s+99\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'metadata dt (107/114/128) on white',
		file: FILES.phonemeMetadata,
		find: /color:\s*rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'group section title (17/24/39) on white',
		file: FILES.phonemeGroupSection,
		find: /color:\s*rgb\(17\s+24\s+39\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'group section muted (107/114/128) on white',
		file: FILES.phonemeGroupSection,
		find: /color:\s*rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'root row muted (107/114/128) on white',
		file: FILES.phonemeRootRow,
		find: /color:\s*rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'root row roman (75/85/99) on white',
		file: FILES.phonemeRootRow,
		find: /color:\s*rgb\(75\s+85\s+99\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'allophone row roman (75/85/99) on white',
		file: FILES.phonemeAllophoneRow,
		find: /color:\s*rgb\(75\s+85\s+99\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'allophone row kind (107/114/128) on white',
		file: FILES.phonemeAllophoneRow,
		find: /color:\s*rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'condition summary (75/85/99) on white',
		file: FILES.conditionTree,
		find: /color:\s*rgb\(75\s+85\s+99\)/,
		background: WHITE,
		min: 4.5
	},
	{
		label: 'condition nested (55/65/81) on white',
		file: FILES.conditionTree,
		find: /color:\s*rgb\(55\s+65\s+81\)/,
		background: WHITE,
		min: 4.5
	},

	// ===== WCAG 1.4.11 — non-text / component boundary (3:1) =====
	{
		label: 'drop-zone boundary on white (the drag affordance)',
		file: FILES.uploadPrompt,
		find: /border:\s*2px dashed rgb\(\s*\d+\s+\d+\s+\d+\s*\)/,
		background: WHITE,
		min: 3
	},
	{
		label: 'drop-zone drag-state border (37/99/235) on drag fill',
		file: FILES.uploadPrompt,
		find: /border-color:\s*rgb\(37\s+99\s+235\)/,
		background: DRAG_FILL,
		min: 3
	},
	{
		label: 'progress-bar fill (37/99/235) on track (229/231/235)',
		file: FILES.uploadProgress,
		find: /background:\s*rgb\(37\s+99\s+235\)/,
		background: TRACK,
		min: 3
	},
	{
		label: 'cancel-button border on white',
		file: FILES.uploadProgress,
		find: /border:\s*1px solid rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 3
	},
	{
		label: 'replace-button border on white (page)',
		file: FILES.page,
		find: /border:\s*1px solid rgb\(107\s+114\s+128\)/,
		background: WHITE,
		min: 3
	},
	{
		label: 'replace-button border on error fill (PhonemeErrorBlock)',
		file: FILES.phonemeErrorBlock,
		find: /border:\s*1px solid rgb\(107\s+114\s+128\)/,
		background: ERR_FILL,
		min: 3
	},

	// ===== Focus indicators and interaction states =====
	{
		label: 'focus ring (37/99/235) on white',
		file: FILES.uploadPrompt,
		find: /outline:\s*2px solid rgb\(37\s+99\s+235\)/,
		background: WHITE,
		min: 3
	},
	{
		label: 'focus ring (37/99/235) on error fill',
		file: FILES.phonemeErrorBlock,
		find: /outline:\s*2px solid rgb\(37\s+99\s+235\)/,
		background: ERR_FILL,
		min: 3
	},
	{
		label: 'skip link label on its dark focus fill',
		file: FILES.phonemeViewer,
		find: /background:\s*rgb\(17\s+24\s+39\);[\s\S]*?color:\s*white/,
		background: [17, 24, 39],
		min: 4.5
	},
	{
		label: 'error block muted filename (75/85/99) on error fill',
		file: FILES.phonemeErrorBlock,
		find: /\.muted\s*\{[\s\S]*?color:\s*rgb\(75\s+85\s+99\)/,
		background: ERR_FILL,
		min: 4.5
	},
	{
		label: 'drop-zone helper text (75/85/99) on the drag-state fill',
		file: FILES.uploadPrompt,
		find: /\.drop-zone\.dragging \.muted\s*\{[\s\S]*?color:\s*rgb\(75\s+85\s+99\)/,
		background: DRAG_FILL,
		min: 4.5
	}
];

describe('contrast guard (H0504)', () => {
	// Verify the file list is complete — fails the suite if a
	// component is added without anyone updating this guard.
	it('covers every component and the page', () => {
		const actual = new Set(listSvelte(COMPONENTS_DIR).map((p) => p.split('/').pop() ?? ''));
		const expected = new Set([
			'ConditionTree.svelte',
			'PhonemeAllophoneRow.svelte',
			'PhonemeDiagnosticsList.svelte',
			'PhonemeErrorBlock.svelte',
			'PhonemeGroupSection.svelte',
			'PhonemeMetadata.svelte',
			'PhonemeRootRow.svelte',
			'PhonemeViewer.svelte',
			'UploadProgress.svelte',
			'UploadPrompt.svelte'
		]);
		expect(actual).toEqual(expected);
	});

	for (const pair of PAIRS) {
		it(pair.label, () => {
			const source = readFileSync(pair.file, 'utf8');
			const fg = pair.foreground ?? pickForeground(source, pair.find);
			const value = ratio(fg, pair.background);
			expect(value, `${pair.label}: measured ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(
				pair.min
			);
		});
	}
});
