<!--
	Log in [5a]. The design's email field signs in with a code sent by email
	rather than a password (plan 31, SPEC §1.1): email → "Get a sign-in code" →
	the code in six boxes, then the "or" rule and Google. The Apple button stays out
	(DECISIONS #1). A deploy with no mail settings shows Google alone, as v1 did.
	Everything else is the design: logo tile, wordmark, tagline rule, footer
	line pinned to the bottom.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import googleG from '$lib/assets/google-g.svg';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { emailOtp, signIn } from '$lib/auth-client';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CodeInput from '$lib/components/ui/CodeInput.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const CODE_LENGTH = 6;

	let step = $state<'email' | 'code'>('email');
	let email = $state('');
	let code = $state('');
	let pending = $state<'google' | 'send' | 'verify' | null>(null);
	let clientError = $state<string | null>(null);
	/** Set once "Send again" worked, so the line above the boxes says a new one is coming. */
	let resent = $state(false);

	/**
	 * When "Send again" comes back: a minute after each code (the server's limit
	 * per address → DECISIONS #183), or whenever the server says to retry.
	 */
	let cooldownUntil = $state(0);
	let now = $state(Date.now());
	const cooldownLeft = $derived(Math.max(0, Math.ceil((cooldownUntil - now) / 1000)));

	$effect(() => {
		if (cooldownUntil <= Date.now()) return;
		const tick = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(tick);
	});

	function holdResend(seconds: number) {
		now = Date.now();
		cooldownUntil = now + seconds * 1000;
	}

	const errorMessage = $derived(clientError ?? (data.signInFailed ? m.auth.failed : null));

	type AuthError = { code?: string; status: number; retryAfter?: number };

	/** Better Auth's error codes → the catalog; anything else is "didn't complete". */
	function describe(error: AuthError, fallback: string): string {
		const retryAfter = error.retryAfter ?? 60;
		switch (error.code) {
			case 'CODE_COOLDOWN':
				return m.auth.codeCooldown(retryAfter);
			case 'CODE_HOURLY_LIMIT':
				return m.auth.codeHourlyLimit(Math.ceil(retryAfter / 60));
			case 'INVALID_OTP':
				return m.auth.wrongCode;
			case 'OTP_EXPIRED':
				return m.auth.codeExpired;
			case 'TOO_MANY_ATTEMPTS':
				return m.auth.tooManyAttempts;
			case 'INVALID_EMAIL':
				return m.auth.invalidEmail;
			case 'MAIL_SEND_FAILED':
				return m.auth.sendFailed;
			default:
				return error.status === 429 ? m.auth.tooManyRequests : fallback;
		}
	}

	async function continueWithGoogle() {
		pending = 'google';
		clientError = null;

		// On success the client redirects to Google — leave the button disabled.
		const { error } = await signIn.social({
			provider: 'google',
			callbackURL: '/',
			errorCallbackURL: '/login'
		});

		if (error) {
			pending = null;
			clientError = m.auth.failed;
		}
	}

	async function sendCode(event?: SubmitEvent) {
		event?.preventDefault();
		const again = step === 'code';
		email = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			clientError = m.auth.invalidEmail;
			return;
		}
		pending = 'send';
		clientError = null;

		const { error } = await emailOtp.sendVerificationOtp({ email, type: 'sign-in' });

		pending = null;
		if (error) {
			clientError = describe(error, m.auth.sendFailed);
			if (error.code === 'CODE_COOLDOWN' && step === 'code') {
				holdResend((error as AuthError).retryAfter ?? 60);
			}
			return;
		}
		code = '';
		resent = again;
		step = 'code';
		holdResend(data.codeCooldownSeconds);
	}

	async function verifyCode(event?: SubmitEvent) {
		event?.preventDefault();
		if (pending) return;
		pending = 'verify';
		clientError = null;

		const { error } = await signIn.emailOtp({ email, otp: code });

		if (error) {
			pending = null;
			clientError = describe(error, m.auth.failed);
			return;
		}
		// `/` sends a member home and anyone else to onboarding (or the invite
		// they opened before signing in). Leave the button busy until it lands.
		await goto('/', { invalidateAll: true });
	}

	function useDifferentEmail() {
		step = 'email';
		code = '';
		resent = false;
		cooldownUntil = 0;
		clientError = null;
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.auth.signIn)}</title>
</svelte:head>

<Screen>
	<div class="brand">
		<span class="tile"><img src={logoMark} alt="" width="40" height="40" /></span>
		<h1 class="wordmark">
			{m.auth.wordmarkLead}<span class="accent">{m.auth.wordmarkAccent}</span><span class="dot"
				>.</span
			>
		</h1>
		<p class="tagline">
			<span class="label">{m.auth.tagline}</span>
			<span class="rule"></span>
		</p>
	</div>

	<div class="actions">
		{#if data.emailSignIn}
			{#if step === 'email'}
				<form class="email-form" onsubmit={sendCode} novalidate>
					<TextField
						label={m.auth.email}
						type="email"
						name="email"
						autocomplete="email"
						inputmode="email"
						autocapitalize="off"
						spellcheck="false"
						placeholder={m.auth.emailPlaceholder}
						bind:value={email}
						disabled={pending !== null}
						required
					/>
					<Button type="submit" disabled={pending !== null} aria-busy={pending === 'send'}>
						{pending === 'send' ? m.auth.sendingCode : m.auth.sendCode}
					</Button>
				</form>
			{:else}
				<form class="email-form" onsubmit={verifyCode} novalidate>
					<p class="sent" role="status">
						{resent
							? m.auth.codeResent(email, data.codeMinutes)
							: m.auth.codeSent(email, data.codeMinutes)}
					</p>
					<!-- iOS offers the code above the keyboard; the sixth digit is the tap that signs in. -->
					<CodeInput
						label={m.auth.code}
						name="code"
						length={CODE_LENGTH}
						bind:value={code}
						invalid={clientError === m.auth.wrongCode}
						oncomplete={() => void verifyCode()}
						disabled={pending !== null}
						required
					/>
					<Button
						type="submit"
						disabled={pending !== null || code.length !== CODE_LENGTH}
						aria-busy={pending === 'verify'}
					>
						{pending === 'verify' ? m.auth.verifyingCode : m.auth.verifyCode}
					</Button>
					<p class="resend">
						{m.auth.noCode}
						<button
							type="button"
							class="link"
							onclick={() => sendCode()}
							disabled={pending !== null || cooldownLeft > 0}
						>
							{cooldownLeft > 0 ? m.auth.resendIn(cooldownLeft) : m.auth.resendCode}
						</button>
					</p>
					<button
						type="button"
						class="link other-email"
						onclick={useDifferentEmail}
						disabled={pending !== null}
					>
						{m.auth.changeEmail}
					</button>
				</form>
			{/if}

			{#if errorMessage}
				<p class="error" role="alert">{errorMessage}</p>
			{/if}

			<div class="or" aria-hidden="true">
				<span class="rule"></span><span>{m.auth.or}</span><span class="rule"></span>
			</div>
		{/if}

		<button
			class="google"
			onclick={continueWithGoogle}
			disabled={pending !== null}
			aria-busy={pending === 'google'}
		>
			<img src={googleG} alt="" width="20" height="20" />
			{pending === 'google' ? m.auth.openingGoogle : m.auth.continueWithGoogle}
		</button>

		{#if errorMessage && !data.emailSignIn}
			<p class="error" role="alert">{errorMessage}</p>
		{/if}
	</div>

	<p class="footnote">{data.emailSignIn ? m.auth.footnoteEmail : m.auth.footnote}</p>
</Screen>

<style>
	.brand {
		margin: 26px 0 30px;
	}

	.tile {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		margin-bottom: 16px;
		border-radius: var(--r-card);
		background: var(--sage);
		box-shadow: var(--shadow-button);
	}

	.tile img {
		display: block;
	}

	.wordmark {
		font-size: calc(28px * var(--fs));
		letter-spacing: -0.01em;
	}

	.wordmark .accent {
		color: var(--sage);
	}

	.wordmark .dot {
		color: var(--terracotta);
	}

	.tagline {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 12px 0 0;
	}

	.tagline .label {
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.tagline .rule {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	/* Pushes the footnote to the bottom of the screen, as in the design. */
	.actions {
		margin-bottom: auto;
	}

	.email-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.sent {
		margin: 0;
		font-size: calc(14px * var(--fs));
		line-height: 1.5;
		color: var(--text-3);
	}

	/* "Didn't get the code? Send again" — the prompt muted, the action a link. */
	.resend {
		margin: 0;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}

	.other-email {
		align-self: flex-start;
	}

	.link {
		padding: 4px 0;
		border: none;
		background: none;
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.link:disabled {
		color: var(--text-4);
	}

	/* "or" between the two ways in [5a]. */
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 20px 0;
		font-size: calc(12px * var(--fs));
		color: var(--text-5);
	}

	.or .rule {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.google {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 16px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-button);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(16px * var(--fs));
		font-weight: 700;
		color: var(--ink);
		transition: transform 120ms ease-out;
	}

	.google:disabled {
		color: var(--text-4);
		cursor: default;
	}

	.google:active:not(:disabled) {
		transform: scale(0.99);
	}

	.error {
		margin: 14px 0 0;
		padding: 12px 14px;
		border: 1px solid var(--danger-border);
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: calc(13.5px * var(--fs));
		color: var(--danger-deep);
	}

	.footnote {
		margin: 20px 0 0;
		text-align: center;
		font-size: calc(13.5px * var(--fs));
		line-height: 1.5;
		color: var(--text-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.google {
			transition: none;
		}
		.google:active:not(:disabled) {
			transform: none;
		}
	}
</style>
