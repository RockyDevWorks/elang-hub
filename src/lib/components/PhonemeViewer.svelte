<script lang="ts">
	import type { PhonemeView } from '$lib/view';
	import { labelForGroupKind, NO_PHONEMES_PLACEHOLDER, summarizeInventory } from '$lib/phonemes';
	import PhonemeMetadata from './PhonemeMetadata.svelte';
	import PhonemeGroupSection from './PhonemeGroupSection.svelte';
	import PhonemeDiagnosticsList from './PhonemeDiagnosticsList.svelte';

	let { view }: { view: Extract<PhonemeView, { ok: true }> } = $props();

	const summary = $derived(summarizeInventory(view.view.inventory));
	const groups = $derived(view.view.inventory.groups);
</script>

/** * Top-level phoneme viewer (H0401–H0405). * * Renders the validated `PhonemeView`: * * - package
metadata (H0401) * - inventory summary (H0404 — every validated phoneme) * - in-page nav of group
sections (H0407) * - one `PhonemeGroupSection` per group (H0402, H0403) * - SDK advisories (H0405) *
- skip link for keyboard users (H0407) * * The viewer renders only what the SDK emitted. Empty
states * are deliberate placeholders; positions in a chart that the * SDK did not define are NOT
invented (H0304). */

<a class="skip-link" href="#inventory">Skip to inventory</a>
<article class="phoneme-viewer" aria-labelledby="language-name">
	<PhonemeMetadata pkg={view.view.package} phonemeResourcePath={view.view.phonemeResourcePath} />

	<section id="inventory" class="inventory-summary" aria-label="Inventory summary">
		<h2>Phoneme Inventory</h2>
		<p>{summary}</p>
	</section>

	{#if view.view.inventory.isEmpty}
		<p class="empty">{NO_PHONEMES_PLACEHOLDER}</p>
	{:else}
		<nav aria-label="Inventory sections" class="group-nav">
			<ul>
				{#each groups as group (labelForGroupKind(group.kind))}
					<li>
						<a href="#group-{labelForGroupKind(group.kind).replace(/\s+/g, '-').toLowerCase()}">
							{labelForGroupKind(group.kind)}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		{#each groups as group (labelForGroupKind(group.kind))}
			<PhonemeGroupSection
				{group}
				id="group-{labelForGroupKind(group.kind).replace(/\s+/g, '-').toLowerCase()}"
			/>
		{/each}
	{/if}

	<PhonemeDiagnosticsList diagnostics={view.view.diagnostics} />
</article>

<style>
	.phoneme-viewer {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.inventory-summary {
		padding: 1rem 1.5rem;
		background: rgb(239 246 255);
		border: 1px solid rgb(191 219 254);
		border-radius: 0.5rem;
	}
	.inventory-summary h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 700;
		color: rgb(30 58 138);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.inventory-summary p {
		margin: 0;
		font-size: 1.125rem;
		color: rgb(30 64 175);
		font-weight: 600;
	}
	.group-nav {
		padding: 0.5rem 1rem;
		background: rgb(249 250 251);
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
	}
	.group-nav ul {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0;
		margin: 0;
	}
	.group-nav a {
		color: rgb(37 99 235);
		text-decoration: none;
		font-weight: 500;
	}
	.group-nav a:hover {
		text-decoration: underline;
	}
	.group-nav a:focus-visible {
		outline: 2px solid rgb(37 99 235);
		outline-offset: 2px;
	}
	.empty {
		padding: 2rem;
		text-align: center;
		color: rgb(107 114 128);
		font-style: italic;
		background: rgb(249 250 251);
		border-radius: 0.5rem;
	}
	.skip-link {
		position: absolute;
		left: -9999px;
		top: 0;
		z-index: 50;
		padding: 0.5rem 1rem;
		background: rgb(17 24 39);
		color: white;
		font-weight: 600;
		border-radius: 0.25rem;
	}
	.skip-link:focus {
		left: 1rem;
		top: 1rem;
	}
</style>
