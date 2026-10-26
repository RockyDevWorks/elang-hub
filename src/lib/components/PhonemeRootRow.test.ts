/**
 * Component tests for `PhonemeRootRow.svelte`.
 *
 * Pins the per-root rendering (H0404, H0405): IPA + romanization +
 * optional condition tree + allophone list (with placeholder when
 * empty). IPA strings must survive byte-exactly into the DOM with
 * `lang="und-fonipa"`.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PhonemeRootRow from './PhonemeRootRow.svelte';
import { NO_ALLOPHONES_PLACEHOLDER } from '$lib/phonemes';
import { fixtureAllophone, fixtureRoot, fixtureSimpleWhen } from './test-fixtures';

describe('PhonemeRootRow', () => {
	it('renders the IPA string inside a span with lang="und-fonipa"', () => {
		const root = fixtureRoot({ ipa: 'pʰ' });
		const { container } = render(PhonemeRootRow, { props: { root } });
		const ipaSpan = container.querySelector('span.ipa');
		expect(ipaSpan).not.toBeNull();
		expect(ipaSpan?.getAttribute('lang')).toBe('und-fonipa');
		expect(ipaSpan?.textContent).toBe('pʰ');
	});

	it('renders the romanization in square brackets', () => {
		const root = fixtureRoot({ ipa: 'p', roman: 'p' });
		const { container } = render(PhonemeRootRow, { props: { root } });
		expect(container.textContent).toContain('[p]');
	});

	it('renders the deliberate "no allophones" placeholder when the root has no allophones', () => {
		const root = fixtureRoot({ allophones: [] });
		const { container } = render(PhonemeRootRow, { props: { root } });
		expect(container.textContent).toContain(NO_ALLOPHONES_PLACEHOLDER);
	});

	it('renders one PhonemeAllophoneRow per allophone when the root has allophones', () => {
		const root = fixtureRoot({
			allophones: [
				fixtureAllophone({ ipa: 'pʰ', roman: 'p' }),
				fixtureAllophone({ ipa: 'pʼ', roman: 'p' })
			]
		});
		const { container } = render(PhonemeRootRow, { props: { root } });
		const allos = container.querySelectorAll('li.allophone');
		expect(allos.length).toBe(2);
		expect(container.textContent).toContain('pʰ');
		expect(container.textContent).toContain('pʼ');
	});

	it('renders the condition tree inline when the root has a `when` block', () => {
		const root = fixtureRoot({ when: fixtureSimpleWhen() });
		const { container } = render(PhonemeRootRow, { props: { root } });
		expect(container.textContent).toContain('word-position: initial');
	});

	it('does NOT render a condition tree when the root has no `when` block', () => {
		const root = fixtureRoot({ when: null });
		const { container } = render(PhonemeRootRow, { props: { root } });
		// No word-position / syllable-position / previous-phoneme /
		// next-phoneme label should appear if there's no `when`.
		expect(container.textContent).not.toMatch(
			/word-position|syllable-position|previous-phoneme|next-phoneme/
		);
	});

	it('preserves multi-symbol IPA byte-exactly (no Unicode normalisation)', () => {
		// t͡ʃ is a tie-bar sequence (U+0361). The view layer is
		// required to keep it byte-exact (H0303).
		const root = fixtureRoot({ ipa: 't͡ʃ' });
		const { container } = render(PhonemeRootRow, { props: { root } });
		const ipaSpan = container.querySelector('span.ipa');
		expect(ipaSpan?.textContent).toBe('t͡ʃ');
	});
});
