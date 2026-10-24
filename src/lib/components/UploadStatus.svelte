<script lang="ts">
	import { describeSelection, type UploadState } from '$lib/upload/controller';

	interface Props {
		state: UploadState;
		oncancel: () => void;
		onreset: () => void;
	}

	let { state, oncancel, onreset }: Props = $props();

	const busy = $derived(state.phase === 'reading' || state.phase === 'validating');
</script>

<div class="mt-6 space-y-4">
	{#if state.phase !== 'idle'}
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="font-medium text-gray-900">{describeSelection(state)}</p>

				{#if busy}
					<button
						type="button"
						class="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50
							focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						onclick={oncancel}
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						class="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50
							focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						onclick={onreset}
					>
						Reset
					</button>
				{/if}
			</div>

			{#if busy}
				<div class="mt-3">
					<div
						class="h-2 w-full overflow-hidden rounded bg-gray-200"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={state.progress}
						aria-label={state.phase === 'reading' ? 'Reading package' : 'Validating package'}
					>
						<div class="h-full bg-blue-600 transition-all" style="width: {state.progress}%"></div>
					</div>
					<p class="mt-1 text-xs text-gray-500">
						{state.phase === 'reading' ? 'Reading package…' : 'Validating package…'}
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if state.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4" role="alert" aria-live="assertive">
			<p class="font-medium text-red-800">{state.error.message}</p>
		</div>
	{/if}

	{#if state.result && !state.result.ok}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-4" role="alert">
			<p class="font-medium text-amber-900">This package was not accepted.</p>
			{#if state.result.messages.length > 0}
				<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
					{#each state.result.messages as message, i (i)}
						<li>{message}</li>
					{/each}
				</ul>
			{/if}
			{#if state.result.diagnostics.length > 0}
				<ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
					{#each state.result.diagnostics as diagnostic, i (i)}
						<li><code>{diagnostic}</code></li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if state.result?.ok}
		<div class="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
			<p class="font-medium text-green-800">This package is valid.</p>
		</div>
	{/if}
</div>
