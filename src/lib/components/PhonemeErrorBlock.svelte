<script lang="ts">
	import { REPLACE_FILE_LABEL, formatBytes, type PhonemePageErrorInfo } from '$lib/phonemes';

	let {
		error,
		fileName,
		fileSize,
		replace
	}: {
		error: PhonemePageErrorInfo;
		fileName: string;
		fileSize: number;
		replace: () => void;
	} = $props();
</script>

<div class="error-block" role="alert">
	<h2>{error.title}</h2>
	<p class="message">{error.message}</p>
	{#if error.detail}
		<p class="detail"><code>{error.detail}</code></p>
	{/if}
	<p class="muted">{fileName} ({formatBytes(fileSize)})</p>
	<button type="button" class="replace-button" onclick={replace}>
		{REPLACE_FILE_LABEL}
	</button>
</div>

<style>
	.error-block {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 2rem;
		background: rgb(254 242 242);
		border: 1px solid rgb(252 165 165);
		border-radius: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: rgb(153 27 27);
	}
	.message {
		margin: 0;
		color: rgb(127 29 29);
		line-height: 1.5;
	}
	.detail {
		margin: 0;
		font-size: 0.875rem;
		color: rgb(127 29 29);
	}
	.muted {
		margin: 0;
		font-size: 0.75rem;
		/* rgb(107 114 128) only reaches 4.42:1 against the error
		 * fill — under the 4.5:1 AA minimum for normal text. */
		color: rgb(75 85 99);
	}
	.replace-button {
		align-self: flex-start;
		padding: 0.625rem 1.25rem;
		background: white;
		color: rgb(17 24 39);
		/* The button sits on the error fill, and white-on-error-fill
		 * is a 1.03:1 difference — so this border is the only cue
		 * that the surface is a control. WCAG 1.4.11 needs 3:1;
		 * this is 4.42:1 on the error fill. */
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
</style>
