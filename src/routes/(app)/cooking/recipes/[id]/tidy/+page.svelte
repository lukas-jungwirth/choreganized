<!--
	A saved recipe's tidy, under review (→ plan 48): plan 45's review screen
	given the recipe, so it says "the saved recipe" where an import says "the
	page", shows the recipe's own photo, and Save updates the recipe in place.
-->
<script lang="ts">
	import ImportReview from '$lib/components/cooking/review/ImportReview.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	const saveError = $derived(form && 'error' in form ? form.error : undefined);
	const saveField = $derived(form && 'field' in form ? form.field : undefined);
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.import.review.title)}</title>
</svelte:head>

<!-- Keyed: another tidy's id is another review, from scratch. -->
{#key data.draft}
	<ImportReview
		id={data.draft}
		edit={data.edit}
		units={data.units}
		error={saveError}
		field={saveField}
		recipe={data.recipe}
	/>
{/key}
