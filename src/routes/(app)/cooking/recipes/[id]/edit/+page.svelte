<!-- Edit recipe [3c] — the same form, opened on what's already saved. -->
<script lang="ts">
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Edit {data.recipe.name} · Choreganized</title>
</svelte:head>

<RecipeForm
	recipe={data.recipe}
	back="/cooking/recipes/{data.recipe.id}"
	error={form?.error}
	field={form?.field}
/>
