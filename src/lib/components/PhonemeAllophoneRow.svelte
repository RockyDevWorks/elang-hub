<script lang="ts">
	import type { AllophoneView } from '$lib/view';
	import { labelForAllophoneRoman } from '$lib/phonemes';
	import ConditionTree from './ConditionTree.svelte';

	let { allophone }: { allophone: AllophoneView } = $props();
</script>

<!-- * One validated allophone (H0404, H0405). * * Renders the IPA identifier with the romanization +
roman-kind * label, and the optional `when` block. The IPA string is set * verbatim — the SDK
contract preserves it byte-exactly (H0303). -->

<li class="allophone">
	<span class="ipa" lang="und-fonipa">{allophone.ipa}</span>
	<span class="roman">[{allophone.roman}]</span>
	<span class="roman-kind">{labelForAllophoneRoman(allophone.romanKind)}</span>
	{#if allophone.when}
		<ConditionTree when={allophone.when} />
	{/if}
</li>

<style>
	.allophone {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}
	.ipa {
		font-size: 1.25rem;
		font-weight: 600;
	}
	.roman {
		font-size: 0.875rem;
		color: rgb(75 85 99);
	}
	.roman-kind {
		font-size: 0.75rem;
		color: rgb(107 114 128);
		font-style: italic;
	}
</style>
