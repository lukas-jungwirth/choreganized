<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { messages, setI18nContext } from '$lib/i18n';
	import { themeColor } from '$lib/theme';
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
	 * Cook mode is the app's darkest screen in *either* theme, so it gets its own
	 * browser chrome (→ SPEC §4.6). Swapped here rather than declared on the
	 * route, because this layout's metas are always first in the head.
	 *
	 * The colours come from `$lib/theme`'s one table — a `<meta>` can't read a
	 * custom property, and three consumers spelling their own literals out is
	 * what let the dark status bar drift a shade off `--bg` (→ DECISIONS #121).
	 *
	 * These are the app's *only* theme-colors — the static icon/PWA tags in
	 * app.html deliberately declare none (→ app.html), where the favicon and
	 * manifest links live.
	 */
	const cookMode = $derived(page.route.id?.endsWith('/cook') ?? false);

	/**
	 * Keep `<html data-theme>` in step after the first paint.
	 *
	 * `hooks.server.ts` stamps the attribute on the server so the document opens
	 * in the right palette, but that runs on a *document* load — and changing the
	 * theme deliberately isn't one (→ `components/settings/ThemeSheet.svelte`).
	 * Re-running the load functions is what updates `data.theme`; this is what
	 * carries it back onto the element the CSS actually reads.
	 *
	 * Removing the attribute is the "System" case: only its absence leaves
	 * `color-scheme: light dark` in charge (→ app.css).
	 */
	$effect(() => {
		if (data.theme) document.documentElement.dataset.theme = data.theme;
		else delete document.documentElement.dataset.theme;
	});
</script>

<svelte:head>
	<!-- With a theme chosen, one meta states it. On "System" there is nothing to
		 state, so both are emitted scoped to the media query the device answers —
		 which is the same question the CSS is asking (→ `$lib/theme`). -->
	{#if data.theme}
		<meta name="theme-color" content={themeColor(data.theme, cookMode)} />
	{:else}
		<meta
			name="theme-color"
			media="(prefers-color-scheme: light)"
			content={themeColor('light', cookMode)}
		/>
		<meta
			name="theme-color"
			media="(prefers-color-scheme: dark)"
			content={themeColor('dark', cookMode)}
		/>
	{/if}
	<!-- Copy, so it speaks the reader's language (→ app.html). -->
	<meta name="description" content={m.meta.description} />
</svelte:head>

{@render children()}
