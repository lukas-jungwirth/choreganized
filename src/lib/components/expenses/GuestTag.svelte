<!--
	"Guest" beside a guest's name in pickers and lists [G1] (→ SPEC §11.15):
	with the outlined avatar, what tells someone outside the household apart
	from a housemate.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';

	const m = messages();
</script>

<span class="tag">{m.expenses.guests.tag}</span>

<style>
	.tag {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 7px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: var(--fs-14);
		font-weight: 600;
		line-height: 1.35;
		color: var(--text-3);
		vertical-align: 1px;
		white-space: nowrap;
	}
</style>
