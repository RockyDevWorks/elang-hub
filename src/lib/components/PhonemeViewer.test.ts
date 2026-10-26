/**
 * Component tests for `PhonemeViewer.svelte`.
 *
 * Pins the top-level viewer (H0401–H0405): the skip link, the
 * package metadata header, the inventory summary, the empty-state
 * placeholder, the group nav, and the per-group sections.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { PhonemeView } from '$lib/view';
import PhonemeViewer from './PhonemeViewer.svelte';
import { NO_PHONEMES_PLACEHOLDER, RESERVED_GROUP_LABELS } from '$lib/phonemes';
import {
	fixtureAllophone,
	fixtureGroup,
	fixtureInventory,
	fixturePackage,
	fixtureRoot
} from './test-fixtures';

function successView(
	overrides: {
		inventory?: ReturnType<typeof fixtureInventory>;
		phonemeResourcePath?: string;
	} = {}
): Extract<PhonemeView, { ok: true }> {
	return {
		ok: true,
		view: Object.freeze({
			package: fixturePackage(),
			phonemeResourcePath: overrides.phonemeResourcePath ?? 'Linguistics/phonemes.eld',
			inventory: overrides.inventory ?? fixtureInventory(),
			diagnostics: []
		})
	};
}

describe('PhonemeViewer', () => {
	it('renders a skip link as the first focusable element', () => {
		const { getByText } = render(PhonemeViewer, { props: { view: successView() } });
		const skip = getByText('Skip to inventory');
		expect(skip.tagName).toBe('A');
		expect(skip.getAttribute('href')).toBe('#inventory');
	});

	it('renders the package metadata header', () => {
		const { getByRole } = render(PhonemeViewer, { props: { view: successView() } });
		expect(getByRole('heading', { level: 1 }).textContent).toBe('Test Language');
	});

	it('renders the inventory summary section with the empty placeholder when the inventory is empty', () => {
		const { getByRole, container } = render(PhonemeViewer, { props: { view: successView() } });
		const summary = getByRole('region', { name: 'Inventory summary' });
		expect(summary.textContent).toContain(NO_PHONEMES_PLACEHOLDER);
		expect(container.textContent).not.toContain('phonemes,');
	});

	it('renders the inventory summary with the count when the inventory has roots', () => {
		const root = fixtureRoot({
			ipa: 'p',
			allophones: [fixtureAllophone({ ipa: 'pʰ', roman: 'p' })]
		});
		const group = fixtureGroup({ kind: 'consonants', displayName: 'consonants', roots: [root] });
		const inventory = fixtureInventory({
			groups: [group],
			rootCount: 1,
			allophoneCount: 1,
			isEmpty: false
		});
		const { getByRole } = render(PhonemeViewer, {
			props: { view: successView({ inventory }) }
		});
		const summary = getByRole('region', { name: 'Inventory summary' });
		expect(summary.textContent).toContain('1 phoneme, 1 allophone');
	});

	it('renders the group nav with one link per group when the inventory has groups', () => {
		const group = fixtureGroup({
			kind: 'consonants',
			displayName: 'consonants',
			roots: [fixtureRoot({ ipa: 'p' })]
		});
		const inventory = fixtureInventory({
			groups: [group],
			rootCount: 1,
			allophoneCount: 0,
			isEmpty: false
		});
		const { getByRole, container } = render(PhonemeViewer, {
			props: { view: successView({ inventory }) }
		});
		const nav = getByRole('navigation', { name: 'Inventory sections' });
		expect(nav.textContent).toContain(RESERVED_GROUP_LABELS.consonants);
		// Each group gets a section + a nav link.
		expect(container.querySelectorAll('section.group').length).toBe(1);
		expect(nav.querySelectorAll('a').length).toBe(1);
	});

	it('does NOT render the group nav when the inventory is empty', () => {
		const { queryByRole } = render(PhonemeViewer, { props: { view: successView() } });
		expect(queryByRole('navigation', { name: 'Inventory sections' })).toBeNull();
	});

	it('renders each group with its canonical heading', () => {
		const consonantGroup = fixtureGroup({
			kind: 'consonants',
			displayName: 'consonants',
			roots: [fixtureRoot({ ipa: 'p' })]
		});
		const vowelGroup = fixtureGroup({
			kind: 'vowels',
			displayName: 'vowels',
			roots: [fixtureRoot({ ipa: 'a' })]
		});
		const inventory = fixtureInventory({
			groups: [consonantGroup, vowelGroup],
			rootCount: 2,
			allophoneCount: 0,
			isEmpty: false
		});
		const { container } = render(PhonemeViewer, {
			props: { view: successView({ inventory }) }
		});
		const headings = container.querySelectorAll('h2.group-title');
		expect(headings.length).toBe(2);
		expect(headings[0].textContent).toBe(RESERVED_GROUP_LABELS.consonants);
		expect(headings[1].textContent).toBe(RESERVED_GROUP_LABELS.vowels);
	});

	it('forwards diagnostics to the diagnostics list component', () => {
		const view: Extract<PhonemeView, { ok: true }> = {
			ok: true,
			view: Object.freeze({
				package: fixturePackage(),
				phonemeResourcePath: 'Linguistics/phonemes.eld',
				inventory: fixtureInventory(),
				diagnostics: [
					Object.freeze({
						stage: 'validate',
						code: 'unsupported_feature',
						message: 'minor advisory'
					})
				]
			})
		};
		const { container } = render(PhonemeViewer, { props: { view } });
		expect(container.textContent).toContain('unsupported_feature');
		expect(container.textContent).toContain('minor advisory');
	});

	it('does NOT render the diagnostics aside when there are no diagnostics', () => {
		const { container } = render(PhonemeViewer, { props: { view: successView() } });
		expect(container.querySelector('aside[aria-label="Validation advisories"]')).toBeNull();
	});
});
