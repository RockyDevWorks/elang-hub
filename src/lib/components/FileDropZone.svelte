<script lang="ts">
	import { ACCEPT_ATTRIBUTE } from '$lib/upload/limits';

	interface Props {
		/** Whether a drop target is currently active. */
		dragging?: boolean;
		/** Whether the control should accept input. */
		disabled?: boolean;
		/** Called with the chosen files. */
		onfiles: (files: FileList | null) => void;
		/** Called when a drag enters or leaves the drop target. */
		ondragchange?: (dragging: boolean) => void;
	}

	let { dragging = false, disabled = false, onfiles, ondragchange }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let dragDepth = $state(0);

	function handleChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		onfiles(target.files);
		// Reset the input so re-selecting the same file fires `change`
		// again.
		target.value = '';
	}

	function handleDragEnter(event: DragEvent): void {
		event.preventDefault();
		if (disabled) {
			return;
		}
		dragDepth += 1;
		ondragchange?.(true);
	}

	function handleDragOver(event: DragEvent): void {
		// Without this the browser refuses the drop.
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent): void {
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) {
			ondragchange?.(false);
		}
	}

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		dragDepth = 0;
		ondragchange?.(false);
		if (disabled) {
			return;
		}
		onfiles(event.dataTransfer?.files ?? null);
	}
</script>

<div
	class="rounded-lg border-2 border-dashed p-10 text-center transition-colors
		{dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}
		{disabled ? 'opacity-60' : ''}"
	role="group"
	aria-label="Package upload"
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<p class="mb-4 text-gray-600">
		Drop an <code class="rounded bg-gray-100 px-2 py-1 text-sm">.elang</code> package here, or
	</p>

	<input
		bind:this={input}
		type="file"
		class="sr-only"
		accept={ACCEPT_ATTRIBUTE}
		{disabled}
		onchange={handleChange}
	/>

	<button
		type="button"
		class="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700
			focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none
			disabled:cursor-not-allowed disabled:bg-gray-400"
		{disabled}
		onclick={() => input?.click()}
	>
		Choose a package
	</button>

	<p class="mt-4 text-xs text-gray-500">One package at a time, up to 16 MB.</p>
</div>
