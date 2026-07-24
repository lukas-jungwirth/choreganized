<!-- Edit recipe [3c] — the same form, opened on what's already saved. -->
<script lang="ts">
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.form.editTitle(data.recipe.name))}</title>
</svelte:head>

<RecipeForm
	recipe={data.recipe}
	back="/cooking/recipes/{data.recipe.id}"
	error={form?.error}
	field={form?.field}
/>
