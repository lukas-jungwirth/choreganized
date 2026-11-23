<!--
	A step's links [E3] (→ plan 46, SPEC §4.4): tap a word to link it to an
	ingredient, and an amount beside that word goes with it.

	- The step's text on top, every word tappable, drawn **as cook mode will
	  draw it**: a linked word underlined, a linked amount in gold. "Show for
	  4 / 8 people" rewrites it the way cook mode will (the recipe's servings
	  and twice that; absent without servings).
	- Tap a word: the list below gives way to "Link “…” to" with the
	  ingredients, the likely one first. Tap a linked word: pick another.
	- An amount standing beside the linked word (`locateAmounts`' rule) is
	  linked with it when its unit is the row's and it is not more than the
	  row's total (`linkWord`); its row then carries a switch, "follows the
	  number of people" or "stays as written", and tapping the amount in the
	  text flips it. An amount that stands anywhere else cannot follow, and a
	  tap says so. A time or a temperature is not tappable at all.
	- Suggestions (the matcher's reading, dotted) are accepted with a tap or
	  turned down with ✕; links without words ("used without being named")
	  are listed under the links, with "Add ingredient".

	Built to be mounted on its own (plan 45's review opens it): it takes the
	step's text, links and the ingredient rows, and hands back the links and
	the words turned down. Mounted per opening.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import { scaleQuantity } from '$lib/utils/ingredients';
	import { plainName } from '$lib/utils/step-highlight';
	import {
		amountBeside,
		amountFits,
		amountFollows,
		linkWord,
		locateAmounts,
		occurrences,
		scaleAmountPhrase,
		suggestLinks,
		tokens,
		type EditorLink,
		type LinkTarget,
		type StepToken
	} from '$lib/utils/step-links';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';

	type Props = {
		/** The step's number, for the eyebrow. */
		index: number;
		text: string;
		links: EditorLink[];
		/** Suggested words turned down before, as written. */
		dismissed: string[];
		/** Whether the matcher's reading is offered (→ `recipe-editor.ts` `suggesting`). */
		suggesting: boolean;
		/** The ingredient rows a word can be linked to. */
		targets: LinkTarget[];
		/** The recipe's servings: "Show for 4 / 8 people"; null: no such control. */
		servings: number | null;
		/** The household's own unit words, lowercased, so "2 Kugel" is one amount. */
		known?: ReadonlySet<string>;
		onsave: (links: EditorLink[], dismissed: string[]) => void;
		onclose: () => void;
	};

	let {
		index,
		text,
		links: given,
		dismissed: turnedDown,
		suggesting,
		targets,
		servings,
		known,
		onsave,
		onclose
	}: Props = $props();

	const m = messages();
	const t = m.cooking.form.links;
	const uid = $props.id();

	let open = $state(true);
	let links = $state<EditorLink[]>(untrack(() => given.map((link) => ({ ...link }))));
	let dismissed = $state<string[]>(untrack(() => [...turnedDown]));
	/** 1 or 2: "Show for 4 / 8 people". */
	let factor = $state(1);
	/** The word being linked: a range of the text, or "an ingredient without words". */
	let picking = $state<{ start: number; end: number } | 'unnamed' | null>(null);
	/** What a tap on an amount that cannot follow says, until the next tap. */
	let notice = $state<string | null>(null);

	$effect(() => {
		if (!open) onclose();
	});

	const toks = $derived(tokens(text, known));
	const byKey = $derived(new Map(targets.map((row) => [row.key, row])));

	/** The suggestions still standing, each as the link accepting it would make. */
	const offers = $derived.by(() => {
		if (!suggesting) return [];
		return suggestLinks(text, targets, links, dismissed).flatMap((one) => {
			const row = byKey.get(one.ingredient);
			return row ? [{ ...one, link: linkWord(text, toks, one.start, one.end, row) }] : [];
		});
	});

	type Run =
		| { kind: 'plain'; text: string }
		| { kind: 'word'; token: StepToken }
		| { kind: 'amount'; token: StepToken }
		| { kind: 'linked'; start: number; end: number; link: number }
		| { kind: 'suggested'; start: number; end: number; offer: number }
		| { kind: 'scaled'; token: StepToken; link: number };

	/** The text as runs: what each piece is, and what a tap on it does. */
	const runs = $derived.by(() => {
		const claims: { start: number; end: number; run: Run }[] = [];
		links.forEach((link, at) => {
			if (!link.phrase) return;
			for (const [start, end] of occurrences(text, link.phrase)) {
				claims.push({ start, end, run: { kind: 'linked', start, end, link: at } });
			}
			if (!link.amountPhrase) return;
			for (const [start, end] of locateAmounts(text, link.phrase, link.amountPhrase)) {
				const token = toks.find((one) => one.start === start) ?? {
					start,
					end,
					text: text.slice(start, end),
					kind: 'amount' as const
				};
				claims.push({ start, end, run: { kind: 'scaled', token, link: at } });
			}
		});
		offers.forEach((offer, at) => {
			claims.push({
				start: offer.start,
				end: offer.end,
				run: { kind: 'suggested', start: offer.start, end: offer.end, offer: at }
			});
		});
		for (const token of toks) {
			if (claims.some((claim) => claim.start < token.end && claim.end > token.start)) continue;
			if (token.kind === 'fixed') continue;
			claims.push({
				start: token.start,
				end: token.end,
				run: token.kind === 'amount' ? { kind: 'amount', token } : { kind: 'word', token }
			});
		}

		claims.sort((a, b) => a.start - b.start || b.end - a.end);
		const out: Run[] = [];
		let cursor = 0;
		for (const claim of claims) {
			if (claim.start < cursor) continue;
			if (claim.start > cursor) out.push({ kind: 'plain', text: text.slice(cursor, claim.start) });
			out.push(claim.run);
			cursor = claim.end;
		}
		if (cursor < text.length) out.push({ kind: 'plain', text: text.slice(cursor) });
		return out;
	});

	/** A linked amount as the text shows it for the factor picked. */
	function shown(written: string): string {
		return scaleAmountPhrase(written, factor);
	}

	/** An amount of a row, for the factor picked: "400 g", "2 EL". */
	function amountOf(quantity: number | null, unit: string | null): string {
		return m.units.amount(scaleQuantity(quantity, factor), unit);
	}

	/** The rows to pick from, the likely one (or the one linked now) first. */
	function choices(word: string | null, current: string | null): LinkTarget[] {
		const lower = word?.toLowerCase() ?? '';
		const likely = (row: LinkTarget) => {
			if (row.key === current) return 2;
			const name = plainName(row.name).toLowerCase();
			return lower && name && (lower.includes(name) || name.includes(lower)) ? 1 : 0;
		};
		return [...targets].sort((a, b) => likely(b) - likely(a));
	}

	/** The link a word in the text belongs to now, if any. */
	function linkAt(start: number, end: number): number {
		return links.findIndex(
			(link) =>
				link.phrase !== null &&
				occurrences(text, link.phrase).some(([from, to]) => from === start && to === end)
		);
	}

	function tapWord(start: number, end: number) {
		notice = null;
		picking = { start, end };
	}

	/** An amount tapped: flip a linked one, link one beside a linked word, else say why not. */
	function tapAmount(token: StepToken) {
		notice = null;
		picking = null;
		// The links this amount stands beside, the ones whose unit it is first: in
		// "Zwiebelwürfel und 200 g Karotten" the 200 g is the Karotten's.
		const beside = links.flatMap((link, at) => {
			if (!link.phrase) return [];
			const phrase = link.phrase;
			const near = occurrences(text, phrase).some(
				([start, end]) => amountBeside(text, toks, start, end)?.start === token.start
			);
			if (!near || !amountFollows(text, phrase, token)) return [];
			const row = byKey.get(link.ingredient);
			const fit = row ? amountFits(token.text, row) : { fits: false, share: null };
			return [{ at, link, fit }];
		});
		const chosen = beside.find((one) => one.fit.fits) ?? beside[0];
		if (!chosen) {
			notice = t.notBeside;
			return;
		}
		links[chosen.at] = {
			...chosen.link,
			amountPhrase: token.text,
			quantity: chosen.fit.fits ? chosen.fit.share : chosen.link.quantity
		};
	}

	/** A linked amount tapped, or its switch: it stops following, or follows again. */
	function toggleAmount(at: number) {
		const link = links[at];
		if (link.amountPhrase) {
			links[at] = { ...link, amountPhrase: null };
			return;
		}
		const amount = besideOf(link);
		if (amount) {
			const row = byKey.get(link.ingredient);
			const fit = row ? amountFits(amount.text, row) : { fits: false, share: null };
			links[at] = {
				...link,
				amountPhrase: amount.text,
				quantity: fit.fits ? fit.share : link.quantity
			};
		}
	}

	/** The amount beside a link's words that cook mode would rewrite and that fits its row. */
	function besideOf(link: EditorLink): StepToken | null {
		if (!link.phrase) return null;
		for (const [start, end] of occurrences(text, link.phrase)) {
			const amount = amountBeside(text, toks, start, end);
			if (!amount || !amountFollows(text, link.phrase, amount)) continue;
			// Offered as a switch only where it could follow on its own: its unit is
			// the row's. Any other amount beside the word is linked by tapping it.
			const row = byKey.get(link.ingredient);
			if (row && amountFits(amount.text, row).fits) return amount;
		}
		return null;
	}

	function pick(row: LinkTarget) {
		if (picking === 'unnamed') {
			links.push({ ingredient: row.key, phrase: null, amountPhrase: null, quantity: null });
		} else if (picking) {
			const made = linkWord(text, toks, picking.start, picking.end, row);
			const at = linkAt(picking.start, picking.end);
			if (at >= 0) links[at] = made;
			else links.push(made);
		}
		picking = null;
	}

	function accept(at: number) {
		const offer = offers[at];
		if (offer) links.push(offer.link);
		notice = null;
	}

	function dismiss(at: number) {
		const offer = offers[at];
		if (offer) dismissed.push(offer.phrase);
	}

	function remove(at: number) {
		const [gone] = links.splice(at, 1);
		// Turned down, so it is not offered again as a suggestion.
		if (gone?.phrase) dismissed.push(gone.phrase);
	}

	function done() {
		onsave(
			links.map((link) => ({ ...link })),
			[...new Set(dismissed)]
		);
		open = false;
	}

	const named = $derived(links.map((link, at) => ({ link, at })).filter((one) => one.link.phrase));
	const unnamed = $derived(
		links.map((link, at) => ({ link, at })).filter((one) => !one.link.phrase)
	);
	const pickedWord = $derived(
		picking && picking !== 'unnamed' ? text.slice(picking.start, picking.end) : null
	);
</script>

<BottomSheet bind:open eyebrow={t.eyebrow(index)} title={t.title}>
	{#if servings}
		<div class="portions">
			<span>{t.showFor}</span>
			<span class="pair" role="group" aria-label={t.showFor}>
				{#each [1, 2] as one (one)}
					<button type="button" aria-pressed={factor === one} onclick={() => (factor = one)}>
						{servings * one}
					</button>
				{/each}
			</span>
			<span>{t.people}</span>
		</div>
	{/if}

	<p class="words">
		{#each runs as run, at (at)}
			{#if run.kind === 'plain'}{run.text}{:else if run.kind === 'word'}<button
					type="button"
					class="w"
					class:sel={picking !== null && picking !== 'unnamed' && picking.start === run.token.start}
					onclick={() => tapWord(run.token.start, run.token.end)}>{run.token.text}</button
				>{:else if run.kind === 'amount'}<button
					type="button"
					class="w num"
					onclick={() => tapAmount(run.token)}>{run.token.text}</button
				>{:else if run.kind === 'linked'}<button
					type="button"
					class="w linked"
					class:sel={picking !== null && picking !== 'unnamed' && picking.start === run.start}
					onclick={() => tapWord(run.start, run.end)}>{text.slice(run.start, run.end)}</button
				>{:else if run.kind === 'suggested'}<button
					type="button"
					class="w suggested"
					aria-label={t.suggest(
						offers[run.offer].phrase,
						byKey.get(offers[run.offer].ingredient)?.name ?? ''
					)}
					onclick={() => accept(run.offer)}>{text.slice(run.start, run.end)}</button
				>{:else}<button type="button" class="w amt" onclick={() => toggleAmount(run.link)}
					>{shown(run.token.text)}</button
				>{/if}
		{/each}
	</p>

	{#if notice}<p class="notice" role="status">{notice}</p>{/if}

	{#if picking}
		<div class="picker">
			<p class="label" id="{uid}-pick">{pickedWord ? t.linkTo(pickedWord) : t.pickIngredient}</p>
			<div class="pick" role="group" aria-labelledby="{uid}-pick">
				{#each choices(pickedWord, picking !== 'unnamed' && picking ? (links[linkAt(picking.start, picking.end)]?.ingredient ?? null) : null) as row, at (row.key)}
					<button
						type="button"
						class:best={at === 0 && pickedWord !== null}
						onclick={() => pick(row)}
					>
						<span class="name">{row.name}</span>
						<span class="qty">{m.units.amount(row.quantity, row.unit)}</span>
					</button>
				{/each}
			</div>
			<button type="button" class="back" onclick={() => (picking = null)}>{t.back}</button>
		</div>
	{:else}
		<p class="label">{t.linked}</p>
		<div class="links">
			{#if !named.length}
				<p class="empty">{t.nothing}</p>
			{/if}
			{#each named as { link, at } (at)}
				{@const row = byKey.get(link.ingredient)}
				{@const amount = link.amountPhrase ?? besideOf(link)?.text ?? null}
				{@const there = link.phrase ? occurrences(text, link.phrase).length > 0 : false}
				<div class="lrow">
					<div class="main">
						<div>
							<span class="phrase">“{amount ? `${amount} ` : ''}{link.phrase}”</span>
							→ <b>{row?.name ?? ''}</b>
						</div>
						{#if !there}
							<p class="gone">{t.gone}</p>
						{:else if amount}
							<button
								type="button"
								class="sc"
								class:off={!link.amountPhrase}
								aria-pressed={link.amountPhrase !== null}
								onclick={() => toggleAmount(at)}
							>
								{#if link.amountPhrase}
									{t.follows(
										link.quantity !== null && row
											? t.of(amountOf(link.quantity, row.unit), amountOf(row.quantity, row.unit))
											: shown(link.amountPhrase)
									)}
								{:else}
									{t.stays(amount)}
								{/if}
							</button>
						{/if}
					</div>
					<button
						type="button"
						class="rm"
						aria-label={t.remove(link.phrase ?? '')}
						onclick={() => remove(at)}
					>
						<X size={18} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>

		{#if offers.length}
			<p class="label">{t.suggested}</p>
			<div class="links">
				{#each offers as offer, at (offer.start)}
					<div class="lrow">
						<button type="button" class="main accept" onclick={() => accept(at)}>
							{t.suggest(offer.phrase, byKey.get(offer.ingredient)?.name ?? '')}
						</button>
						<button
							type="button"
							class="rm"
							aria-label={t.dismiss(offer.phrase)}
							onclick={() => dismiss(at)}
						>
							<X size={18} strokeWidth={2.2} aria-hidden="true" />
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<p class="label">{t.unnamed}</p>
		{#if unnamed.length}
			<div class="links">
				{#each unnamed as { link, at } (at)}
					{@const row = byKey.get(link.ingredient)}
					<div class="lrow">
						<div class="main">
							<b>{row?.name ?? ''}</b>
							{#if link.quantity !== null && row}
								<span class="phrase">
									· {t.of(
										amountOf(link.quantity, row.unit),
										amountOf(row.quantity, row.unit)
									)}</span
								>
							{/if}
						</div>
						<button
							type="button"
							class="rm"
							aria-label={t.remove(row?.name ?? '')}
							onclick={() => remove(at)}
						>
							<X size={18} strokeWidth={2.2} aria-hidden="true" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
		{#if targets.length}
			<button type="button" class="add" onclick={() => (picking = 'unnamed')}>
				+ {t.addIngredient}
			</button>
		{/if}

		<p class="help">{t.help}</p>
	{/if}

	<div class="foot">
		<Button type="button" onclick={done}>{t.done}</Button>
	</div>
</BottomSheet>

<style>
	.portions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin: 2px 0 8px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.pair {
		display: flex;
		padding: 3px;
		border-radius: 12px;
		background: var(--sunken-2);
	}

	.pair button {
		min-width: 48px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 9px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--text-2);
	}

	.pair button[aria-pressed='true'] {
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	/* The step as cook mode will show it, at reading size, every word a target. */
	.words {
		margin: 6px 0 4px;
		font-size: var(--fs-20);
		line-height: 2.1;
		color: var(--ink);
	}

	/* Each word its own target, its line kept tight so the underline sits
	   under the word rather than at the bottom of the line's tall box. */
	.w {
		padding: 3px 1px;
		border-radius: 8px;
		font: inherit;
		line-height: 1.3;
		color: inherit;
	}

	.linked {
		border-radius: 0;
		box-shadow: inset 0 -2.5px 0 var(--gold);
	}

	.suggested {
		border-radius: 0;
		text-decoration: underline dotted var(--gold);
		text-decoration-thickness: 2px;
		text-underline-offset: 6px;
	}

	.amt {
		border-radius: 0;
		box-shadow: inset 0 -2.5px 0 var(--gold);
		font-weight: 700;
		color: var(--gold-deep);
	}

	.num {
		color: var(--text-2);
	}

	.sel {
		background: var(--sage);
		box-shadow: none;
		color: var(--on-sage);
	}

	.notice {
		margin: 4px 0 8px;
		padding: 10px 12px;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-size: var(--fs-15);
		color: var(--text-2);
	}

	.label {
		margin: 16px 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.pick {
		display: grid;
		gap: 8px;
	}

	.pick button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 6px 14px;
		border-radius: 14px;
		background: var(--sunken);
		font-size: var(--fs-17);
		font-weight: 500;
		text-align: left;
		color: var(--ink);
	}

	.pick .best {
		background: var(--sage-tint);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.name {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.qty {
		flex: none;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.back,
	.add {
		display: block;
		min-height: 44px;
		margin-top: 8px;
		padding: 0 4px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.links {
		display: grid;
		overflow: hidden;
		border: 1px solid var(--divider-sheet);
		border-radius: 14px;
	}

	.lrow {
		display: grid;
		grid-template-columns: 1fr 44px;
		align-items: center;
		padding: 6px 2px 6px 12px;
		border-top: 1px solid var(--divider-sheet);
		font-size: var(--fs-16);
	}

	.lrow:first-child {
		border-top: 0;
	}

	.main {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.accept {
		min-height: 44px;
		font: inherit;
		font-weight: 600;
		text-align: left;
		color: var(--sage-deep);
	}

	.phrase {
		color: var(--text-4);
	}

	b {
		font-weight: 600;
	}

	.gone {
		margin: 4px 0 0;
		font-size: var(--fs-14);
		color: var(--danger-deep);
	}

	/* The amount's switch: gold while it follows, struck out while it stays. */
	.sc {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 6px;
		padding: 4px 12px;
		border-radius: var(--r-chip);
		background: var(--gold-tint);
		font-size: var(--fs-14);
		font-weight: 600;
		text-align: left;
		color: var(--gold-deep);
	}

	.sc.off {
		background: var(--sunken);
		color: var(--text-4);
		text-decoration: line-through;
	}

	.rm {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--text-4);
	}

	.empty {
		margin: 0;
		padding: 12px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.help {
		margin: 14px 2px 0;
		font-size: var(--fs-15);
		line-height: 1.4;
		color: var(--text-4);
	}

	.foot {
		margin-top: 18px;
	}
</style>
