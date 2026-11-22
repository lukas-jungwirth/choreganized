/**
 * The HTML part of the sign-in code mail (→ `mail.ts` `signInCodeMail`,
 * DECISIONS #294): the "green banner" layout Lukas picked, a sage band with the
 * app icon, wordmark and tagline over a white card that holds the code.
 *
 * Mail clients are not browsers, so this breaks the app's styling rules on purpose:
 *
 * - **Colours are literals.** No mail client reads `app.css`; every hex here is a
 *   copy of a token's value (sage, terracotta, cream, ink) from app.css, light and
 *   dark. This file is `.ts`, so the design-token test (which reads `.svelte` and
 *   `.css`) does not look at it; keep it that way rather than moving the markup
 *   into a component.
 * - **Tables and inline styles.** Gmail and Outlook drop or rewrite `<style>`, so
 *   layout lives in `style=""` attributes. The `<style>` block only carries what
 *   can't be inline: the dark-mode media query and the preheader's hiding.
 * - **Fixed px font sizes.** A mail has no `--fs-*` scale; the reader's mail app
 *   zooms it as a whole.
 * - **Nothing loads from a server.** The icon is attached and referenced by
 *   `cid:`, so opening the mail tells no one anything; web fonts are only named,
 *   with Georgia and the system sans as what most clients actually show. With
 *   images blocked the band still reads: green, white wordmark, tagline.
 *
 * Every word comes from the catalog (`auth.mail`), escaped on the way in.
 */
import iconDataUri from '../../../static/icons/icon-192.png?inline';
import type { Messages } from '$lib/i18n/messages/en';

/** An inline image, attached to the mail and referenced from the HTML by `cid:`. */
export type MailAttachment = {
	filename: string;
	cid: string;
	contentType: string;
	content: Buffer;
};

/** The `cid:` the HTML points at; the attachment carries the same id. */
export const ICON_CID = 'icon@haushaltsheld';

/** The app icon as an inline attachment, bundled into the server build (no path to resolve). */
export function iconAttachment(): MailAttachment {
	const base64 = iconDataUri.slice(iconDataUri.indexOf(',') + 1);
	return {
		filename: 'haushaltsheld.png',
		cid: ICON_CID,
		contentType: 'image/png',
		content: Buffer.from(base64, 'base64')
	};
}

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Text into HTML, attributes included. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
/**
 * The code's digits must be lining: Georgia's are old-style (a 4 and a 9 hang
 * below the line, a 1 and a 2 sit low), which makes six digits hard to read
 * off. Palatino has lining figures and is on Apple and Windows devices alike.
 */
const CODE_SERIF =
	"Fraunces, 'Palatino Linotype', Palatino, 'Book Antiqua', 'Times New Roman', serif";
const SANS =
	"Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Dark mode, for the clients that honour `prefers-color-scheme` (Apple Mail, iOS,
 * some Outlooks). Values mirror app.css's dark tokens. `!important` beats the
 * inline light colours.
 */
const DARK_CSS = `
	.hh-preheader { display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; }
	@media (prefers-color-scheme: dark) {
		.hh-page { background: #191510 !important; }
		.hh-card { background: #221e18 !important; }
		.hh-band { background: #3e5d49 !important; background-image: linear-gradient(135deg, #3e5d49, #2f4838) !important; }
		.hh-h { color: #efe9de !important; }
		.hh-lead { color: #b3aba0 !important; }
		.hh-code { background: #1e2a22 !important; color: #a9cfb6 !important; }
		.hh-pill { background: #2c211a !important; color: #e7b394 !important; }
		.hh-rule { background: #322c24 !important; }
		.hh-fine { color: #a5a096 !important; }
		.hh-foot { color: #857f74 !important; }
	}
`;

export type SignInMailCopy = {
	locale: string;
	wordmark: string;
	tagline: string;
	m: Messages['auth']['mail'];
};

/** The whole HTML document for one code. */
export function signInCodeHtml(code: string, minutes: number, copy: SignInMailCopy): string {
	const { m } = copy;
	const t = escapeHtml;
	// Pads the inbox preview so the client doesn't fill it with the body after the preheader.
	const previewPad = '&#847;&zwnj;&nbsp;'.repeat(40);

	return `<!doctype html>
<html lang="${t(copy.locale)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${t(m.subject(code))}</title>
<style>${DARK_CSS}</style>
</head>
<body class="hh-page" style="margin:0;padding:0;background:#f5f3ee;-webkit-text-size-adjust:100%;">
<div class="hh-preheader" style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f5f3ee;">${t(m.preheader(minutes))}${previewPad}</div>
<table role="presentation" class="hh-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f3ee" style="background:#f5f3ee;">
<tr><td align="center" style="padding:28px 14px 22px;">
	<table role="presentation" class="hh-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:440px;background:#ffffff;border-radius:20px;border-collapse:separate;">
	<tr><td class="hh-band" bgcolor="#5f8d72" style="background:#5f8d72;background-image:linear-gradient(135deg,#5f8d72,#517b63);border-radius:20px 20px 0 0;padding:18px 22px;text-align:left;">
		<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
			<td width="38" style="width:38px;padding:0 12px 0 0;vertical-align:middle;"><img src="cid:${ICON_CID}" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border:0;border-radius:10px;"></td>
			<td style="vertical-align:middle;">
				<div style="font-family:${SERIF};font-weight:600;font-size:18px;line-height:1.25;color:#ffffff;">${t(copy.wordmark)}</div>
				<div style="font-family:${SANS};font-size:12px;line-height:1.4;color:#e4ebe6;color:rgba(255,255,255,0.8);">${t(copy.tagline)}</div>
			</td>
		</tr></table>
	</td></tr>
	<tr><td align="center" style="padding:28px 26px 26px;text-align:center;font-family:${SANS};">
		<h1 class="hh-h" style="margin:0 0 8px;font-family:${SERIF};font-weight:600;font-size:24px;line-height:1.25;color:#22201c;">${t(m.heading)}</h1>
		<p class="hh-lead" style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#6e6a62;">${t(m.lead)}</p>
		<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
			<td class="hh-code" bgcolor="#edf3ee" style="background:#edf3ee;border-radius:14px;padding:16px 22px 16px 32px;font-family:${CODE_SERIF};font-weight:600;font-size:36px;line-height:1.2;letter-spacing:0.28em;font-variant-numeric:lining-nums tabular-nums;color:#3e5d49;">${t(code)}</td>
		</tr></table>
		<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;"><tr>
			<td class="hh-pill" bgcolor="#f7ede6" style="background:#f7ede6;border-radius:999px;padding:6px 12px;font-family:${SANS};font-size:13px;font-weight:500;line-height:1.4;color:#8a6040;">${t(m.validFor(minutes))}</td>
		</tr></table>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 16px;"><tr>
			<td class="hh-rule" bgcolor="#ece9e2" height="1" style="height:1px;line-height:1px;font-size:1px;background:#ece9e2;">&nbsp;</td>
		</tr></table>
		<p class="hh-fine" style="margin:0;font-size:13px;line-height:1.5;color:#8a867e;">${t(m.fine)}</p>
	</td></tr>
	</table>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;"><tr>
		<td class="hh-foot" align="center" style="padding:14px 26px 0;text-align:center;font-family:${SANS};font-size:12px;line-height:1.5;color:#a7a29a;">${t(m.footer)}</td>
	</tr></table>
</td></tr>
</table>
</body>
</html>
`;
}
