<script lang="ts">
	import type { GroupView } from '$lib/view';
	import { labelForGroupKind, NO_ROOTS_PLACEHOLDER } from '$lib/phonemes';
	import PhonemeRootRow from './PhonemeRootRow.svelte';

	let { group, id }: { group: GroupView; id: string } = $props();
	const headingId = $derived(id);
</script>

/** * One validated phoneme group (H0402, H0403). * * Groups are sorted in canonical order
(consonants → vowels → * custom-ASCII) by the view layer (H0307). Reserved groups are * labelled
with the canonical plural; custom groups are * title-cased from the validated slug. Empty roots
render a * deliberate placeholder so the user can tell "no phonemes in * this group" apart from a
missing group entirely. */

<section aria-labelledby={headingId} class="group">
	<h2 id={headingId} class="group-title">{labelForGroupKind(group.kind)}</h2>
	{#if group.roots.length === 0}
		<p class="muted">{NO_ROOTS_PLACEHOLDER}</p>
	{:else}
		<ul class="roots">
			{#each group.roots as root, i (i)}
				<PhonemeRootRow {root} />
			{/each}
		</ul>
	{/if}
</section>

<style>
	.group {
		margin: 2rem 0;
		padding: 1.5rem;
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
	}
	.group-title {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: rgb(17 24 39);
	}
	.roots {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.muted {
		color: rgb(107 114 128);
		font-style: italic;
		margin: 0;
	}
</style>
