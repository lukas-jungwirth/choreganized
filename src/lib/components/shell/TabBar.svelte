<!--
	The four tabs [02]. Frosted, hairline-topped, pinned to the bottom of the
	480px column (not the viewport) so it lines up with the shell on a desktop
	window. Tasks carries the current member's overdue count [4e].
-->
<script lang="ts">
	import { page } from '$app/state';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
	import PotIcon from '$lib/components/icons/PotIcon.svelte';
	import type { Component } from 'svelte';

	type Props = {
		/** Tasks badge; 0 hides it. */
		overdueCount?: number;
	};

	let { overdueCount = 0 }: Props = $props();

	type Tab = {
		href: string;
		label: string;
		icon: Component<{ size?: number; strokeWidth?: number }>;
		badge?: boolean;
	};

	const TABS: Tab[] = [
		{ href: '/home', label: 'Home', icon: HomeIcon },
		{ href: '/shopping', label: 'Shopping', icon: BasketIcon },
		{ href: '/cooking', label: 'Cooking', icon: PotIcon },
		{ href: '/tasks', label: 'Tasks', icon: ChecklistIcon, badge: true }
	];

	/** `/tasks/history` keeps the Tasks tab lit. */
	function isActive(href: string, pathname: string) {
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	const badge = $derived(overdueCount > 99 ? '99+' : String(overdueCount));
</script>

<nav class="tabbar" aria-label="Sections">
	{#each TABS as tab (tab.href)}
		{@const active = isActive(tab.href, page.url.pathname)}
		<a
			class="tab"
			class:active
			href={tab.href}
			aria-current={active ? 'page' : undefined}
			aria-label={tab.badge && overdueCount > 0
				? `${tab.label}, ${overdueCount} overdue`
				: undefined}
		>
			<span class="icon">
				<tab.icon size={23} />
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
		justify-content: space-around;
		align-items: flex-start;
		width: 100%;
		max-width: 480px;
		height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		padding: 12px 0 env(safe-area-inset-bottom);
		border-top: 1px solid var(--border-soft);
		background: var(--tabbar-bg);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		min-width: 64px;
		padding: 2px 4px;
		color: var(--text-5);
	}

	.icon {
		position: relative;
		display: flex;
	}

	.label {
		font-size: 11px;
		font-weight: 500;
	}

	.active {
		color: var(--sage);
	}

	.active .label {
		font-weight: 600;
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
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		color: var(--on-sage);
	}
</style>
