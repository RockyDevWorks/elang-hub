<script lang="ts">
	import type { SdkDiagnostic } from '$lib/sdk/contract';

	let { diagnostics }: { diagnostics: readonly SdkDiagnostic[] } = $props();
</script>

/** * Optional SDK advisory list (H0405). * * The SDK may emit advisories that did not block success
— e.g. * a deprecated feature in the ELD, a hint about a future spec * revision. The page renders
them as a small list so the user * can see them without treating them as failures. * * If the SDK
reported no diagnostics, this component renders * nothing at all (no empty-state placeholder —
silence is the * correct answer when there is nothing to say). */

{#if diagnostics.length > 0}
	<aside class="diagnostics" aria-label="Validation advisories">
		<h3>Advisories</h3>
		<ul>
			{#each diagnostics as d, i (i)}
				<li>
					<span class="stage">{d.stage}</span>
					<span class="code">{d.code}</span>
					<span class="message">{d.message}</span>
				</li>
			{/each}
		</ul>
	</aside>
{/if}

<style>
	.diagnostics {
		margin: 2rem 0;
		padding: 1rem 1.5rem;
		background: rgb(254 252 232);
		border: 1px solid rgb(252 211 77);
		border-radius: 0.5rem;
	}
	h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 700;
		color: rgb(146 64 14);
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.875rem;
		color: rgb(120 53 15);
	}
	.stage,
	.code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		padding: 0.125rem 0.375rem;
		background: rgb(255 255 255);
		border: 1px solid rgb(252 211 77);
		border-radius: 0.25rem;
	}
	.message {
		flex: 1 1 100%;
	}
</style>
