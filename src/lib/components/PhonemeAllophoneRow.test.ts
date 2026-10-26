/**
 * Component tests for `PhonemeAllophoneRow.svelte`.
 *
 * Pins the per-allophone rendering (H0404, H0405): IPA + roman +
 * roman-kind label + optional `when` block. IPA strings must
 * survive byte-exactly into the DOM with `lang="und-fonipa"`.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PhonemeAllophoneRow from './PhonemeAllophoneRow.svelte';
import { fixtureAllophone, fixtureSimpleWhen } from './test-fixtures';

describe('PhonemeAllophoneRow', () => {
	it('renders the IPA string inside a span with lang="und-fonipa"', () => {
		const allophone = fixtureAllophone({ ipa: 'pʰ' });
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		const ipaSpan = container.querySelector('span.ipa');
		expect(ipaSpan).not.toBeNull();
		expect(ipaSpan?.getAttribute('lang')).toBe('und-fonipa');
		expect(ipaSpan?.textContent).toBe('pʰ');
	});

	it('renders the resolved romanization in square brackets', () => {
		const allophone = fixtureAllophone({ roman: 'p' });
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).toContain('[p]');
	});

	it('renders "explicit" as the roman-kind label for explicit romanizations', () => {
		const allophone = fixtureAllophone({
			romanKind: Object.freeze({ kind: 'explicit', text: 'p' })
		});
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).toContain('explicit');
	});

	it('renders "inherited from root" as the roman-kind label for inherited romanizations', () => {
		const allophone = fixtureAllophone({
			romanKind: Object.freeze({ kind: 'inherited' })
		});
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).toContain('inherited from root');
	});

	it('renders "not provided" as the roman-kind label for absent romanizations (reserved for future)', () => {
		const allophone = fixtureAllophone({
			romanKind: Object.freeze({ kind: 'absent' })
		});
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).toContain('not provided');
	});

	it('renders the condition tree inline when the allophone has a `when` block', () => {
		const allophone = fixtureAllophone({ when: fixtureSimpleWhen() });
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).toContain('word-position: initial');
	});

	it('does NOT render a condition tree when the allophone has no `when` block', () => {
		const allophone = fixtureAllophone({ when: null });
		const { container } = render(PhonemeAllophoneRow, { props: { allophone } });
		expect(container.textContent).not.toMatch(
			/word-position|syllable-position|previous-phoneme|next-phoneme/
		);
	});
});
