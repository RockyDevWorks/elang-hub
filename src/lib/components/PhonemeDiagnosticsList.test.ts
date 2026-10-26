/**
 * Component tests for `PhonemeDiagnosticsList.svelte`.
 *
 * Pins the SDK-advisory renderer (H0405): empty diagnostics render
 * nothing (silence is the correct answer); non-empty diagnostics
 * render as a labelled advisory list with stage / code / message.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PhonemeDiagnosticsList from './PhonemeDiagnosticsList.svelte';

describe('PhonemeDiagnosticsList', () => {
	it('renders NOTHING when there are no diagnostics (silence is correct)', () => {
		const { container } = render(PhonemeDiagnosticsList, {
			props: { diagnostics: [] }
		});
		// The component renders no <aside> at all — no empty-state
		// placeholder, because silence is the correct answer when
		// there is nothing to say. (We assert on the element, not on
		// textContent, because happy-dom's textContent includes the
		// component's own source comment.)
		expect(container.querySelector('aside')).toBeNull();
		expect(container.querySelectorAll('li').length).toBe(0);
	});

	it('renders the advisory list when there is one diagnostic', () => {
		const diagnostics: import('$lib/sdk/contract').SdkDiagnostic[] = [
			Object.freeze({
				stage: 'validate',
				code: 'unsupported_feature',
				message: 'The `kind` field is deprecated; use `name` instead.'
			})
		];
		const { getByRole, container } = render(PhonemeDiagnosticsList, {
			props: { diagnostics }
		});
		// An <aside> with aria-label="Validation advisories".
		const aside = getByRole('complementary');
		expect(aside.getAttribute('aria-label')).toBe('Validation advisories');
		expect(container.textContent).toContain('validate');
		expect(container.textContent).toContain('unsupported_feature');
		expect(container.textContent).toContain('The `kind` field is deprecated; use `name` instead.');
	});

	it('renders one <li> per diagnostic when multiple are present', () => {
		const diagnostics: import('$lib/sdk/contract').SdkDiagnostic[] = [
			Object.freeze({
				stage: 'validate',
				code: 'unsupported_feature',
				message: 'first advisory'
			}),
			Object.freeze({
				stage: 'verify',
				code: 'unsupported_feature',
				message: 'second advisory'
			})
		];
		const { container } = render(PhonemeDiagnosticsList, {
			props: { diagnostics }
		});
		const items = container.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(container.textContent).toContain('first advisory');
		expect(container.textContent).toContain('second advisory');
	});
});
