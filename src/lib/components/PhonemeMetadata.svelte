<script lang="ts">
	import type { PackageView } from '$lib/view';
	import { NO_DESCRIPTION_PLACEHOLDER } from '$lib/phonemes';

	let { pkg, phonemeResourcePath }: { pkg: PackageView; phonemeResourcePath: string } = $props();
</script>

/** * Package metadata header (H0401, H0302). * * Shows the validated language name, identifier,
language * version, spec/container versions, and the EPF-manifest-derived * phoneme resource path.
The `description` placeholder is * rendered when the package omits it; no field is invented. * * The
package view deliberately has no `verifiedBy`, `author`, * `signer`, `publisher`, or `trusted` field
— integrity is not * authorship (H0302). The header does not invent any of those. */

<header class="metadata" aria-labelledby="language-name">
	<h1 id="language-name" class="language-name">{pkg.name}</h1>
	<p class="identifier"><code>{pkg.identifier}</code></p>
	<dl class="facts">
		<div class="fact">
			<dt>Language version</dt>
			<dd>{pkg.languageVersion}</dd>
		</div>
		<div class="fact">
			<dt>Spec version</dt>
			<dd><code>{pkg.specVersions.specVersion}</code></dd>
		</div>
		<div class="fact">
			<dt>Container version</dt>
			<dd><code>{pkg.specVersions.binaryContainerVersion}</code></dd>
		</div>
		<div class="fact">
			<dt>Phoneme resource</dt>
			<dd><code>{phonemeResourcePath}</code></dd>
		</div>
	</dl>
	<p class="description">
		{pkg.description ?? NO_DESCRIPTION_PLACEHOLDER}
	</p>
</header>

<style>
	.metadata {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 2rem;
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
	}
	.language-name {
		margin: 0;
		font-size: 2rem;
		font-weight: 800;
		color: rgb(17 24 39);
	}
	.identifier {
		margin: 0;
		font-size: 0.875rem;
		color: rgb(75 85 99);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
		margin: 0;
	}
	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fact dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(107 114 128);
	}
	.fact dd {
		margin: 0;
		font-size: 0.95rem;
		color: rgb(17 24 39);
	}
	.description {
		margin: 0;
		color: rgb(55 65 81);
		line-height: 1.5;
	}
</style>
