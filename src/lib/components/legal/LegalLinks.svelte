<!--
	"Privacy · Imprint", quiet, under the sign-in footnote and on an invite
	landing (→ SPEC §13, sketch `design/sketches/settings-access.html`). Each link
	only for a page this deploy has; the dot only between two. Nothing at all
	when neither is set.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { legalHref, type LegalFrom, type LegalLinks } from '$lib/utils/legal';

	type Props = {
		links: LegalLinks;
		/** Where back on the page leads (→ utils/legal). */
		from: LegalFrom | null;
	};

	let { links, from }: Props = $props();

	const m = messages();
</script>

{#if links.privacy || links.imprint}
	<nav class="legal-links" aria-label={m.legal.links}>
		{#if links.privacy}<a href={legalHref('privacy', from)}>{m.legal.privacy}</a>{/if}
		{#if links.privacy && links.imprint}<span aria-hidden="true">·</span>{/if}
		{#if links.imprint}<a href={legalHref('imprint', from)}>{m.legal.imprint}</a>{/if}
	</nav>
{/if}

<style>
	.legal-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--text-3);
	}

	a {
		/* A 44px-tall tap target without moving the line: padding, pulled back. */
		padding: 10px 2px;
		margin: -10px 0;
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--border-dashed);
	}
</style>
