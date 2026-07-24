<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { messages, setI18nContext } from '$lib/i18n';
	import { untrack } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/**
	 * The request's language, put where every component can reach it. Done here,
	 * once, above everything — including login and onboarding, which sit outside
	 * `(app)` and have no household to take a language from.
	 */
	setI18nContext(untrack(() => data.locale));

	const m = messages();

	/**
	 * The catalog above is a snapshot taken at mount, which is safe exactly as
	 * long as changing language is a *document* load: `<html lang>`, the `Intl`
	 * formatter caches and every server-rendered string have to change together.
	 * The switcher posts a plain form for that reason (→ SPEC §6) — this is what
	 * keeps that true if anyone ever enhances it.
	 */
	const mounted = untrack(() => data.locale);

	$effect(() => {
		if (data.locale !== mounted) location.reload();
	});

	/**
	 * Cook mode is the one dark screen in the app, so it gets the one dark
	 * browser chrome (→ SPEC §4.6). Swapped here rather than declared on the
	 * route, because two `theme-color` metas mean the first wins — and this
	 * layout's is always first.
	 *
	 * The two literals are `--bg` and `--cook-bg`. A `<meta>` can't read a custom
	 * property, which is why this is the only place outside `app.css` that spells
	 * a colour out.
	 *
	 * This is the app's *only* theme-color, so it is always first in the head and
	 * always wins — the static icon/PWA tags in app.html deliberately declare none
	 * (→ app.html). The favicon and manifest links live there too.
	 */
	const cookMode = $derived(page.route.id?.endsWith('/cook') ?? false);
</script>

<svelte:head>
	<meta name="theme-color" content={cookMode ? '#22201C' : '#F5F3EE'} />
	<!-- Copy, so it speaks the reader's language (→ app.html). -->
	<meta name="description" content={m.meta.description} />
</svelte:head>

{@render children()}
