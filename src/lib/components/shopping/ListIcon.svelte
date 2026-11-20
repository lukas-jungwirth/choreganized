<!--
	A list's icon (plan 36): one of the twelve the New list sheet offers [L6],
	or the basket for a list that has none (→ `utils/lists` `listIcon`).
	"Other" passes `OTHER_ICON` and gets three dots, which no list can pick.
	Decorative everywhere it is drawn — the list's name is always beside it.
-->
<script lang="ts">
	import { OTHER_ICON, listIcon, type ListIcon } from '$lib/utils/lists';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Droplet from '@lucide/svelte/icons/droplet';
	import Gift from '@lucide/svelte/icons/gift';
	import Hammer from '@lucide/svelte/icons/hammer';
	import House from '@lucide/svelte/icons/house';
	import Luggage from '@lucide/svelte/icons/luggage';
	import PawPrint from '@lucide/svelte/icons/paw-print';
	import Pill from '@lucide/svelte/icons/pill';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
	import Tent from '@lucide/svelte/icons/tent';

	type Props = { icon: string | null | undefined; size?: number; strokeWidth?: number };

	let { icon, size = 18, strokeWidth = 1.9 }: Props = $props();

	const GLYPHS = {
		basket: ShoppingBasket,
		bag: ShoppingBag,
		droplet: Droplet,
		pill: Pill,
		hammer: Hammer,
		gift: Gift,
		luggage: Luggage,
		tent: Tent,
		door: DoorOpen,
		paw: PawPrint,
		book: BookOpen,
		home: House
	} satisfies Record<ListIcon, unknown>;

	const Glyph = $derived(icon === OTHER_ICON ? Ellipsis : GLYPHS[listIcon(icon)]);
</script>

<Glyph {size} {strokeWidth} aria-hidden="true" />
