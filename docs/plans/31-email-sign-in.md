# 31 · Sign in with an email code

**Status: done (2026-10-27).** Depends on: 00 (auth).
SPEC: [§1.1](../SPEC.md). Decisions: #178, #179.
Design: [5a] in `design/Hearth.dc.html`: its Email field, primary button and "or" rule. The
password field and the Apple button stay out (→ DECISIONS #1).

**Goal:** someone without a Google account, or who doesn't want to use one, can sign in. They
type an email address, get a six-digit code, and type it into the app. It must be safe, and it
must work in the installed iOS PWA.

## Why this shape (researched 2026-10-27)

- **Better Auth's `emailOTP` plugin, not hand-built tables.** The codes live hashed in the
  existing `verification` table. The plugin also handles expiry, attempts and rate limits, and
  revokes an unproven account's access when a code proves the address.
- **A code, not a magic link.** On iOS a magic link signs Safari in, not the installed app.
  Link scanners also spend one-time links before the person taps them.
- **No passwords.** Passkeys come later, as an add-on in Settings.
- **SMTP + nodemailer**, so the mail provider can change without changing code.

## Build

- `lib/server/mail.ts`: `mailRoute` (outbox → SMTP → console → off), `sendMail`,
  `mailEnabled`, `signInCodeMail`.
- `lib/server/auth.ts`: `emailOTP({ otpLength: 6, expiresIn: 300, allowedAttempts: 3,
storeOTP: 'hashed' })`. Sign-in codes only, mailed in the request's locale.
- `lib/auth-client.ts`: `emailOTPClient()`.
- `routes/login`: email → code steps above the "or" rule and Google. The sixth digit submits.
  Google only when `mailEnabled()` is false.
- Catalog `auth.*` (en + de), and onboarding's "Welcome" for a nameless account.
- `.env.example`, ARCHITECTURE "Email" and secrets, DATA-MODEL `verification`, TESTING "Mail
  outbox", `verify` launch entry.

## Acceptance

- [x] With SMTP (or the outbox) configured, the login page shows Email → **Email me a code**,
      the "or" rule, then Google. With nothing configured on a deploy it shows only Google.
- [x] A code arrives (outbox/terminal locally). Typing it signs in. A new address lands on
      onboarding with "Welcome", and an existing account signs into itself.
- [x] Wrong code → "That code isn't right". Three wrong tries → that code is dead.
      Expired → "That code has expired". Bad address → refused before any request.
- [x] Codes are stored hashed and can be used once.
- [x] German copy for the screen and the mail.
- [ ] One real mail through the production SMTP provider, checked for spam (Lukas, after the
      Coolify variables are set; until then the deploys keep the Google-only screen).

## Tests

- Unit: `src/lib/server/mail.test.ts` (route order, the code in the message).
- Integration: `tests/integration/email-sign-in.test.ts` (sign-up, existing user, hashed, three
  tries, expiry, single use).
- E2E: `tests/e2e/email-sign-in.spec.ts` (wrong code then the right one → onboarding, bad
  address).
- Visual: the login baseline now shows the email form.
