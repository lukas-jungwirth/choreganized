/**
 * Better Auth HTTP handler (sign-in, OAuth callback, sign-out, get-session).
 *
 * `hooks.server.ts` normally short-circuits these paths before routing; this
 * route is the fallback for requests whose origin doesn't match
 * `BETTER_AUTH_URL` (e.g. hitting 127.0.0.1 while the env says localhost),
 * where Better Auth's own `isAuthPath` check declines to match.
 */
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
