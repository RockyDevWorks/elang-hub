<!--
	Phonemes Page (H0401).

	The single route the v0.1.0 read-only viewer ships with. The page
	hosts the `PhonemePageController` (the four-phase state machine)
	and renders one of four subtrees based on the current phase:

	  - `idle`        → `UploadPrompt`
	  - `validating`  → `UploadProgress` (with cancel)
	  - `view`        → `PhonemeViewer` + "Upload another file"
	  - `error`       → `PhonemeErrorBlock` + "Upload another file"

	The page NEVER owns the bytes — they are forwarded to the server
	endpoint via `requestPhonemeView` and dropped on response. The
	controller is the only place that mutates state.
-->

<script lang="ts">
	import { PhonemePageController, type PhonemePageState } from '$lib/phonemes';
	import { requestPhonemeView } from '$lib/phonemes/client';
	import PhonemeViewer from '$lib/components/PhonemeViewer.svelte';
	import UploadPrompt from '$lib/components/UploadPrompt.svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import PhonemeErrorBlock from '$lib/components/PhonemeErrorBlock.svelte';
	import { REPLACE_FILE_LABEL } from '$lib/phonemes/format';

	const controller = new PhonemePageController();
	let state: PhonemePageState = $state(controller.state);

	// Mirror controller state into the Svelte runtime so the template
	// re-renders on every transition. The unsubscribe runs on effect
	// teardown so a route navigation cleans up cleanly.
	$effect(() => {
		return controller.subscribe((next) => {
			state = next;
		});
	});

	function handleFiles(files: File[] | null) {
		const file = files?.[0];
		if (!file) return;
		void controller.select(file, requestPhonemeView);
	}
</script>

<svelte:head>
	<title>ELANG Hub — Phoneme Viewer</title>
	<meta name="description" content="Explore validated ELANG language packages" />
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1>ELANG Hub</h1>
		<p class="subtitle">Phoneme Viewer v0.1.0</p>
	</header>

	<main class="page-main">
		{#if state.phase === 'idle'}
			<UploadPrompt onfiles={handleFiles} />
		{:else if state.phase === 'validating'}
			<UploadProgress
				fileName={state.fileName}
				fileSize={state.fileSize}
				progress={state.progress}
				cancel={state.cancel}
			/>
		{:else if state.phase === 'view'}
			<PhonemeViewer view={state.view} />
			<div class="replace-row">
				<button type="button" class="replace-button" onclick={state.replace}>
					{REPLACE_FILE_LABEL}
				</button>
			</div>
		{:else if state.phase === 'error'}
			<PhonemeErrorBlock
				error={state.error}
				fileName={state.fileName}
				fileSize={state.fileSize}
				replace={state.replace}
			/>
		{/if}
	</main>

	<footer class="page-footer">
		<p>ELANG Hub v0.1.0 — Read-only phoneme viewer</p>
		<p class="muted">No accounts, persistence, or social features in this release</p>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: rgb(249 250 251);
	}
	.page-header {
		padding: 1rem 1.5rem;
		background: white;
		border-bottom: 1px solid rgb(229 231 235);
	}
	.page-header h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: rgb(17 24 39);
	}
	.subtitle {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		color: rgb(75 85 99);
	}
	.page-main {
		flex: 1 1 auto;
		width: 100%;
		max-width: 64rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.replace-row {
		display: flex;
		justify-content: flex-start;
	}
	.replace-button {
		padding: 0.625rem 1.25rem;
		background: white;
		color: rgb(17 24 39);
		/* The border is the only cue that this surface is a
		 * control, so it meets WCAG 1.4.11's 3:1 minimum
		 * (4.83:1 on white). */
		border: 1px solid rgb(107 114 128);
		border-radius: 0.5rem;
		font-weight: 500;
		cursor: pointer;
	}
	.replace-button:hover {
		background: rgb(243 244 246);
	}
	.replace-button:focus-visible {
		outline: 2px solid rgb(37 99 235);
		outline-offset: 2px;
	}
	.page-footer {
		padding: 2rem 1.5rem;
		border-top: 1px solid rgb(229 231 235);
		text-align: center;
		font-size: 0.875rem;
		color: rgb(75 85 99);
	}
	.page-footer p {
		margin: 0;
	}
	.page-footer .muted {
		margin-top: 0.25rem;
		color: rgb(107 114 128);
	}
	@media (min-width: 640px) {
		.page-main {
			padding: 3rem 1.5rem;
		}
		.page-header h1 {
			font-size: 1.75rem;
		}
	}
</style>
