<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	/**
	 * Cook mode is the one dark screen in the app, so it gets the one dark
	 * browser chrome (→ SPEC §4.6). Swapped here rather than declared on the
	 * route, because two `theme-color` metas mean the first wins — and this
	 * layout's is always first.
	 *
	 * The two literals are `--bg` and `--cook-bg`. A `<meta>` can't read a custom
	 * property, which is why this is the only place outside `app.css` that spells
	 * a colour out.
	 */
	const cookMode = $derived(page.route.id?.endsWith('/cook') ?? false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content={cookMode ? '#22201C' : '#F5F3EE'} />
</svelte:head>

{@render children()}
