/**
 * Browser-side Better Auth client. `baseURL` defaults to the page origin, which
 * is what we want in every environment.
 *
 * Only sign-in/sign-out go through here — everything else is load + form
 * actions (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({ plugins: [emailOTPClient()] });

export const { signIn, signOut, emailOtp } = authClient;
