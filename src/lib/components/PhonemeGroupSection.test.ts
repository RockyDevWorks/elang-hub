/**
 * Component tests for `PhonemeGroupSection.svelte`.
 *
 * Pins the per-group rendering (H0402, H0403): the canonical plural
 * label for reserved groups, the deliberate "no roots" placeholder
 * for empty groups, and the root list for non-empty groups.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PhonemeGroupSection from './PhonemeGroupSection.svelte';
import { NO_ROOTS_PLACEHOLDER, RESERVED_GROUP_LABELS } from '$lib/phonemes';
import { fixtureGroup, fixtureRoot } from './test-fixtures';

describe('PhonemeGroupSection', () => {
	it('renders the reserved "consonants" label as the heading', () => {
		const group = fixtureGroup({ kind: 'consonants', displayName: 'consonants' });
		const { getByRole } = render(PhonemeGroupSection, { props: { group, id: 'group-x' } });
		expect(getByRole('heading', { level: 2 }).textContent).toBe(RESERVED_GROUP_LABELS.consonants);
	});

	it('renders the reserved "vowels" label as the heading', () => {
		const group = fixtureGroup({ kind: 'vowels', displayName: 'vowels' });
		const { getByRole } = render(PhonemeGroupSection, { props: { group, id: 'group-y' } });
		expect(getByRole('heading', { level: 2 }).textContent).toBe(RESERVED_GROUP_LABELS.vowels);
	});

	it('renders a title-cased label for a custom group', () => {
		const group = fixtureGroup({
			kind: Object.freeze({ name: 'tones' }),
			displayName: 'tones'
		});
		const { getByRole } = render(PhonemeGroupSection, { props: { group, id: 'group-z' } });
		expect(getByRole('heading', { level: 2 }).textContent).toBe('Tones');
	});

	it('renders the deliberate "no roots" placeholder when the group is empty', () => {
		const group = fixtureGroup({ kind: 'vowels', displayName: 'vowels', roots: [] });
		const { container } = render(PhonemeGroupSection, { props: { group, id: 'group-vowels' } });
		expect(container.textContent).toContain(NO_ROOTS_PLACEHOLDER);
	});

	it('renders one PhonemeRootRow per root when the group has roots', () => {
		const group = fixtureGroup({
			kind: 'consonants',
			displayName: 'consonants',
			roots: [fixtureRoot({ ipa: 'p' }), fixtureRoot({ ipa: 'b' })]
		});
		const { container } = render(PhonemeGroupSection, { props: { group, id: 'group-consonants' } });
		// The root row uses an <li class="root"> wrapper (see
		// PhonemeRootRow.svelte). Two roots → two <li> nodes.
		const roots = container.querySelectorAll('li.root');
		expect(roots.length).toBe(2);
		expect(container.textContent).toContain('p');
		expect(container.textContent).toContain('b');
	});

	it('uses the supplied id as the heading id for in-page nav anchors', () => {
		const group = fixtureGroup({ kind: 'consonants', displayName: 'consonants' });
		const { getByRole } = render(PhonemeGroupSection, {
			props: { group, id: 'group-consonants' }
		});
		expect(getByRole('heading', { level: 2 }).id).toBe('group-consonants');
	});
});
