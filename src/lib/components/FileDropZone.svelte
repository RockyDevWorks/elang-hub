<script lang="ts">
	import { ACCEPT_ATTRIBUTE } from '$lib/upload/limits';

	interface Props {
		/** Whether a drop target is currently active. */
		dragging?: boolean;
		/** Whether the control should accept input. */
		disabled?: boolean;
		/** Called with the chosen files. */
		onfiles: (files: File[] | null) => void;
		/** Called when a drag enters or leaves the drop target. */
		ondragchange?: (dragging: boolean) => void;
	}

	let { dragging = false, disabled = false, onfiles, ondragchange }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let dragDepth = $state(0);

	function toArray(files: FileList | null): File[] | null {
		return files ? Array.from(files) : null;
	}

	function handleChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		// Copy the FileList into an array before resetting the input:
		// the FileList is live, and `target.value = ''` clears it, so
		// the consumer must see the chosen files first.
		onfiles(toArray(target.files));
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
		onfiles(toArray(event.dataTransfer?.files ?? null));
	}
</script>

<!--
	The dashed border IS the drop affordance — there is no other
	visual signal that this region accepts a dropped file. WCAG
	1.4.11 requires 3:1 for the boundary of a control, so the
	default is `border-gray-500` (~4.83:1 on white) rather than
	the lighter `border-gray-300` (1.47:1, fails).
-->
<div
	class="rounded-lg border-2 border-dashed p-10 text-center transition-colors
		{dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-500 bg-white'}
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
