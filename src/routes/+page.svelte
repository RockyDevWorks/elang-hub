<script lang="ts">
	import { Upload } from '@lucide/svelte';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import UploadStatus from '$lib/components/UploadStatus.svelte';
	import { UploadController, type UploadState } from '$lib/upload/controller';
	import { requestValidation } from '$lib/upload/client';

	const controller = new UploadController();
	let uploadState = $state<UploadState>(controller.state);
	let dragging = $state(false);

	$effect(() => {
		return controller.subscribe((next: UploadState) => {
			uploadState = next;
		});
	});

	const busy = $derived(uploadState.phase === 'reading' || uploadState.phase === 'validating');

	function handleFiles(files: FileList | null): void {
		void controller.select(files, requestValidation);
	}
</script>

<svelte:head>
	<title>ELANG Hub - Phoneme Viewer</title>
	<meta name="description" content="Explore validated ELANG language packages" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<header class="bg-white shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<h1 class="text-2xl font-bold text-gray-900">ELANG Hub</h1>
			<p class="text-sm text-gray-600">Phoneme Viewer v0.1.0</p>
		</div>
	</header>

	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
		<div class="text-center">
			<div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
				<Upload class="w-8 h-8 text-blue-600" />
			</div>
			<h2 class="text-3xl font-bold text-gray-900 mb-4">Upload an ELANG Package</h2>
			<p class="text-gray-600 mb-8">
				Upload a <code class="px-2 py-1 bg-gray-100 rounded text-sm">.elang</code> file to view its phonological
				inventory
			</p>

			<div class="max-w-md mx-auto">
				<FileDropZone
					{dragging}
					disabled={busy}
					onfiles={handleFiles}
					ondragchange={(next) => (dragging = next)}
				/>

				<UploadStatus
					state={uploadState}
					oncancel={() => controller.cancel()}
					onreset={() => controller.reset()}
				/>
			</div>
		</div>
	</main>

	<footer class="mt-16 py-8 border-t border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
			<p>ELANG Hub v0.1.0 — Read-only phoneme viewer</p>
			<p class="mt-1">No accounts, persistence, or social features in this release</p>
		</div>
	</footer>
</div>
