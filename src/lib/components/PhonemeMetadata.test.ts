/**
 * Component tests for `PhonemeMetadata.svelte`.
 *
 * Pins the package-metadata header (H0401): the language name,
 * identifier, language version, spec/container versions, phoneme
 * resource path, and the deliberate "no description" placeholder.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PhonemeMetadata from './PhonemeMetadata.svelte';
import { NO_DESCRIPTION_PLACEHOLDER } from '$lib/phonemes';
import { fixturePackage } from './test-fixtures';

describe('PhonemeMetadata', () => {
	it('renders the language name as the heading', () => {
		const pkg = fixturePackage({ name: 'Aelith' });
		const { getByRole } = render(PhonemeMetadata, {
			props: { pkg, phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		expect(getByRole('heading', { level: 1 }).textContent).toBe('Aelith');
	});

	it('renders the identifier inside a <code> element', () => {
		const pkg = fixturePackage({
			identifier: 'urn:elang:language:rocky:aelith:1.0.0'
		});
		const { container } = render(PhonemeMetadata, {
			props: { pkg, phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		const codes = container.querySelectorAll('code');
		// The identifier is the first <code> in the markup; the
		// specVersion + containerVersion + phonemeResourcePath are
		// also <code> elements so we filter on value.
		const identifierCode = Array.from(codes).find(
			(c) => c.textContent === 'urn:elang:language:rocky:aelith:1.0.0'
		);
		expect(identifierCode).toBeDefined();
	});

	it('renders the language version, spec version and container version', () => {
		const pkg = fixturePackage({
			languageVersion: '2.3.4',
			specVersions: Object.freeze({
				specVersion: '0.0.2-3',
				binaryContainerVersion: '0.2.1'
			})
		});
		const { container } = render(PhonemeMetadata, {
			props: { pkg, phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		expect(container.textContent).toContain('2.3.4');
		expect(container.textContent).toContain('0.0.2-3');
		expect(container.textContent).toContain('0.2.1');
	});

	it('renders the phoneme resource path', () => {
		const { container } = render(PhonemeMetadata, {
			props: {
				pkg: fixturePackage(),
				phonemeResourcePath: 'Resources/phonemes/test.eld'
			}
		});
		expect(container.textContent).toContain('Resources/phonemes/test.eld');
	});

	it('renders the description when present', () => {
		const pkg = fixturePackage({ description: 'A description.' });
		const { container } = render(PhonemeMetadata, {
			props: { pkg, phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		expect(container.textContent).toContain('A description.');
		expect(container.textContent).not.toContain(NO_DESCRIPTION_PLACEHOLDER);
	});

	it('renders the deliberate "no description" placeholder when description is null', () => {
		const pkg = fixturePackage({ description: null });
		const { container } = render(PhonemeMetadata, {
			props: { pkg, phonemeResourcePath: 'Linguistics/phonemes.eld' }
		});
		expect(container.textContent).toContain(NO_DESCRIPTION_PLACEHOLDER);
	});

	it('uses the package name as the header id for skip-link anchoring', () => {
		const { getByRole } = render(PhonemeMetadata, {
			props: {
				pkg: fixturePackage({ name: 'Aelith' }),
				phonemeResourcePath: 'Linguistics/phonemes.eld'
			}
		});
		const heading = getByRole('heading', { level: 1 });
		expect(heading.id).toBe('language-name');
	});
});
