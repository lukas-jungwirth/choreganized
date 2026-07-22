<!--
	Temporary placeholder. Plan 00 (foundation) replaces this with the real
	entry: redirect to /login or /home depending on session + membership.
-->
<main>
	<div class="logo" aria-hidden="true">
		<svg width="40" height="40" viewBox="0 0 60 60" fill="none">
			<path
				d="M12 33 L27 19 L42 33 V46 a3 3 0 0 1 -3 3 H15 a3 3 0 0 1 -3 -3 Z"
				stroke="#fff"
				stroke-width="3.6"
				stroke-linejoin="round"
			/>
			<g transform="translate(43,15) scale(1.05)">
				<path
					d="M0 -7.5 c1.2 4.2 3.3 6.3 7.5 7.5 c-4.2 1.2 -6.3 3.3 -7.5 7.5 c-1.2 -4.2 -3.3 -6.3 -7.5 -7.5 c4.2 -1.2 6.3 -3.3 7.5 -7.5 Z"
					fill="#F4C9AE"
				/>
			</g>
			<g transform="translate(51,30) scale(.58)">
				<path
					d="M0 -7.5 c1.2 4.2 3.3 6.3 7.5 7.5 c-4.2 1.2 -6.3 3.3 -7.5 7.5 c-1.2 -4.2 -3.3 -6.3 -7.5 -7.5 c4.2 -1.2 6.3 -3.3 7.5 -7.5 Z"
					fill="#F4C9AE"
				/>
			</g>
		</svg>
	</div>
	<h1>Chore<span class="sage">ganized</span><span class="dot">.</span></h1>
	<p class="tagline">EVERY&nbsp;CHORE,&nbsp;ORGANIZED</p>
	<p class="note">
		Project scaffolded — implementation plans live in <code>docs/plans/</code>.
	</p>
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px;
		text-align: center;
	}
	.logo {
		width: 64px;
		height: 64px;
		border-radius: 19px;
		background: var(--sage);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 10px 24px -8px rgba(95, 141, 114, 0.6);
	}
	h1 {
		font-size: 28px;
	}
	.sage {
		color: var(--sage);
	}
	.dot {
		color: var(--terracotta);
	}
	.tagline {
		margin: 0;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.22em;
		color: var(--text-4);
	}
	.note {
		margin-top: 20px;
		font-size: 13px;
		color: var(--text-4);
	}
	code {
		font-size: 12px;
		background: var(--sunken);
		padding: 2px 6px;
		border-radius: 6px;
	}
</style>
