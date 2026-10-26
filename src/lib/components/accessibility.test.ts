/**
 * Accessibility verification (H0504).
 *
 * Every component in the viewer is rendered and run through axe-core.
 * The rule set is the WCAG 2.1 A/AA set that axe can evaluate in a
 * DOM-only environment.
 *
 * Two rules are deliberately excluded, with reasons:
 *
 *   - `color-contrast` needs layout and paint, which happy-dom does
 *     not implement. Contrast is verified by hand against the
 *     documented palette and recorded in `docs/accessibility.md`.
 *   - `aria-allowed-attr` / `aria-valid-attr-value` are exercised
 *     on the happy-dom elements but happy-dom's ARIA reflection is
 *     partial, which makes the results unreliable.
 *
 * A violation here is a defect, not a warning: the test fails with
 * the full axe report so the offending node is obvious.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import axe, { type RunOptions } from 'axe-core';
import UploadPrompt from './UploadPrompt.svelte';
import UploadProgress from './UploadProgress.svelte';
import PhonemeErrorBlock from './PhonemeErrorBlock.svelte';
import PhonemeViewer from './PhonemeViewer.svelte';
import PhonemeDiagnosticsList from './PhonemeDiagnosticsList.svelte';
import ConditionTree from './ConditionTree.svelte';
import PhonemeMetadata from './PhonemeMetadata.svelte';
import {
	fixtureAllophone,
	fixtureGroup,
	fixtureGroupWhen,
	fixtureInventory,
	fixturePackage,
	fixtureRoot,
	fixtureSimpleWhen
} from './test-fixtures';
import type { GroupView, PhonemeView } from '$lib/view';

const AXE_OPTIONS: RunOptions = {
	runOnly: {
		type: 'tag',
		values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
	},
	rules: {
		// Needs layout/paint — verified by hand, see docs/accessibility.md.
		'color-contrast': { enabled: false }
	}
};

/** Run axe over a rendered container and return the violation summary. */
async function violations(container: Element): Promise<string[]> {
	const results = await axe.run(container, AXE_OPTIONS);
	return results.violations.map(
		(violation) =>
			`${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes
				.map((node) => node.target.join(' '))
				.join(', ')}`
	);
}

/**
 * A populated inventory so the viewer's full tree is exercised.
 *
 * Built from the shared fixtures rather than hand-rolled objects, so the axe
 * run covers the same shapes the rest of the component suite uses. Three
 * groups — including one whose kind is a custom name rather than a reserved
 * kind — exercise the inventory nav with more than one entry, the `{#each}`
 * keying, and the anchor-id generation for a non-reserved group label.
 */
function populatedGroups(): GroupView[] {
	return [
		fixtureGroup({
			kind: 'consonants',
			displayName: 'consonants',
			roots: [fixtureRoot({ allophones: [fixtureAllophone()] })]
		}),
		fixtureGroup({
			kind: 'vowels',
			displayName: 'vowels',
			roots: [fixtureRoot({ ipa: 'a', roman: 'a' })]
		}),
		fixtureGroup({
			kind: { name: 'clicks' },
			displayName: 'clicks',
			roots: []
		})
	];
}

function populatedView(): Extract<PhonemeView, { ok: true }> {
	return {
		ok: true,
		view: {
			package: fixturePackage(),
			phonemeResourcePath: 'Linguistics/phonemes.eld',
			inventory: {
				groups: populatedGroups(),
				rootCount: 2,
				allophoneCount: 1,
				isEmpty: false
			},
			diagnostics: [{ stage: 'validate', code: 'eld_invalid', message: 'An advisory note.' }]
		}
	};
}

describe('axe-core accessibility verification (H0504)', () => {
	it('UploadPrompt has no axe violations', async () => {
		const { container } = render(UploadPrompt, { props: { onfiles: () => {} } });
		expect(await violations(container)).toEqual([]);
	});

	it('UploadProgress has no axe violations', async () => {
		const { container } = render(UploadProgress, {
			props: {
				fileName: 'test.elang',
				fileSize: 1024,
				progress: 42,
				cancel: () => {}
			}
		});
		expect(await violations(container)).toEqual([]);
	});

	it('PhonemeErrorBlock has no axe violations', async () => {
		const { container } = render(PhonemeErrorBlock, {
			props: {
				error: {
					title: 'Could not read the file',
					message: 'The file could not be read from your device.'
				},
				fileName: 'test.elang',
				fileSize: 1024,
				replace: () => {}
			}
		});
		expect(await violations(container)).toEqual([]);
	});

	it('PhonemeViewer has no axe violations', async () => {
		const { container } = render(PhonemeViewer, { props: { view: populatedView() } });
		expect(await violations(container)).toEqual([]);
	});

	it('PhonemeDiagnosticsList has no axe violations', async () => {
		const { container } = render(PhonemeDiagnosticsList, {
			props: {
				diagnostics: [{ stage: 'validate', code: 'eld_invalid', message: 'An advisory note.' }]
			}
		});
		expect(await violations(container)).toEqual([]);
	});

	it('ConditionTree has no axe violations', async () => {
		const { container } = render(ConditionTree, { props: { when: fixtureSimpleWhen() } });
		expect(await violations(container)).toEqual([]);
	});

	it('ConditionTree has no axe violations for a nested condition', async () => {
		const { container } = render(ConditionTree, { props: { when: fixtureGroupWhen() } });
		expect(await violations(container)).toEqual([]);
	});

	it('PhonemeMetadata has no axe violations', async () => {
		const { container } = render(PhonemeMetadata, {
			props: { pkg: fixturePackage(), phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		expect(await violations(container)).toEqual([]);
	});

	it('the empty-inventory viewer has no axe violations', async () => {
		const { container } = render(PhonemeViewer, {
			props: {
				view: {
					ok: true,
					view: {
						package: fixturePackage(),
						phonemeResourcePath: 'Linguistics/phonemes.eld',
						inventory: fixtureInventory(),
						diagnostics: []
					}
				}
			}
		});
		expect(await violations(container)).toEqual([]);
	});
});

describe('keyboard and screen-reader affordances (H0504)', () => {
	it('exposes the drop zone as a named region', () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		expect(getByRole('region').getAttribute('aria-label')).toBeTruthy();
	});

	it('exposes the picker as a real button (keyboard reachable by default)', () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const button = getByRole('button');
		expect(button.tagName).toBe('BUTTON');
		expect(button.getAttribute('type')).toBe('button');
	});

	it('keeps the hidden file input out of the tab order', () => {
		// The visible picker button is the keyboard control. A
		// visually-hidden but focusable <input type="file"> would add
		// a second, unlabelled tab stop that opens a file dialog on
		// Enter — confusing for a keyboard user and announced by
		// screen readers as an unnamed control.
		const { container } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const input = container.querySelector('input[type="file"]');
		expect(input?.getAttribute('tabindex')).toBe('-1');
	});

	it('announces validation progress politely', () => {
		const { getByRole } = render(UploadProgress, {
			props: {
				fileName: 'test.elang',
				fileSize: 1024,
				progress: 42,
				cancel: () => {}
			}
		});
		const status = getByRole('status');
		expect(status.getAttribute('aria-live')).toBe('polite');
	});

	it('exposes the progress bar with a bounded value', () => {
		const { getByRole } = render(UploadProgress, {
			props: {
				fileName: 'test.elang',
				fileSize: 1024,
				progress: 42,
				cancel: () => {}
			}
		});
		const bar = getByRole('progressbar');
		expect(bar.getAttribute('aria-valuenow')).toBe('42');
		expect(bar.getAttribute('aria-valuemin')).toBe('0');
		expect(bar.getAttribute('aria-valuemax')).toBe('100');
	});

	it('announces errors assertively', () => {
		const { getByRole } = render(PhonemeErrorBlock, {
			props: {
				error: { title: 'Could not read the file', message: 'Try another file.' },
				fileName: 'test.elang',
				fileSize: 1024,
				replace: () => {}
			}
		});
		expect(getByRole('alert')).toBeTruthy();
	});

	it('marks IPA strings with the und-fonipa language so screen readers switch voice', () => {
		const { container } = render(PhonemeViewer, { props: { view: populatedView() } });
		const ipa = container.querySelector('[lang="und-fonipa"]');
		expect(ipa).not.toBeNull();
		expect(ipa?.textContent).toContain('p');
	});
});
