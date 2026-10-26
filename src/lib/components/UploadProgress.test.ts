/**
 * Component tests for `UploadProgress.svelte`.
 *
 * Pins the validating-phase UI (H0401): file name + size, a
 * `role="progressbar"` with `aria-valuenow` reflecting the
 * controller's progress (clamped to [0, 100]), and a cancel button
 * that calls the supplied `cancel` callback.
 */

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import UploadProgress from './UploadProgress.svelte';
import { CANCEL_LABEL, formatBytes } from '$lib/phonemes';

describe('UploadProgress', () => {
	it('renders the file name and size in the validating label', () => {
		const { container } = render(UploadProgress, {
			props: {
				fileName: 'demo.elang',
				fileSize: 1024,
				progress: 50,
				cancel: () => {}
			}
		});
		expect(container.textContent).toContain('demo.elang');
		expect(container.textContent).toContain(formatBytes(1024));
	});

	it('renders a `role="progressbar"` with `aria-valuenow` equal to the rounded progress', () => {
		const { getByRole } = render(UploadProgress, {
			props: {
				fileName: 'demo.elang',
				fileSize: 1024,
				progress: 42.7,
				cancel: () => {}
			}
		});
		const bar = getByRole('progressbar');
		expect(bar.getAttribute('aria-valuemin')).toBe('0');
		expect(bar.getAttribute('aria-valuemax')).toBe('100');
		expect(bar.getAttribute('aria-valuenow')).toBe('43');
	});

	it('clamps progress to [0, 100]', () => {
		const { getByRole: getAbove } = render(UploadProgress, {
			props: { fileName: 'a.elang', fileSize: 1, progress: 150, cancel: () => {} }
		});
		expect(getAbove('progressbar').getAttribute('aria-valuenow')).toBe('100');
	});

	it('clamps negative progress to 0', () => {
		const { getByRole } = render(UploadProgress, {
			props: { fileName: 'a.elang', fileSize: 1, progress: -10, cancel: () => {} }
		});
		expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
	});

	it('renders the visible percent text', () => {
		const { container } = render(UploadProgress, {
			props: { fileName: 'a.elang', fileSize: 1, progress: 33.3, cancel: () => {} }
		});
		expect(container.textContent).toContain('33%');
	});

	it('invokes the cancel callback when the Cancel button is clicked', async () => {
		const cancel = vi.fn();
		const { getByRole } = render(UploadProgress, {
			props: { fileName: 'a.elang', fileSize: 1, progress: 50, cancel }
		});
		await fireEvent.click(getByRole('button', { name: CANCEL_LABEL }));
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it('marks the container as a live region so screen readers announce progress updates', () => {
		const { container } = render(UploadProgress, {
			props: { fileName: 'a.elang', fileSize: 1, progress: 50, cancel: () => {} }
		});
		const root = container.querySelector('[role="status"]');
		expect(root).not.toBeNull();
		expect(root?.getAttribute('aria-live')).toBe('polite');
	});
});
