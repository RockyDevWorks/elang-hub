<script lang="ts">
	import type { RootView } from '$lib/view';
	import { NO_ALLOPHONES_PLACEHOLDER } from '$lib/phonemes';
	import ConditionTree from './ConditionTree.svelte';
	import PhonemeAllophoneRow from './PhonemeAllophoneRow.svelte';

	let { root }: { root: RootView } = $props();
</script>

/** * One validated root phoneme (H0404, H0405). * * Renders the IPA + romanization for the root,
the optional * `when` block, and every allophone under it (H0404). An empty * allophone list renders
a deliberate placeholder so the user * can distinguish "no allophones" from "missing allophones". */

<li class="root">
	<div class="root-header">
		<span class="ipa" lang="und-fonipa">{root.ipa}</span>
		<span class="roman">[{root.roman}]</span>
		{#if root.when}
			<ConditionTree when={root.when} />
		{/if}
	</div>
	{#if root.allophones.length === 0}
		<p class="muted">{NO_ALLOPHONES_PLACEHOLDER}</p>
	{:else}
		<ul class="allophones">
			{#each root.allophones as allo, i (i)}
				<PhonemeAllophoneRow allophone={allo} />
			{/each}
		</ul>
	{/if}
</li>

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid rgb(229 231 235);
	}
	.root:last-child {
		border-bottom: none;
	}
	.root-header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
	}
	.ipa {
		font-size: 1.5rem;
		font-weight: 600;
	}
	.roman {
		font-size: 1rem;
		color: rgb(75 85 99);
	}
	.allophones {
		list-style: none;
		padding: 0;
		margin: 0;
		padding-left: 1.25rem;
		border-left: 2px solid rgb(229 231 235);
	}
	.muted {
		color: rgb(107 114 128);
		font-style: italic;
		font-size: 0.875rem;
		margin: 0;
	}
</style>
