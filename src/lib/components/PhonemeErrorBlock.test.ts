/**
 * Component tests for `PhonemeErrorBlock.svelte`.
 *
 * Pins the error-phase UI (H0401): the typed error title + message
 * (and optional detail), the file name + size caption, and the
 * "Upload another file" button that calls `replace`.
 */

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PhonemeErrorBlock from './PhonemeErrorBlock.svelte';
import {
	REPLACE_FILE_LABEL,
	formatBytes,
	httpErrorOutcome,
	mapRequestOutcome,
	type PhonemePageErrorInfo
} from '$lib/phonemes';

describe('PhonemeErrorBlock', () => {
	function makeError(overrides: Partial<PhonemePageErrorInfo> = {}): PhonemePageErrorInfo {
		return Object.freeze({
			title: 'Could not read the file',
			message: 'The file stream ended before we could read it. Try a different file.',
			detail: undefined,
			...overrides
		});
	}

	it('renders the typed error title and message', () => {
		const error = makeError({
			title: 'Package is invalid',
			message: 'The SDK rejected the package as malformed.'
		});
		const { getByRole, container } = render(PhonemeErrorBlock, {
			props: { error, fileName: 'broken.elang', fileSize: 2048, replace: () => {} }
		});
		expect(getByRole('heading', { level: 2 }).textContent).toBe('Package is invalid');
		expect(container.textContent).toContain('The SDK rejected the package as malformed.');
	});

	it('renders the file name and size caption', () => {
		const { container } = render(PhonemeErrorBlock, {
			props: {
				error: makeError(),
				fileName: 'broken.elang',
				fileSize: 2048,
				replace: () => {}
			}
		});
		expect(container.textContent).toContain('broken.elang');
		expect(container.textContent).toContain(formatBytes(2048));
	});

	it('renders mapped detail as literal text without creating HTML elements', () => {
		const detail = '<script>alert("x")</script> & \'path\' &lt;';
		const error = mapRequestOutcome(httpErrorOutcome(500, detail));
		const { container } = render(PhonemeErrorBlock, {
			props: { error, fileName: 'broken.elang', fileSize: 1, replace: () => {} }
		});
		expect(container.querySelector('p.detail code')?.textContent).toBe(detail);
		expect(container.querySelector('script')).toBeNull();
	});

	it('does NOT render the detail block when detail is absent', () => {
		const error = makeError({ detail: undefined });
		const { container } = render(PhonemeErrorBlock, {
			props: { error, fileName: 'broken.elang', fileSize: 1, replace: () => {} }
		});
		expect(container.querySelector('p.detail')).toBeNull();
	});

	it('invokes the replace callback when the "Upload another file" button is clicked', async () => {
		const replace = vi.fn();
		const { getByRole } = render(PhonemeErrorBlock, {
			props: { error: makeError(), fileName: 'broken.elang', fileSize: 1, replace }
		});
		await fireEvent.click(getByRole('button', { name: REPLACE_FILE_LABEL }));
		expect(replace).toHaveBeenCalledTimes(1);
	});

	it('marks itself as an alert so screen readers announce the error', () => {
		const { container } = render(PhonemeErrorBlock, {
			props: {
				error: makeError(),
				fileName: 'broken.elang',
				fileSize: 1,
				replace: () => {}
			}
		});
		const root = container.querySelector('[role="alert"]');
		expect(root).not.toBeNull();
	});
});
