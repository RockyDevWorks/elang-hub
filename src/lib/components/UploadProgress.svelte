<script lang="ts">
	import { CANCEL_LABEL, formatBytes } from '$lib/phonemes';

	let {
		fileName,
		fileSize,
		progress,
		cancel
	}: { fileName: string; fileSize: number; progress: number; cancel: () => void } = $props();

	const bounded = $derived(Math.max(0, Math.min(100, Math.round(progress))));
</script>

<div class="progress" role="status" aria-live="polite">
	<p class="label">
		Validating <strong>{fileName}</strong> ({formatBytes(fileSize)})…
	</p>
	<div
		class="progress-bar"
		role="progressbar"
		aria-valuenow={bounded}
		aria-valuemin="0"
		aria-valuemax="100"
		aria-label="Validation progress"
	>
		<div class="progress-fill" style="width: {bounded}%"></div>
	</div>
	<p class="percent" aria-hidden="true">{bounded}%</p>
	<button type="button" class="cancel-button" onclick={cancel}>
		{CANCEL_LABEL}
	</button>
</div>

<style>
	.progress {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 2rem;
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.5rem;
	}
	.label {
		margin: 0;
		font-size: 1rem;
		color: rgb(17 24 39);
	}
	.progress-bar {
		height: 0.75rem;
		background: rgb(229 231 235);
		border-radius: 9999px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: rgb(37 99 235);
		transition: width 0.15s ease;
	}
	.percent {
		margin: 0;
		font-size: 0.875rem;
		color: rgb(75 85 99);
		text-align: right;
	}
	.cancel-button {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background: white;
		color: rgb(17 24 39);
		border: 1px solid rgb(209 213 219);
		border-radius: 0.375rem;
		font-weight: 500;
		cursor: pointer;
	}
	.cancel-button:hover {
		background: rgb(243 244 246);
	}
	.cancel-button:focus-visible {
		outline: 2px solid rgb(37 99 235);
		outline-offset: 2px;
	}
</style>
