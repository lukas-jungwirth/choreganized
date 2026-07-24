<!-- New recipe [3c] — the shared form, with nothing to start from. -->
<script lang="ts">
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const m = messages();
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.form.new)}</title>
</svelte:head>

<RecipeForm recipe={null} back="/cooking/recipes" error={form?.error} field={form?.field} />
