/**
 * Browser-side Better Auth client. `baseURL` defaults to the page origin, which
 * is what we want in every environment.
 *
 * Only sign-in/sign-out go through here — everything else is load + form
 * actions (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient();

export const { signIn, signOut } = authClient;
