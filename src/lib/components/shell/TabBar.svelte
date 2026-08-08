<!--
	The four tabs [02], treatment [01/1d]: outline, icon-only when idle; the
	active tab fills its icon, reveals its label, and wears a soft sage pill.
	That pill is a single element [.bubble] measured to the active tab and
	transitioned between them, so switching tabs slides + resizes it into place.

	Frosted, hairline-topped, pinned to the bottom of the 480px column (not the
	viewport) so it lines up with the shell on a desktop window. Tasks carries
	the current member's overdue count [4e].
-->
<script lang="ts">
	import { page } from '$app/state';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
	import { messages } from '$lib/i18n';
	import type { Component } from 'svelte';

	type Props = {
		/** Tasks badge; 0 hides it. */
		overdueCount?: number;
	};

	let { overdueCount = 0 }: Props = $props();

	const m = messages();

	type Tab = {
		href: string;
		label: string;
		icon: Component<{ size?: number; strokeWidth?: number; filled?: boolean }>;
		badge?: boolean;
	};

	// Built once at init, not `$derived`: the language of a mounted page never
	// changes under it (→ `$lib/i18n/context.ts`), and the bubble measures off
	// these labels' widths.
	const TABS: Tab[] = [
		{ href: '/home', label: m.nav.home, icon: HomeIcon },
		{ href: '/shopping', label: m.nav.shopping, icon: BasketIcon },
		{ href: '/cooking', label: m.nav.cooking, icon: ChefHatIcon },
		{ href: '/tasks', label: m.nav.tasks, icon: ChecklistIcon, badge: true }
	];

	/** `/tasks/history` keeps the Tasks tab lit. */
	function isActive(href: string, pathname: string) {
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	const activeIndex = $derived(TABS.findIndex((t) => isActive(t.href, page.url.pathname)));
	const badge = $derived(overdueCount > 99 ? '99+' : String(overdueCount));

	// The sliding "bubble": one pill overlaid on the active tab. Tab widths
	// change instantly (only their labels fade), so the moment the active tab
	// flips the geometry below is already final — the pill just glides to it.
	let navEl = $state<HTMLElement>();
	let bubble = $state({ x: 0, y: 0, w: 0, h: 0 });
	let ready = $state(false); // gate the transition so the pill fades in, not flies in, on load

	function measure() {
		if (!navEl || activeIndex < 0) return;
		const el = navEl.querySelectorAll<HTMLElement>('.tab')[activeIndex];
		if (!el) return;
		bubble = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
	}

	// Re-measure when the active tab changes (and when the badge could nudge widths).
	$effect(() => {
		activeIndex;
		overdueCount;
		measure();
	});

	$effect(() => {
		measure();
		const raf = requestAnimationFrame(() => (ready = true));
		const ro = new ResizeObserver(() => measure());
		if (navEl) ro.observe(navEl);
		// Label widths depend on Figtree; re-measure once the web font swaps in.
		void document.fonts?.ready.then(measure);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	});
</script>

<nav class="tabbar" bind:this={navEl} aria-label={m.nav.sections}>
	<span
		class="bubble"
		class:ready={ready && activeIndex >= 0}
		style="transform: translate({bubble.x}px, {bubble.y}px); width: {bubble.w}px; height: {bubble.h}px"
		aria-hidden="true"
	></span>
	{#each TABS as tab, i (tab.href)}
		{@const active = i === activeIndex}
		<a
			class="tab"
			class:active
			href={tab.href}
			aria-current={active ? 'page' : undefined}
			aria-label={tab.badge && overdueCount > 0
				? `${tab.label}, ${m.nav.overdueBadge(overdueCount)}`
				: tab.label}
		>
			<span class="icon">
				<tab.icon size={active ? 21 : 23} filled={active} />
				{#if tab.badge && overdueCount > 0}
					<span class="badge" aria-hidden="true">{badge}</span>
				{/if}
			</span>
			<span class="label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		max-width: 480px;
		height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		padding: 0 22px env(safe-area-inset-bottom);
		border-top: 1px solid var(--tabbar-border);
		background: var(--tabbar-bg);
		box-shadow: var(--shadow-tabbar);
		backdrop-filter: blur(18px) saturate(1.1);
		-webkit-backdrop-filter: blur(18px) saturate(1.1);
	}

	.bubble {
		position: absolute;
		left: 0;
		top: 0;
		border-radius: 20px;
		background: var(--tabbar-pill);
		opacity: 0;
		pointer-events: none;
		z-index: 0;
		will-change: transform, width;
	}

	/* Enabled a frame after mount → the pill fades in place; thereafter it glides. */
	.bubble.ready {
		opacity: 1;
		transition:
			transform 0.44s cubic-bezier(0.34, 1.26, 0.5, 1),
			width 0.44s cubic-bezier(0.34, 1.26, 0.5, 1),
			height 0.44s cubic-bezier(0.34, 1.26, 0.5, 1),
			opacity 0.25s ease;
	}

	.tab {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0;
		padding: 10px;
		border-radius: 20px;
		color: var(--text-5);
		white-space: nowrap;
	}

	.tab.active {
		gap: 9px;
		padding: 10px 18px;
		color: var(--tabbar-active);
	}

	.tab.active .icon {
		color: var(--sage);
	}

	.icon {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 23px;
		height: 23px;
	}

	.label {
		max-width: 0;
		overflow: hidden;
		opacity: 0;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		line-height: 1;
		transition: opacity 0.18s ease;
	}

	.tab.active .label {
		max-width: 140px;
		opacity: 1;
		transition: opacity 0.3s ease 0.08s;
	}

	.badge {
		position: absolute;
		top: -5px;
		left: 13px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border: 1.5px solid var(--card);
		border-radius: 8px;
		background: var(--danger);
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		line-height: 1;
		color: var(--on-sage);
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble.ready {
			transition: opacity 0.2s ease;
		}
		.label,
		.tab.active .label {
			transition: none;
		}
	}
</style>
