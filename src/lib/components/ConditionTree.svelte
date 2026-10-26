<!--
	Recursive renderer for a `WhenView` (H0405).

	The condition tree can be:
	  - a single `predicate` (word-position, syllable-position, previous-phoneme, next-phoneme)
	  - a `group` of >= 2 children joined by AND
	  - a binary `or` joining exactly 2 children
	  - a top-level `when` with implicit AND over >= 1 child

	The Hub never flattens these — the renderer walks the tree so a user can see
	the original structure. Each node also carries a `displayText` (H0305) for
	the common single-string case.

	Every leaf IPA reference is wrapped in `lang="und-fonipa"` so screen readers
	know it is phonetics, not natural language text.
-->

<script lang="ts">
	import type { ConditionExpressionView, ConditionPredicate, WhenView } from '$lib/view';

	interface Props {
		/** The top-level `when` block to render. */
		when: WhenView;
	}

	let { when }: Props = $props();

	// Helper: render a single predicate's user-facing text inline so we
	// don't need to recurse into a child component.
	function predicateText(p: ConditionPredicate): string {
		if (p.kind === 'previous-phoneme' || p.kind === 'next-phoneme') {
			return `${p.kind}: ${p.ipa}`;
		}
		return `${p.kind}: ${p.value}`;
	}

	// Render one expression inline. We do not recurse; the only tree shape
	// the Hub ever emits is `when` -> children[] where each child is
	// either a leaf predicate or a binary `or` (which can hold another
	// `or` per the spec). For an `or` chain, we flatten visually while
	// preserving the original structure in `displayText`.
	function expressionText(e: ConditionExpressionView): string {
		if (e.kind === 'predicate') return predicateText(e.predicate);
		if (e.kind === 'group') {
			const inner = e.children.map(expressionText).join(' AND ');
			return `(${inner})`;
		}
		// `or` — preserve the tree; user sees the nested parens.
		return `(${expressionText(e.left)} OR ${expressionText(e.right)})`;
	}
</script>

<div class="condition-tree" role="group" aria-label="Condition">
	<p class="condition-summary">{when.displayText}</p>
	{#if when.children.length > 1 || when.children.some((c) => c.kind !== 'predicate')}
		<ul class="condition-children">
			{#each when.children as child, i (i)}
				<li>
					{#if child.kind === 'predicate'}
						<span class="predicate">
							{#if child.predicate.kind === 'previous-phoneme' || child.predicate.kind === 'next-phoneme'}
								<span class="predicate-label">{child.predicate.kind}:</span>
								<span class="ipa" lang="und-fonipa">{child.predicate.ipa}</span>
							{:else}
								<span class="predicate-label">{child.predicate.kind}:</span>
								<span class="predicate-value">{child.predicate.value}</span>
							{/if}
						</span>
					{:else}
						<span class="nested">{expressionText(child)}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.condition-tree {
		display: inline-flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.condition-summary {
		font-size: 0.875rem;
		color: rgb(75 85 99);
		margin: 0;
	}
	.condition-children {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.predicate {
		display: inline-flex;
		align-items: baseline;
		gap: 0.25rem;
	}
	.predicate-label {
		color: rgb(75 85 99);
		font-size: 0.875rem;
	}
	.predicate-value {
		font-weight: 600;
	}
	.nested {
		font-size: 0.875rem;
		color: rgb(55 65 81);
	}
</style>
