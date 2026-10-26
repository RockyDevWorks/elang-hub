<script lang="ts">
	import { Upload } from '@lucide/svelte';
	import { UPLOAD_DROP_ZONE_LABEL, UPLOAD_PICKER_LABEL } from '$lib/phonemes';
	import { ACCEPT_ATTRIBUTE } from '$lib/upload/limits';

	let { onfiles }: { onfiles: (files: File[] | null) => void } = $props();
	let dragging = $state(false);
	let depth = $state(0);
	let fileInput: HTMLInputElement | null = $state(null);

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		depth += 1;
		if (depth === 1) dragging = true;
	}
	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		depth = Math.max(0, depth - 1);
		if (depth === 0) dragging = false;
	}
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		depth = 0;
		dragging = false;
		const dt = e.dataTransfer;
		const files = dt?.files ? Array.from(dt.files) : null;
		onfiles(files);
	}
	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files ? Array.from(target.files) : null;
		onfiles(files);
		target.value = '';
	}
	function openPicker() {
		fileInput?.click();
	}
</script>

<div
	class="drop-zone"
	class:dragging
	role="region"
	aria-label={UPLOAD_DROP_ZONE_LABEL}
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<div class="icon-circle" aria-hidden="true">
		<Upload size={32} />
	</div>
	<p class="primary">Drop an <code>.elang</code> package here</p>
	<p class="muted">— or —</p>
	<button type="button" class="picker-button" onclick={openPicker}>
		{UPLOAD_PICKER_LABEL}
	</button>
	<input
		bind:this={fileInput}
		type="file"
		accept={ACCEPT_ATTRIBUTE}
		class="sr-only"
		tabindex="-1"
		aria-label="ELANG package file"
		onchange={handleChange}
	/>
</div>

<style>
	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 3rem 1.5rem;
		/* The dashed border IS the drop affordance — there is no
		 * other visual signal that this region accepts a dropped
		 * file. WCAG 1.4.11 requires 3:1 for the boundary of a
		 * control, so it is `rgb(140 140 140)` (3.36:1 on white),
		 * not the lighter grey used for decorative separators. */
		border: 2px dashed rgb(140 140 140);
		border-radius: 0.75rem;
		background: white;
		transition: border-color 0.15s ease;
	}
	.drop-zone.dragging {
		border-color: rgb(37 99 235);
		background: rgb(239 246 255);
	}
	/* The drag fill is a blue tint, so the default muted grey only
	 * reaches 4.44:1 against it — under the 4.5:1 AA minimum for
	 * normal text. Darken the helper text for this state only. */
	.drop-zone.dragging .muted {
		color: rgb(75 85 99);
	}
	.icon-circle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		background: rgb(219 234 254);
		color: rgb(37 99 235);
		border-radius: 9999px;
	}
	.primary {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
		color: rgb(17 24 39);
	}
	.muted {
		margin: 0;
		color: rgb(107 114 128);
		font-size: 0.875rem;
	}
	.picker-button {
		padding: 0.625rem 1.25rem;
		background: rgb(37 99 235);
		color: white;
		font-weight: 600;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
	}
	.picker-button:hover {
		background: rgb(29 78 216);
	}
	.picker-button:focus-visible {
		outline: 2px solid rgb(37 99 235);
		outline-offset: 2px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
