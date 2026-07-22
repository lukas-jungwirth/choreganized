<!-- New recipe [3c] — the shared form, with nothing to start from. -->
<script lang="ts">
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>New recipe · Choreganized</title>
</svelte:head>

<RecipeForm recipe={null} back="/cooking/recipes" error={form?.error} field={form?.field} />
