/**
 * Component tests for `UploadPrompt.svelte`.
 *
 * Pins the idle-phase UI (H0401): drop zone with `aria-label`, a
 * "Choose an ELANG package to validate" picker button, and the
 * file-input change event plumbing that forwards the selected files
 * to `onfiles`. Drag events are tested separately because they
 * involve happy-dom quirks around dataTransfer.
 */

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import UploadPrompt from './UploadPrompt.svelte';
import { UPLOAD_DROP_ZONE_LABEL, UPLOAD_PICKER_LABEL } from '$lib/phonemes';
import { ACCEPT_ATTRIBUTE } from '$lib/upload/limits';

describe('UploadPrompt', () => {
	it('renders the drop zone with the canonical aria-label', () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		expect(dropZone.getAttribute('aria-label')).toBe(UPLOAD_DROP_ZONE_LABEL);
	});

	it('restricts the file picker to the .elang accept attribute (H0503)', () => {
		const { container } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const input = container.querySelector('input[type="file"]');
		expect(input).not.toBeNull();
		expect(input?.getAttribute('accept')).toBe(ACCEPT_ATTRIBUTE);
		expect(ACCEPT_ATTRIBUTE).toContain('.elang');
	});

	it('renders the picker button with the canonical accessible name', () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const button = getByRole('button', { name: UPLOAD_PICKER_LABEL });
		expect(button).not.toBeNull();
	});

	it('renders the prompt copy', () => {
		const { container } = render(UploadPrompt, { props: { onfiles: () => {} } });
		expect(container.textContent).toMatch(/Drop an .*\.elang.* package here/);
	});

	it('invokes onfiles with the selected files when the picker changes', async () => {
		const onfiles = vi.fn();
		const { container } = render(UploadPrompt, { props: { onfiles } });
		// happy-dom's File constructor isn't a perfect Blob
		// implementation; we use a plain object that satisfies the
		// `File[] | null` contract the component expects.
		const fakeFile = { name: 'demo.elang' } as unknown as File;
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		// Define the files property via a getter to bypass
		// happy-dom's read-only FileList assignment.
		Object.defineProperty(input, 'files', {
			configurable: true,
			value: [fakeFile]
		});
		await fireEvent.change(input);
		expect(onfiles).toHaveBeenCalledTimes(1);
		expect(onfiles).toHaveBeenCalledWith([fakeFile]);
	});

	it('invokes onfiles with an empty array when the picker is cleared (no files selected)', async () => {
		const onfiles = vi.fn();
		const { container } = render(UploadPrompt, { props: { onfiles } });
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(input, 'files', { configurable: true, value: [] });
		await fireEvent.change(input);
		expect(onfiles).toHaveBeenCalledWith([]);
	});

	it('invokes onfiles with `null` when a drop event has no files', async () => {
		const onfiles = vi.fn();
		const { getByRole } = render(UploadPrompt, { props: { onfiles } });
		const dropZone = getByRole('region');
		// Drop with no dataTransfer — common when a non-file drag
		// (e.g. text) is dropped on the zone.
		const drop = new Event('drop', { bubbles: true });
		await fireEvent(dropZone, drop);
		expect(onfiles).toHaveBeenCalledWith(null);
	});

	it('invokes onfiles with files when a drop event carries files', async () => {
		const onfiles = vi.fn();
		const { getByRole } = render(UploadPrompt, { props: { onfiles } });
		const dropZone = getByRole('region');
		const fakeFile = { name: 'dropped.elang' } as unknown as File;
		const drop = new Event('drop', { bubbles: true });
		Object.defineProperty(drop, 'dataTransfer', {
			value: { files: [fakeFile] }
		});
		await fireEvent(dropZone, drop);
		expect(onfiles).toHaveBeenCalledWith([fakeFile]);
	});

	it('applies a "dragging" class while a drag is in progress', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		const enter = new Event('dragenter', { bubbles: true });
		await fireEvent(dropZone, enter);
		expect(dropZone.classList.contains('dragging')).toBe(true);
	});

	it('clears the "dragging" class after a drop', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		const enter = new Event('dragenter', { bubbles: true });
		await fireEvent(dropZone, enter);
		const drop = new Event('drop', { bubbles: true });
		await fireEvent(dropZone, drop);
		expect(dropZone.classList.contains('dragging')).toBe(false);
	});

	it('clears the "dragging" class on a dragleave that takes depth back to 0', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		const enter = new Event('dragenter', { bubbles: true });
		await fireEvent(dropZone, enter);
		expect(dropZone.classList.contains('dragging')).toBe(true);
		const leave = new Event('dragleave', { bubbles: true });
		await fireEvent(dropZone, leave);
		expect(dropZone.classList.contains('dragging')).toBe(false);
	});

	it('keeps "dragging" class while nested dragenter / dragleave events keep depth > 0', async () => {
		// Browsers fire a dragenter / dragleave pair for every
		// nested element as the cursor crosses boundaries. The
		// component tracks depth so the "dragging" class stays on
		// while the drag is still inside the zone.
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		const enter1 = new Event('dragenter', { bubbles: true });
		await fireEvent(dropZone, enter1);
		const enter2 = new Event('dragenter', { bubbles: true });
		await fireEvent(dropZone, enter2);
		const leave1 = new Event('dragleave', { bubbles: true });
		await fireEvent(dropZone, leave1);
		expect(dropZone.classList.contains('dragging')).toBe(true);
		const leave2 = new Event('dragleave', { bubbles: true });
		await fireEvent(dropZone, leave2);
		expect(dropZone.classList.contains('dragging')).toBe(false);
	});

	it('clamps dragleave depth at 0 (never goes negative)', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		// A dragleave with no prior dragenter — depth would go
		// negative without the Math.max(0, ...) guard.
		const leave = new Event('dragleave', { bubbles: true });
		await fireEvent(dropZone, leave);
		// Should not throw; the class stays absent.
		expect(dropZone.classList.contains('dragging')).toBe(false);
	});

	it('calls preventDefault on dragenter, dragover and dragleave (HTML5 drag-drop contract)', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const dropZone = getByRole('region');
		// A real DragEvent has cancelable=true; happy-dom's
		// generic Event doesn't, so we use the real constructor
		// and check defaultPrevented.
		const enter = new Event('dragenter', { bubbles: true, cancelable: true });
		await fireEvent(dropZone, enter);
		expect(enter.defaultPrevented).toBe(true);
		const over = new Event('dragover', { bubbles: true, cancelable: true });
		await fireEvent(dropZone, over);
		expect(over.defaultPrevented).toBe(true);
	});

	it('opens the picker when the picker button is clicked', async () => {
		const { getByRole } = render(UploadPrompt, { props: { onfiles: () => {} } });
		const button = getByRole('button', { name: UPLOAD_PICKER_LABEL });
		const input = getByRole('region').querySelector('input[type="file"]') as HTMLInputElement;
		// happy-dom lets us spy on .click() to confirm the
		// openPicker() wiring.
		const click = vi.fn();
		input.click = click;
		await fireEvent.click(button);
		expect(click).toHaveBeenCalledTimes(1);
	});
});
