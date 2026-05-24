import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export function escapeEmailHtml(raw: string): string {
    return (raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

/** Safe for HTML double-quoted attribute values (e.g. href). */
export function escapeEmailAttr(raw: string): string {
    return (raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
}

@Injectable()
export class MailerService {
    private readonly logger = new Logger(MailerService.name);
    private transporter;
    private mailFrom: string;
    private mailFromName: string;

    constructor(private readonly configService: ConfigService) {
        const mailHost = this.configService.get<string>('mail.host');
        const mailPort = this.configService.get<number>('mail.port');
        const mailUser = this.configService.get<string>('mail.user');
        const mailPass = this.configService.get<string>('mail.pass');
        this.mailFrom = this.configService.get<string>('mail.from') || mailUser || '';
        this.mailFromName = this.configService.get<string>('mail.fromName') || 'Support Team';

        this.transporter = nodemailer.createTransport({
            host: mailHost,
            port: mailPort,
            secure: false,
            auth: {
                user: mailUser,
                pass: mailPass,
            },
        });
    }

    async sendMail(to: string, subject: string, text: string, html?: string) {
        await this.transporter.sendMail({
            from: `"${this.mailFromName}" <${this.mailFrom}>`,
            to,
            subject,
            text,
            html,
        });
    }

    private readonly emailFontStack =
        "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

    private readonly emailInk = '#0f172a';
    private readonly emailMuted = '#64748b';
    private readonly emailBorder = '#e2e8f0';
    private readonly emailAccentBlue = '#2563eb';

    /** Shared outer frame for HTML clients (tables + inline styles). */
    private layoutEmail(eyebrowText: string, eyebrowHex: string, innerBodyHtml: string): string {
        const y = new Date().getFullYear();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeEmailHtml(eyebrowText)} · CCC</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;">
  <tr>
    <td align="center" style="padding:24px 14px 32px;font-family:${this.emailFontStack};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid ${this.emailBorder};overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%);padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#bfdbfe;text-transform:uppercase;">The Center for Community Change</p>
            <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.25;">CCC</p>
            <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:${eyebrowHex};">${escapeEmailHtml(
                eyebrowText,
            )}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 20px;color:${this.emailInk};font-size:15px;line-height:1.65;">
            ${innerBodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;font-size:12px;line-height:1.55;color:${this.emailMuted};border-top:1px solid #f1f5f9;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>              <td style="padding-top:20px;">
                <p style="margin:0;">You’re receiving this email because something changed in your CCC account or someone took an action that involves you.</p>
                <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;">The Center for Community Change · © ${y}</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:16px auto 0;max-width:600px;font-size:12px;color:#64748b;line-height:1.55;text-align:center;">Button didn’t open? Tap the blue link underneath — it’s the same destination.</p>
    </td>
  </tr>
</table>
</body>
</html>`;
    }

    private wrapBranded(title: string, accentHex: string, bodyHtml: string): string {
        return this.layoutEmail(title, accentHex, bodyHtml);
    }

    private greetingParagraph(firstName: string): string {
        return `<p style="margin:0 0 20px;font-size:17px;font-weight:600;color:${this.emailInk};">Hi ${escapeEmailHtml(firstName)},</p>`;
    }

    private proseParagraph(html: string, marginBottom = '16px'): string {
        return `<p style="margin:0 0 ${marginBottom};font-size:15px;line-height:1.7;color:#334155;">${html}</p>`;
    }

    /** Short numbered list for instructions (email-safe table rows). */
    private numberedStepsHtml(steps: string[]): string {
        if (!steps.length) return '';
        const rows = steps.map(
            (s, idx) =>
                `<tr>
  <td style="vertical-align:top;padding:0 14px 12px 0;width:28px;"><span style="display:inline-block;min-width:24px;height:24px;line-height:24px;border-radius:999px;background:${this.emailAccentBlue};color:#ffffff;font-size:12px;font-weight:700;text-align:center;">${idx + 1}</span></td>
  <td style="vertical-align:top;padding:0 0 12px;font-size:14px;line-height:1.65;color:#334155;">${s}</td>
</tr>`,
        );
        return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px;"><tbody>${rows.join('')}</tbody></table>`;
    }

    private primaryCta(href: string, label: string): string {
        const h = escapeEmailAttr(href);
        return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;">
  <tr>
    <td style="border-radius:8px;background:${this.emailAccentBlue};">
      <a href="${h}" style="display:inline-block;padding:15px 32px;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:600;line-height:1.25;font-family:${this.emailFontStack};">${escapeEmailHtml(label)}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px;font-size:12px;color:${this.emailMuted};word-break:break-all;line-height:1.45;"><a href="${h}" style="color:${this.emailAccentBlue};text-decoration:none;">${escapeEmailHtml(href)}</a></p>`;
    }

    private calloutBlockquote(content: string, borderColor: string, bg: string, textColor: string): string {
        return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-radius:8px;background:${bg};border-left:4px solid ${borderColor};">
  <tr>
    <td style="padding:16px 18px;font-size:14px;line-height:1.6;color:${textColor};font-family:${this.emailFontStack};">${escapeEmailHtml(content)}</td>
  </tr>
</table>`;
    }

    /** “Where to continue” — subtle card instead of bare list. */
    private appLinksSnippetHtml(): string {
        const web = this.publicWeb();
        const andr = this.androidUrl();
        const ios = this.iosUrl();
        const rows: string[] = [];
        if (web) {
            const w = escapeEmailAttr(web);
            rows.push(
                `<tr><td style="padding:10px 0;border-bottom:1px solid ${this.emailBorder};"><a href="${w}" style="color:${this.emailAccentBlue};font-size:15px;font-weight:600;text-decoration:none;">CCC in your browser →</a><span style="display:block;margin-top:4px;font-size:12px;color:${this.emailMuted};line-height:1.45;">Best on laptop or tablet. Link also works on your phone.</span><span style="display:block;margin-top:6px;font-size:11px;color:#94a3b8;word-break:break-all;line-height:1.4;">${escapeEmailHtml(web)}</span></td></tr>`,
            );
        }
        if (andr) {
            const a = escapeEmailAttr(andr);
            rows.push(
                `<tr><td style="padding:10px 0;border-bottom:1px solid ${this.emailBorder};"><a href="${a}" style="color:${this.emailAccentBlue};font-size:15px;font-weight:600;text-decoration:none;">Android app →</a><span style="display:block;margin-top:4px;font-size:12px;color:${this.emailMuted};line-height:1.45;">Get CCC from Google Play.</span></td></tr>`,
            );
        }
        if (ios) {
            const i = escapeEmailAttr(ios);
            rows.push(
                `<tr><td style="padding:10px 0;"><a href="${i}" style="color:${this.emailAccentBlue};font-size:15px;font-weight:600;text-decoration:none;">iPhone / iPad app →</a><span style="display:block;margin-top:4px;font-size:12px;color:${this.emailMuted};line-height:1.45;">Get CCC from the App Store.</span></td></tr>`,
            );
        }
        if (!rows.length) return '';
        return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;background:#f8fafc;border-radius:10px;border:1px solid ${this.emailBorder};">
  <tr>
    <td style="padding:16px 18px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${this.emailInk};line-height:1.3;">Open CCC on any device</p>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${this.emailMuted};">Pick the option you use most — your account stays the same.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>
    </td>
  </tr>
</table>`;
    }

    /** @param purpose use `password_reset` for recovery copy; default is sign-in / verification. */
    async sendOtpEmail(email: string, otp: string, purpose?: string) {
        const isReset = purpose === 'password_reset';
        const subject = isReset ? 'Reset Your CCC Password' : 'Your OTP Code';
        const safeOtp = escapeEmailHtml(otp);
        const text = isReset
            ? `Hi,\n\nWe received a request to reset your CCC password. Use this verification code: ${otp}\nValid for 10 minutes. If you did not request this, ignore this email.`
            : `Your OTP code is ${otp}. It will expire in 10 minutes.`;
        const inner = isReset
            ? `
${this.greetingParagraph('there')}
${this.proseParagraph('We got a request to <strong>reset the password</strong> for your CCC account. If that was you, use the code below in the app or website — no need to reply to this email.', '14px')}
${this.numberedStepsHtml([
            'Go back to CCC where you asked for the reset.',
            'Enter the verification code shown below.',
            'Create a new password when you’re prompted.',
        ])}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px;"><tr><td style="padding:20px 22px;background:#f8fafc;border-radius:12px;border:2px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:11px;color:${this.emailMuted};letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Your reset code</p>
  <p style="margin:10px 0 0;font-size:32px;font-weight:800;letter-spacing:0.22em;color:${this.emailInk};font-family:ui-monospace,Consolas,monospace;line-height:1.2;">${safeOtp}</p>
  <p style="margin:12px 0 0;font-size:12px;color:${this.emailMuted};line-height:1.45;">Valid for <strong>10 minutes</strong>. CCC staff will never ask you for this code.</p>
</td></tr></table>
${this.proseParagraph('<strong>Not you?</strong> You can ignore this message — your password will stay the same.', '8px')}
${this.proseParagraph('If you’re locked out repeatedly, contact your program coordinator.', '0')}`
            : `
${this.greetingParagraph('there')}
${this.proseParagraph('Use this short code to finish signing in. It expires in <strong>10 minutes</strong>.', '14px')}
${this.numberedStepsHtml([
            'Return to the CCC sign-in screen (app or browser).',
            'Type the code below where CCC asks for your verification code.',
            'If you didn’t try to sign in, close the screen and ignore this email.',
        ])}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px;"><tr><td style="padding:20px 22px;background:#f8fafc;border-radius:12px;border:2px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:11px;color:${this.emailMuted};letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Sign-in code</p>
  <p style="margin:10px 0 0;font-size:32px;font-weight:800;letter-spacing:0.22em;color:${this.emailInk};font-family:ui-monospace,Consolas,monospace;line-height:1.2;">${safeOtp}</p>
  <p style="margin:12px 0 0;font-size:12px;color:${this.emailMuted};line-height:1.45;">Tip: on mobile, double-tap the code to select it for easy pasting.</p>
</td></tr></table>
${this.proseParagraph('If you didn’t request this, you can safely ignore this email.', '0')}`;
        const html = this.layoutEmail(isReset ? 'Password reset' : 'Sign-in verification', '#fde68a', inner);
        await this.sendMail(email, subject, text, html);
    }

    async sendAppointmentConfirmation(opts: {
        to: string;
        recipientName: string;
        otherPartyName: string;
        role: 'pastor' | 'mentor';
        meetingDate: Date;
        durationMinutes: number;
        joinUrl: string;
        password?: string;
        meetingId?: string;
    }) {
        const dateStr = opts.meetingDate.toUTCString();
        const subject = 'Appointment Confirmed – Zoom Meeting Details';
        const joinAttr = escapeEmailAttr(opts.joinUrl);
        const roleNote =
            opts.role === 'pastor'
                ? 'You’ll join this session from your CCC calendar or reminders — your coordinator can help if you need support.'
                : 'Please arrive a few minutes early to open Zoom and welcome your mentee.';
        const zoomBlock =
            `<tr><td colspan="2" style="padding:12px 0 8px;"><p style="margin:0;font-size:13px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.05em;"><b>Video link</b></p></td></tr>` +
            `<tr><td colspan="2" style="padding:0 0 12px;"><a href="${joinAttr}" style="color:${this.emailAccentBlue};font-weight:600;font-size:14px;text-decoration:none;">Open Zoom meeting</a><br/><span style="font-size:12px;color:${this.emailMuted};word-break:break-all;">${escapeEmailHtml(opts.joinUrl)}</span></td></tr>` +
            (opts.meetingId
                ? `<tr><td style="padding:8px 14px 8px 0;font-size:13px;color:${this.emailMuted};white-space:nowrap;vertical-align:top;">Meeting ID</td><td style="padding:8px 0;font-size:14px;color:${this.emailInk};font-weight:600;">${escapeEmailHtml(opts.meetingId)}</td></tr>`
                : '') +
            (opts.password
                ? `<tr><td style="padding:8px 14px 8px 0;font-size:13px;color:${this.emailMuted};white-space:nowrap;vertical-align:top;">Passcode</td><td style="padding:8px 0;font-size:14px;color:${this.emailInk};font-family:Consolas,monospace;">${escapeEmailHtml(opts.password)}</td></tr>`
                : '');

        const inner = `
${this.greetingParagraph(opts.recipientName)}
${this.proseParagraph(
            `Great news — your mentorship session with <strong>${escapeEmailHtml(opts.otherPartyName)}</strong> is confirmed. Below are your meeting details.`,
            '12px',
        )}
${this.proseParagraph(escapeEmailHtml(roleNote), '22px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${this.emailBorder};border-radius:10px;background:#f8fafc;margin:0 0 8px;">
  <tr><td style="padding:18px 20px;font-family:${this.emailFontStack};">
    <p style="margin:0;font-size:11px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.06em;"><b>When</b></p>
    <p style="margin:6px 0 14px;font-size:16px;font-weight:700;color:${this.emailInk};line-height:1.35;">${escapeEmailHtml(dateStr)}</p>
    <p style="margin:0;font-size:11px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.06em;"><b>Duration</b></p>
    <p style="margin:6px 0 0;font-size:15px;color:${this.emailInk};">${opts.durationMinutes} minutes</p>
  </td></tr>
  <tr><td style="border-top:1px solid ${this.emailBorder};padding:16px 20px;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${zoomBlock}</table>
    ${this.primaryCta(opts.joinUrl, 'Join Zoom')}
  </td></tr>
</table>
${this.proseParagraph('<span style="color:' + this.emailMuted + ';">Need help?</span> Reach out to your program coordinator.', '0')}`;
        const html = this.layoutEmail('Appointment confirmation', '#93c5fd', inner);
        const text = `Hi ${opts.recipientName},\n\nYour appointment with ${opts.otherPartyName} is confirmed.\nDate: ${dateStr}\nDuration: ${opts.durationMinutes} minutes\nZoom Link: ${opts.joinUrl}${opts.meetingId ? `\nMeeting ID: ${opts.meetingId}` : ''}${opts.password ? `\nPasscode: ${opts.password}` : ''}\n\nThe Center for Community Change`;

        await this.sendMail(opts.to, subject, text, html);
    }

    async sendAppointmentCancellation(opts: {
        to: string;
        recipientName: string;
        otherPartyName: string;
        meetingDate: Date;
        reason?: string;
    }) {
        const dateStr = opts.meetingDate.toUTCString();
        const subject = 'Appointment Cancelled';
        const inner = `
${this.greetingParagraph(opts.recipientName)}
${this.proseParagraph(
            `The session with <strong>${escapeEmailHtml(opts.otherPartyName)}</strong> originally planned for <strong>${escapeEmailHtml(dateStr)}</strong> has been cancelled.`,
            '18px',
        )}
${opts.reason ? `<table role="presentation" width="100%"><tr><td>
<table role="presentation" width="100%" style="margin:8px 0 22px;background:#fef2f2;border-left:4px solid #f87171;border-radius:8px;">
<tr><td style="padding:14px 18px;font-size:14px;line-height:1.55;color:#7f1d1d;"><strong style="display:block;margin-bottom:4px;color:#991b1b;">Reason noted</strong>${escapeEmailHtml(opts.reason)}</td></tr>
</table>
</td></tr></table>` : ''}
${this.proseParagraph('Reach out to your coordinator when you’re ready to find a new time.', '0')}`;
        const html = this.layoutEmail('Appointment cancelled', '#fca5a5', inner);
        const text = `Hi ${opts.recipientName},\n\nYour appointment with ${opts.otherPartyName} on ${dateStr} has been cancelled.${opts.reason ? `\nReason: ${opts.reason}` : ''}\n\nThe Center for Community Change`;

        await this.sendMail(opts.to, subject, text, html);
    }

    async sendAppointmentRescheduled(opts: {
        to: string;
        recipientName: string;
        otherPartyName: string;
        newMeetingDate: Date;
        durationMinutes: number;
        joinUrl: string;
        password?: string;
        meetingId?: string;
    }) {
        const dateStr = opts.newMeetingDate.toUTCString();
        const subject = 'Appointment Rescheduled – Updated Zoom Details';
        const joinAttr = escapeEmailAttr(opts.joinUrl);
        const zoomBlock =
            `<tr><td colspan="2" style="padding:12px 0 8px;"><p style="margin:0;font-size:13px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.05em;"><b>Updated Zoom link</b></p></td></tr>` +
            `<tr><td colspan="2" style="padding:0 0 12px;"><a href="${joinAttr}" style="color:${this.emailAccentBlue};font-weight:600;font-size:14px;text-decoration:none;">Open Zoom meeting</a><br/><span style="font-size:12px;color:${this.emailMuted};word-break:break-all;">${escapeEmailHtml(opts.joinUrl)}</span></td></tr>` +
            (opts.meetingId
                ? `<tr><td style="padding:8px 14px 8px 0;font-size:13px;color:${this.emailMuted};white-space:nowrap;vertical-align:top;">Meeting ID</td><td style="padding:8px 0;font-size:14px;color:${this.emailInk};font-weight:600;">${escapeEmailHtml(opts.meetingId)}</td></tr>`
                : '') +
            (opts.password
                ? `<tr><td style="padding:8px 14px 8px 0;font-size:13px;color:${this.emailMuted};vertical-align:top;">Passcode</td><td style="padding:8px 0;font-size:14px;color:${this.emailInk};font-family:Consolas,monospace;">${escapeEmailHtml(opts.password)}</td></tr>`
                : '');

        const inner = `
${this.greetingParagraph(opts.recipientName)}
${this.proseParagraph(
            `Your session with <strong>${escapeEmailHtml(opts.otherPartyName)}</strong> has a new date and Zoom details. Everything you need is below.`,
            '20px',
        )}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${this.emailBorder};border-radius:10px;background:#fffbeb;margin:0 0 10px;">
  <tr><td style="padding:18px 20px;font-family:${this.emailFontStack};border-bottom:1px solid ${this.emailBorder};">
    <p style="margin:0;font-size:11px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.06em;"><b>New date &amp; time</b></p>
    <p style="margin:6px 0 14px;font-size:16px;font-weight:700;color:${this.emailInk};line-height:1.35;">${escapeEmailHtml(dateStr)}</p>
    <p style="margin:0;font-size:11px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.06em;"><b>Duration</b></p>
    <p style="margin:6px 0 0;font-size:15px;color:${this.emailInk};">${opts.durationMinutes} minutes</p>
  </td></tr>
  <tr><td style="padding:16px 20px;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${zoomBlock}</table>
    ${this.primaryCta(opts.joinUrl, 'Join Zoom')}
  </td></tr>
</table>
${this.proseParagraph('<span style="color:' + this.emailMuted + ';">Changed plans again?</span> Contact your coordinator so both sides stay in sync.', '0')}`;
        const html = this.layoutEmail('Appointment rescheduled', '#fde68a', inner);
        const text = `Hi ${opts.recipientName},\n\nYour appointment with ${opts.otherPartyName} has been rescheduled.\nNew Date: ${dateStr}\nDuration: ${opts.durationMinutes} minutes\nZoom Link: ${opts.joinUrl}${opts.meetingId ? `\nMeeting ID: ${opts.meetingId}` : ''}${opts.password ? `\nPasscode: ${opts.password}` : ''}\n\nThe Center for Community Change`;

        await this.sendMail(opts.to, subject, text, html);
    }

    private publicWeb(): string {
        return (this.configService.get<string>('CCC_PUBLIC_WEB_URL') || '').trim().replace(/\/$/, '');
    }

    private androidUrl(): string {
        return (this.configService.get<string>('CCC_ANDROID_APP_URL') || '').trim();
    }

    private iosUrl(): string {
        return (this.configService.get<string>('CCC_IOS_APP_URL') || '').trim();
    }

    private assessmentsPath(): string {
        return (
            this.configService.get<string>('CCC_ASSESSMENTS_PATH')?.trim()?.replace(/^\/|\/$/g, '') ??
            'assessments'
        );
    }

    /** Public profile deeplink template (fallback: `{web}/profile/{id}`). */
    profileUrl(userId: string): string {
        const w = this.publicWeb();
        if (!w || !userId) return '';
        const tpl =
            this.configService.get<string>('CCC_PROFILE_URL_TEMPLATE') || '{web}/profile/{userId}';
        return tpl.replace('{web}', w).replace('{userId}', userId);
    }

    roadmapUrl(roadmapId: string): string {
        const w = this.publicWeb();
        if (!w || !roadmapId) return '';
        const tpl =
            this.configService.get<string>('CCC_ROADMAP_URL_TEMPLATE') ||
            '{web}/roadmaps/{roadmapId}';
        return tpl.replace('{web}', w).replace('{roadmapId}', roadmapId);
    }

    assessmentsUrl(userId?: string): string {
        const w = this.publicWeb();
        if (!w) return '';
        const path = this.assessmentsPath();
        return userId ? `${w}/${path}?userHint=${encodeURIComponent(userId)}` : `${w}/${path}`;
    }

    private dashboardUrl(userId?: string): string {
        const w = this.publicWeb();
        if (!w) return '';
        return userId ? `${w}?userHint=${encodeURIComponent(userId)}` : w;
    }

    microGrantApplicantPortalUrl(applicationId?: string): string {
        const w = this.publicWeb();
        if (!w) return '';
        const seg = this.configService.get<string>('CCC_MICROGRANT_PORTAL_PATH')?.replace(/^\/+/, '').replace(/\/$/, '') || 'microgrant';
        return applicationId ? `${w}/${seg}/${encodeURIComponent(applicationId)}` : `${w}/${seg}`;
    }

    private appLinksSnippetText(): string {
        const web = this.publicWeb();
        const andr = this.androidUrl();
        const ios = this.iosUrl();
        const bits: string[] = [];
        if (web) bits.push(`Web: ${web}`);
        if (andr) bits.push(`Android: ${andr}`);
        if (ios) bits.push(`iOS: ${ios}`);
        return bits.length ? `\n\n${bits.join('\n')}` : '';
    }

    private optionalBodyFromConfig(key: string, fallbackHtml: string, fallbackText: string): {
        html: string;
        text: string;
    } {
        const raw = this.configService.get<string>(key);
        if (raw?.trim()) {
            return { html: raw.replace(/\n/g, '<br/>'), text: raw };
        }
        return { html: fallbackHtml, text: fallbackText };
    }

    private async emit(to: string | undefined | null, subject: string, text: string, html: string) {
        if (!to?.trim()) {
            this.logger.warn(`Skipping email "${subject}" — missing recipient`);
            return;
        }
        try {
            await this.sendMail(to.trim(), subject, text, html);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Email "${subject}" to ${to} failed: ${msg}`);
        }
    }

    /** Interest applicant received form (pastor / mentor / other roles submitting interest). */
    async sendInterestSubmissionConfirmation(opts: { to: string; firstName: string; applicantRoleHint?: string }) {
        const roleLine = opts.applicantRoleHint ?
            `<p style="margin:10px 0 0;font-size:13px;color:${this.emailMuted};">Applying as · <strong style="color:${this.emailInk};">${escapeEmailHtml(opts.applicantRoleHint)}</strong></p>`
            : '';
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Thank you for completing an interest form for <strong>The Center for Community Change (CCC)</strong>. We received your submission securely.', '10px')}
${roleLine}
<table role="presentation" width="100%" style="margin:22px 0;border-radius:10px;background:#ecfdf5;border:1px solid #bbf7d0;"><tr><td style="padding:14px 18px;font-size:14px;line-height:1.55;color:#166534;"><strong style="display:block;margin-bottom:6px;color:#15803d;">What happens next</strong><span>Open your CCC apps when you receive the next onboarding email—or explore the shortcuts below anytime.</span></td></tr></table>
${this.proseParagraph('Shortcuts to web and mobile are at the bottom of this email.', '22px')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\nWe received your interest form successfully.${opts.applicantRoleHint ? ` Applied as: ${opts.applicantRoleHint}.` : ''}\n\nContinue in the CCC web or mobile apps.` +
            this.appLinksSnippetText();
        await this.emit(
            opts.to,
            'Interest Form Successfully Submitted',
            text,
            this.wrapBranded('Interest form submitted', '#93c5fd', body),
        );
    }

    async sendInterestApprovedNextSteps(opts: { to: string; firstName: string }) {
        const custom = this.optionalBodyFromConfig(
            'CCC_INTEREST_APPROVED_HTML',
            `<p style="margin:0 0 14px;"><strong>Great news! Your interest submission has been reviewed and approved.</strong></p>
            <p style="margin:0 0 14px;">You can now log in to your account to view the next steps and continue your journey.</p>
            <p style="margin:0;">Please sign in on the web or download the Centre for Community Change mobile app. If you have any questions, feel free to contact us.</p>`,
            'Great news — your interest submission has been approved. Log in to continue. If you have questions, contact us.',
        );

        const body = `
${this.greetingParagraph(opts.firstName)}
<div style="margin:0 0 20px;line-height:1.65;color:#334155;font-size:15px;">${custom.html}</div>
${this.proseParagraph('<strong>Welcome aboard!</strong>', '14px')}
<table role="presentation" width="100%" style="margin:0 0 20px;border-radius:10px;border:1px solid ${this.emailBorder};background:#f8fafc;"><tr><td style="padding:14px 18px;font-size:13px;line-height:1.5;color:${this.emailMuted};">Tip: bookmark the CCC web app link on desktop and install the mobile app for session reminders.</td></tr></table>
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\n${custom.text}\n\nWelcome aboard!` + this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'Your Interest Has Been Approved',
            text,
            this.wrapBranded('Interest approved', '#86efac', body),
        );
    }

    async sendInterestRejected(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph(`After careful review, we’re unable to move forward with your interest application <strong>at this time</strong>. We appreciate the time you took to share your story with CCC.`, '18px')}
<table role="presentation" width="100%" style="margin:0;border-radius:10px;background:#fefefe;border:1px solid ${this.emailBorder};"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:${this.emailMuted};">If something looks incorrect or your situation changes, you’re welcome to reach out through the contact options on our website—but please don’t rely on replies from this automated address alone.</td></tr></table>
${this.appLinksSnippetHtml()}`;

        const text =
            `Hi ${opts.firstName},\n\nYour interest application was not approved at this time.${this.appLinksSnippetText()}`;

        await this.emit(
            opts.to,
            'Update on your CCC interest application',
            text,
            this.wrapBranded('Application update', '#fca5a5', body),
        );
    }

    async sendCourseOverview(opts: { to: string; firstName: string }) {
        const c = this.optionalBodyFromConfig(
            'CCC_COURSE_OVERVIEW_HTML',
            `<p style="margin:0 0 14px;"><strong>CCC mentorship at a glance</strong></p>
            <p style="margin:0 0 12px;">Your learning path blends orientation modules, roadmap milestones, mentorship conversations, and assessments.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;color:${this.emailMuted};"><tr><td style="padding:8px 0;border-bottom:1px solid ${this.emailBorder};">Orientation &amp; learning modules</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid ${this.emailBorder};">Mentorship sessions &amp; ongoing conversation</td></tr><tr><td style="padding:8px 0;">Roadmaps, assessments &amp; growth milestones</td></tr></table>`,
            'Overview: orientation and learning modules; mentor conversations; roadmaps and assessments.',
        );

        const body = `${this.greetingParagraph(opts.firstName)}<div style="margin:0 0 20px;line-height:1.65;color:#334155;font-size:15px;">${c.html}</div>${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\n${c.text}` + this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'CCC program overview',
            text,
            this.wrapBranded('Course overview', '#93c5fd', body),
        );
    }

    async sendPartnerAssignedWithProfile(opts: {
        to: string;
        recipientFirstName: string;
        counterpartName: string;
        counterpartUserId: string;
        counterpartRoleLabel: string;
    }) {
        const link = this.profileUrl(opts.counterpartUserId);
        const chip = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 20px;"><tr><td style="display:inline-block;padding:10px 14px;background:#eef2ff;border-radius:999px;font-size:12px;font-weight:700;color:#3730a3;text-transform:uppercase;letter-spacing:0.04em;">Your ${escapeEmailHtml(opts.counterpartRoleLabel)}</td></tr></table>`;
        const body = `
${this.greetingParagraph(opts.recipientFirstName)}
${this.proseParagraph(`You’ve been paired in CCC with your <strong>${escapeEmailHtml(opts.counterpartRoleLabel)}</strong>:`, '6px')}
${chip}
<table role="presentation" width="100%" style="border:1px solid ${this.emailBorder};border-radius:10px;background:#fafafa;"><tr><td style="padding:18px 20px;">
  <p style="margin:0;font-size:18px;font-weight:700;color:${this.emailInk};">${escapeEmailHtml(opts.counterpartName)}</p>
  <p style="margin:6px 0 0;font-size:13px;color:${this.emailMuted};">Open their profile anytime to coordinate sessions and roadmap work.</p>
  ${link ? this.primaryCta(link, 'View profile') : ''}
</td></tr></table>
${this.appLinksSnippetHtml()}
        `;
        let text =
            `Hi ${opts.recipientFirstName},\nYou have been connected with ${opts.counterpartName} (${opts.counterpartRoleLabel}).`;
        text += link ? `\nProfile: ${link}` : '';
        text += this.appLinksSnippetText();

        await this.emit(
            opts.to,
            `New ${opts.counterpartRoleLabel.toLowerCase()} connection — CCC`,
            text,
            this.wrapBranded('New connection', '#fde68a', body),
        );
    }

    async sendRoadmapsAssigned(opts: {
        to: string;
        recipientFirstName: string;
        roadmaps: { id: string; name: string; totalSteps?: number }[];
        introLine: string;
    }) {
        const roadmapBlocks = opts.roadmaps
            .map((r) => {
                const rUrl = this.roadmapUrl(r.id);
                const steps =
                    typeof r.totalSteps === 'number'
                        ? `<p style="margin:6px 0 0;font-size:13px;font-weight:600;color:${this.emailMuted};">${r.totalSteps} guided steps</p>`
                        : '';
                const cta =
                    rUrl ?
                        `<p style="margin:12px 0 0;"><a href="${escapeEmailAttr(rUrl)}" style="font-size:14px;font-weight:600;color:${this.emailAccentBlue};text-decoration:none;">Open roadmap →</a></p>`
                    :   `<p style="margin:12px 0 0;font-size:13px;color:${this.emailMuted};">Available in your CCC dashboard.</p>`;
                return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${this.emailBorder};border-radius:10px;background:#fafafa;"><tr><td style="padding:16px 18px;">
<p style="margin:0;font-size:16px;font-weight:700;color:${this.emailInk};">${escapeEmailHtml(r.name)}</p>${steps}${cta}
</td></tr></table>`;
            })
            .join('');
        const listFallback = `<table role="presentation" width="100%"><tr><td style="padding:16px;background:#fefce8;border:1px solid #fde047;border-radius:10px;font-size:14px;color:${this.emailMuted};">Roadmap details appear in your CCC dashboard shortly.</td></tr></table>`;

        const body = `
${this.greetingParagraph(opts.recipientFirstName)}
${this.proseParagraph(escapeEmailHtml(opts.introLine), '18px')}
${roadmapBlocks || listFallback}
${this.appLinksSnippetHtml()}`;

        let textLines =
            `${opts.introLine}\n\n` +
            opts.roadmaps
                .map((r) => {
                    const u = this.roadmapUrl(r.id);
                    return `- ${r.name}${typeof r.totalSteps === 'number' ? ` (${r.totalSteps} steps)` : ''}${u ? ` — ${u}` : ''}`;
                })
                .join('\n');
        textLines += this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'New roadmap(s) assigned — CCC',
            `Hi ${opts.recipientFirstName},\n\n${textLines}`,
            this.wrapBranded('Roadmaps assigned', '#bfdbfe', body),
        );
    }

    async sendMentorNewPastorQuery(opts: {
        to: string;
        mentorFirstName: string;
        pastorName: string;
        roadMapName: string;
        excerpt: string;
    }) {
        const body = `
${this.greetingParagraph(opts.mentorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.pastorName)}</strong> asked something new on <strong>${escapeEmailHtml(opts.roadMapName)}</strong>.`, '12px')}
${this.calloutBlockquote(opts.excerpt, '#6366f1', '#f5f3ff', '#3730a3')}
${this.proseParagraph(`<span style="color:${this.emailMuted};">Please respond in CCC when you can so your mentee can keep momentum.</span>`, '0')}
${this.appLinksSnippetHtml()}`;

        const text =
            `Hi ${opts.mentorFirstName},\n\n${opts.pastorName} asked a question on ${opts.roadMapName}:\n"${opts.excerpt}"` +
            this.appLinksSnippetText();

        await this.emit(opts.to, 'New roadmap question — CCC', text, this.wrapBranded('Pastor question', '#fde047', body));
    }

    async sendPastorQueryAnswered(opts: {
        to: string;
        pastorFirstName: string;
        mentorName: string;
        roadMapName: string;
        answerExcerpt: string;
    }) {
        const body = `
${this.greetingParagraph(opts.pastorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.mentorName)}</strong> replied on <strong>${escapeEmailHtml(opts.roadMapName)}</strong>.`, '12px')}
${this.calloutBlockquote(opts.answerExcerpt, '#22c55e', '#ecfdf5', '#14532d')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.pastorFirstName},\n\n${opts.mentorName} replied on ${opts.roadMapName}:\n"${opts.answerExcerpt}"` +
            this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'Your mentor responded — CCC',
            text,
            this.wrapBranded('Query answered', '#86efac', body),
        );
    }

    async sendPastorRoadmapComment(opts: {
        to: string;
        pastorFirstName: string;
        mentorName: string;
        roadMapName: string;
        commentExcerpt: string;
    }) {
        const body = `
${this.greetingParagraph(opts.pastorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.mentorName)}</strong> added a comment on <strong>${escapeEmailHtml(opts.roadMapName)}</strong>.`, '12px')}
${this.calloutBlockquote(opts.commentExcerpt, '#0ea5e9', '#e0f2fe', '#0c4a6e')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.pastorFirstName},\n\n${opts.mentorName} commented on ${opts.roadMapName}:\n"${opts.commentExcerpt}"` +
            this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'New mentor comment — CCC',
            text,
            this.wrapBranded('Mentor comment', '#bfdbfe', body),
        );
    }

    async sendAssessmentAssigned(opts: {
        to: string;
        firstName: string;
        assessmentTitle: string;
        assessmentId: string;
    }) {
        const base = this.publicWeb();
        const link = base ? `${base}/${this.assessmentsPath()}/${opts.assessmentId}` : '';

        const body = `
${this.greetingParagraph(opts.firstName)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid #ddd6fe;border-radius:10px;background:#faf5ff;">
<tr><td style="padding:16px 20px;">
<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">New assessment</p>
<p style="margin:8px 0 0;font-size:18px;font-weight:700;color:${this.emailInk};line-height:1.3;">${escapeEmailHtml(opts.assessmentTitle)}</p>
</td></tr></table>
${this.proseParagraph('Open it when you have a quiet moment — your answers save automatically.', '16px')}
${link ? this.primaryCta(link, 'Open assessment') : ''}
${this.appLinksSnippetHtml()}`;

        const text =
            `Hi ${opts.firstName},\n\nAssessment assigned: "${opts.assessmentTitle}".` +
            (link ? `\nOpen: ${link}` : '') +
            this.appLinksSnippetText();

        await this.emit(opts.to, 'New assessment assigned — CCC', text, this.wrapBranded('Assessment assigned', '#c4b5fd', body));
    }

    async sendCourseCompleted(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-radius:10px;background:#ecfdf5;border:1px solid #bbf7d0;"><tr><td style="padding:18px 20px;text-align:center;">
<p style="margin:0;font-size:15px;font-weight:700;color:#166534;line-height:1.4;">Congratulations — you’ve successfully completed your program milestones.</p>
<p style="margin:10px 0 0;font-size:14px;color:#15803d;line-height:1.5;">Log in to review your status. Your certificate will be available when your facilitator issues it.</p>
</td></tr></table>
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Congratulations — Your Program Is Complete',
            `Hi ${opts.firstName},\n\nCongratulations — you have completed your program milestones.` + this.appLinksSnippetText(),
            this.wrapBranded('Program complete', '#86efac', body),
        );
    }

    async sendCertificateIssued(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-radius:10px;background:linear-gradient(135deg,#fffbeb,#fef9c3);border:1px solid #fcd34d;"><tr><td style="padding:18px 20px;text-align:center;">
<p style="margin:0;font-size:16px;font-weight:700;color:#92400e;">You’re officially complete!</p>
<p style="margin:10px 0 0;font-size:14px;color:#a16207;line-height:1.55;">Your certificate is ready. Log in to download it and celebrate this achievement — we’re proud of the work you’ve accomplished.</p>
</td></tr></table>
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Your Certificate Has Been Issued',
            `Hi ${opts.firstName},\n\nCongratulations — your certificate is ready. Log in to download it.` + this.appLinksSnippetText(),
            this.wrapBranded('Certificate ready', '#fcd34d', body),
        );
    }

    async sendFieldMentorInvitation(opts: {
        to: string;
        invitedFirstName: string;
        inviterName: string;
        invitationLink: string;
    }) {
        const link = (opts.invitationLink ?? '').trim();
        const body = `
${this.greetingParagraph(opts.invitedFirstName)}
${this.proseParagraph('Congratulations on completing your program!', '10px')}
${this.proseParagraph(`Based on your achievement, <strong>${escapeEmailHtml(opts.inviterName)}</strong> has invited you to become a <strong>Field Mentor</strong> — an opportunity to guide others as they begin their journey.`, '18px')}
${
            link
                ? this.primaryCta(link, 'Review invitation')
                : `<p style="margin:14px 0;font-size:14px;color:${this.emailMuted};">Invitation link unavailable—ask your coordinator to resend.</p>`
        }
${this.proseParagraph('We’re excited about what’s ahead.', '0')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.invitedFirstName},\n\nCongratulations — you're invited to become a Field Mentor.\n${opts.inviterName} sent this invitation.` +
            (link ? `\nReview: ${link}` : '') +
            this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'You’re Invited to Become a Field Mentor',
            text,
            this.wrapBranded('Field mentor invitation', '#93c5fd', body),
        );
    }

    /** Optional extra email for mentorship session blocks (appointment confirmation already carries Zoom separately). */
    async sendMentorshipSessionReminder(opts: {
        to: string;
        recipientName: string;
        sessionTitle: string;
        meetingStart: Date;
        joinUrl?: string;
        counterpartName: string;
    }) {
        const when = opts.meetingStart.toUTCString();
        const join = (opts.joinUrl ?? '').trim();
        const zoomBlock = join
            ? `
${this.primaryCta(join, 'Join Zoom')}`
            : `
${this.proseParagraph(`<span style="color:${this.emailMuted};">A Zoom link will appear on the appointment card in CCC if one was scheduled.</span>`, '0')}`;
        const body = `
${this.greetingParagraph(opts.recipientName)}
${this.proseParagraph(`Session: <strong>${escapeEmailHtml(opts.sessionTitle)}</strong> · with <strong>${escapeEmailHtml(opts.counterpartName)}</strong>`, '12px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid ${this.emailBorder};border-radius:10px;"><tr><td style="padding:16px 18px;">
<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.06em;color:#475569;text-transform:uppercase;">When (UTC)</p>
<p style="margin:6px 0 0;font-size:15px;font-weight:600;color:${this.emailInk};line-height:1.45;">${escapeEmailHtml(when)}</p>
</td></tr></table>
${zoomBlock}
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Mentoring session reminder — CCC',
            `Hi ${opts.recipientName},\nSession: ${opts.sessionTitle}\nWith: ${opts.counterpartName}\nWhen: ${when}${opts.joinUrl ? `\nJoin: ${opts.joinUrl}` : ''}`,
            this.wrapBranded('Mentorship session', '#93c5fd', body),
        );
    }

    /** Director inbox — new interest submission. */
    async sendDirectorNewInterestSubmission(opts: {
        to: string;
        directorFirstName: string;
        applicantName: string;
        applicantRoleLabel: string;
        submittedAtIso: string;
    }) {
        const body = `
${this.greetingParagraph(opts.directorFirstName)}
${this.proseParagraph(
            `<strong>${escapeEmailHtml(opts.applicantName)}</strong> (${escapeEmailHtml(opts.applicantRoleLabel)}) has submitted an interest form and it is ready for your review.`,
            '16px',
        )}
<table role="presentation" width="100%" style="margin:0 0 18px;border:1px solid ${this.emailBorder};border-radius:10px;background:#fafafa;"><tr><td style="padding:16px 18px;font-size:14px;color:${this.emailInk};">
<p style="margin:0 0 6px;"><strong>Applicant</strong> · ${escapeEmailHtml(opts.applicantName)}</p>
<p style="margin:0 0 6px;"><strong>Role</strong> · ${escapeEmailHtml(opts.applicantRoleLabel)}</p>
<p style="margin:0;"><strong>Submitted</strong> · ${escapeEmailHtml(opts.submittedAtIso)}</p>
</td></tr></table>
${this.proseParagraph('Log in to your Director dashboard to review the details and take the next steps.', '0')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.directorFirstName},\n\n${opts.applicantName} (${opts.applicantRoleLabel}) submitted an interest form.\nSubmitted: ${opts.submittedAtIso}\n\nReview in your director dashboard.` +
            this.appLinksSnippetText();
        await this.emit(opts.to, 'New Interest Submission Received', text, this.wrapBranded('New interest', '#93c5fd', body));
    }

    /** Pastor / mentee — mentor assigned with richer context (optional community & program lines). */
    async sendInterestApprovedMentorAssigned(opts: {
        to: string;
        firstName: string;
        mentorName: string;
        communityName?: string;
        programName?: string;
    }) {
        const extras: string[] = [];
        if (opts.communityName?.trim()) extras.push(`<strong>Community</strong> · ${escapeEmailHtml(opts.communityName.trim())}`);
        if (opts.programName?.trim()) extras.push(`<strong>Program</strong> · ${escapeEmailHtml(opts.programName.trim())}`);
        const extraBlock =
            extras.length > 0 ?
                `<table role="presentation" width="100%" style="margin:0 0 18px;border-left:4px solid ${this.emailAccentBlue};background:#eff6ff;padding:14px 18px;border-radius:0 10px 10px 0;">
${extras.map((line) => `<p style="margin:0 0 8px;font-size:14px;color:#1e3a8a;">${line}</p>`).join('')}
</table>`
            :   '';
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Great news! Your interest submission has been approved. You’ve also been assigned a mentor to guide you.', '14px')}
<table role="presentation" width="100%" style="margin:0 0 16px;border:1px solid ${this.emailBorder};border-radius:10px;background:#fafafa;"><tr><td style="padding:16px 18px;">
<p style="margin:0;font-size:13px;color:${this.emailMuted};text-transform:uppercase;letter-spacing:0.05em;">Mentor</p>
<p style="margin:6px 0 0;font-size:18px;font-weight:700;">${escapeEmailHtml(opts.mentorName)}</p>
</td></tr></table>
${extraBlock}
${this.proseParagraph('Please log in to your account to view details and begin connecting with your mentor. We’re excited to support you!', '20px')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\nApproved — your mentor is ${opts.mentorName}.` +
            (opts.communityName ? `\nCommunity: ${opts.communityName}` : '') +
            (opts.programName ? `\nProgram: ${opts.programName}` : '') +
            this.appLinksSnippetText();
        await this.emit(opts.to, 'Your Interest Has Been Approved', text, this.wrapBranded('Mentor assigned', '#86efac', body));
    }

    async sendYouHaveBeenAssignedMentor(opts: {
        to: string;
        pastorFirstName: string;
        mentorName: string;
        mentorProfileUrl?: string;
    }) {
        const body = `
${this.greetingParagraph(opts.pastorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.mentorName)}</strong> has been assigned as your mentor.`, '16px')}
${this.proseParagraph('Log in to view your mentor’s profile and begin connecting.', '20px')}
${opts.mentorProfileUrl ? this.primaryCta(opts.mentorProfileUrl, 'View mentor profile') : ''}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.pastorFirstName},\n\n${opts.mentorName} has been assigned as your mentor.` +
            (opts.mentorProfileUrl ? `\nProfile: ${opts.mentorProfileUrl}` : '') +
            this.appLinksSnippetText();
        await this.emit(opts.to, 'You’ve Been Assigned a Mentor', text, this.wrapBranded('New mentor', '#fde68a', body));
    }

    async sendYouHaveBeenAssignedNewMentee(opts: {
        to: string;
        mentorFirstName: string;
        menteeName: string;
        menteeProfileUrl?: string;
    }) {
        const body = `
${this.greetingParagraph(opts.mentorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.menteeName)}</strong> has been assigned to you as a mentee.`, '16px')}
${this.proseParagraph('Log in to your dashboard to review their details and begin mentoring. Thank you for your leadership.', '20px')}
${opts.menteeProfileUrl ? this.primaryCta(opts.menteeProfileUrl, 'View mentee profile') : ''}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.mentorFirstName},\n\n${opts.menteeName} is now assigned as your mentee.` +
            (opts.menteeProfileUrl ? `\nProfile: ${opts.menteeProfileUrl}` : '') +
            this.appLinksSnippetText();
        await this.emit(opts.to, 'You’ve Been Assigned a New Mentee', text, this.wrapBranded('New mentee', '#bfdbfe', body));
    }

    async sendMenteeRemovedFromMentorEmail(opts: { to: string; firstName: string; mentorName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph(`Your mentorship assignment with <strong>${escapeEmailHtml(opts.mentorName)}</strong> has been updated. You are no longer assigned to this mentor at this time.`, '18px')}
${this.proseParagraph('If you have questions or would like to request a new mentor, please log in to your account. We’re here to support you.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\nYou were unassigned from mentor ${opts.mentorName}.` + this.appLinksSnippetText();
        await this.emit(opts.to, 'Update to Your Mentor Assignment', text, this.wrapBranded('Assignment update', '#fde68a', body));
    }

    async sendMentorMenteeRemovedEmail(opts: { to: string; mentorFirstName: string; menteeName: string }) {
        const body = `
${this.greetingParagraph(opts.mentorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.menteeName)}</strong> has been unassigned from you by the Director.`, '18px')}
${this.proseParagraph('Log in to your dashboard to view your updated mentee list. Thank you for your continued support.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.mentorFirstName},\n\n${opts.menteeName} was unassigned from you.` + this.appLinksSnippetText();
        await this.emit(opts.to, 'Mentee Assignment Update', text, this.wrapBranded('Mentee list updated', '#fca5a5', body));
    }

    async sendMentorMenteeCompletedProgram(opts: { to: string; mentorFirstName: string; menteeName: string }) {
        const body = `
${this.greetingParagraph(opts.mentorFirstName)}
${this.proseParagraph(`Great news — <strong>${escapeEmailHtml(opts.menteeName)}</strong> has completed the program successfully.`, '16px')}
${this.proseParagraph('Thank you for your mentorship and support throughout the journey.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.mentorFirstName},\n\n${opts.menteeName} completed the program. Thank you for mentoring them.`;
        await this.emit(opts.to, 'Your Mentee Has Completed the Program', text, this.wrapBranded('Mentee complete', '#86efac', body));
    }

    async sendDirectorCertificateIssued(opts: {
        to: string;
        directorFirstName: string;
        recipientName: string;
        courseName?: string;
        profileUrl?: string;
    }) {
        const body = `
${this.greetingParagraph(opts.directorFirstName)}
${this.proseParagraph(`A certificate has been issued to <strong>${escapeEmailHtml(opts.recipientName)}</strong>${opts.courseName ? ` for <strong>${escapeEmailHtml(opts.courseName)}</strong>` : ''}.`, '18px')}
${opts.profileUrl ? this.primaryCta(opts.profileUrl, 'View profile') : ''}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.directorFirstName},\n\nCertificate issued for ${opts.recipientName}.`;
        await this.emit(opts.to, 'Certificate Issued', text, this.wrapBranded('Certificate', '#fcd34d', body));
    }

    async sendFieldMentorAcceptedDirector(opts: {
        to: string;
        directorFirstName: string;
        newFieldMentorName: string;
        profileUrl?: string;
    }) {
        const body = `
${this.greetingParagraph(opts.directorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.newFieldMentorName)}</strong> has accepted the invitation to become a Field Mentor. Their role has been successfully updated.`, '18px')}
${opts.profileUrl ? this.primaryCta(opts.profileUrl, 'View profile') : ''}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.directorFirstName},\n\n${opts.newFieldMentorName} accepted the Field Mentor invitation.`;
        await this.emit(opts.to, 'Field Mentor Invitation Accepted', text, this.wrapBranded('Invitation accepted', '#86efac', body));
    }

    async sendFieldMentorRoleActivated(opts: { to: string; firstName: string }) {
        const dash = this.dashboardUrl();
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Welcome aboard! Your Field Mentor role has been activated. You now have access to mentor tools in your dashboard.', '16px')}
${this.proseParagraph('Log in to explore your new role and start making an impact.', '22px')}
${dash ? this.primaryCta(dash, 'Open dashboard') : ''}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\nYou're officially a Field Mentor. Log in to explore your dashboard.` + this.appLinksSnippetText();
        await this.emit(opts.to, 'You’re Officially a Field Mentor', text, this.wrapBranded('Welcome', '#93c5fd', body));
    }

    async sendAccountDeletedFarewell(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Your account has been successfully deleted.', '16px')}
${this.proseParagraph('We appreciate the time you spent with us. If you ever decide to come back, we’d be happy to welcome you again.', '10px')}
${this.proseParagraph('Take care!', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\nYour account has been deleted.`;
        await this.emit(opts.to, 'We’re Sorry to See You Go', text, this.wrapBranded('Account deleted', '#94a3b8', body));
    }

    async sendDirectorUserAccountDeleted(opts: { to: string; directorFirstName: string; deletedUserName: string }) {
        const body = `
${this.greetingParagraph(opts.directorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.deletedUserName)}</strong> has deleted their CCC account. Their profile and platform access have been removed.`, '0')}
${this.appLinksSnippetHtml()}`;
        await this.emit(opts.to, 'Pastor Account Deleted', `Hi ${opts.directorFirstName},\n\n${opts.deletedUserName} deleted their account.`, this.wrapBranded('Account removed', '#fca5a5', body));
    }

    async sendMentorNotifiedMenteeDeleted(opts: { to: string; mentorFirstName: string; menteeName: string }) {
        const body = `
${this.greetingParagraph(opts.mentorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.menteeName)}</strong> has deleted their CCC account. They are no longer on your mentee list.`, '18px')}
${this.proseParagraph('Log in to your Mentor dashboard to review your updated list.', '0')}
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Update to Your Mentee Assignment',
            `Hi ${opts.mentorFirstName},\n\n${opts.menteeName} deleted their account.`,
            this.wrapBranded('Mentee removed', '#fde68a', body),
        );
    }

    async sendMentorProfileDeactivated(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('We’re writing to let you know that your mentor profile has been removed from CCC. You no longer have access to mentor features at this time.', '16px')}
${this.proseParagraph('If you have questions, please contact support.', '0')}`;
        await this.emit(
            opts.to,
            'Update to Your Mentor Account',
            `Hi ${opts.firstName},\n\nYour mentor profile was removed.`,
            this.wrapBranded('Mentor access', '#fca5a5', body),
        );
    }

    async sendPastorMentorRemovedBySystem(opts: { to: string; pastorFirstName: string; mentorName: string }) {
        const body = `
${this.greetingParagraph(opts.pastorFirstName)}
${this.proseParagraph(`Your mentorship assignment with <strong>${escapeEmailHtml(opts.mentorName)}</strong> has been updated — they are no longer assigned as your mentor.`, '16px')}
${this.proseParagraph('We’ll notify you once a new mentor is assigned. If you have questions, log in or contact support.', '0')}
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Update to Your Mentor Assignment',
            `Assignment updated — ${opts.mentorName} is no longer your mentor.`,
            this.wrapBranded('Mentor update', '#fde68a', body),
        );
    }

    async sendAccountAccessRemoved(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('We’re writing to inform you that your CCC profile has been removed. You no longer have access to the platform at this time.', '16px')}
${this.proseParagraph('If you believe this was made in error, please contact support.', '0')}`;
        await this.emit(opts.to, 'Update to Your CCC Account', `Hi ${opts.firstName},\n\nYour CCC profile was removed.`, this.wrapBranded('Access removed', '#fca5a5', body));
    }

    /** After password change via profile/settings (not OTP body). */
    async sendPasswordChangedConfirmation(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('This is a confirmation that your account password has been successfully changed.', '14px')}
${this.proseParagraph('If you made this change, no further action is needed. If you did <strong>not</strong> change your password, reset it immediately or contact support.', '20px')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\nYour password was changed. If this wasn't you, contact support.`;
        await this.emit(opts.to, 'Your Password Has Been Changed', text, this.wrapBranded('Security', '#e2e8f0', body));
    }

    async sendMicroGrantDirectorNew(opts: {
        to: string;
        directorFirstName: string;
        applicantName: string;
        applicantRole: string;
        submittedAtIso: string;
        reviewUrl?: string;
    }) {
        const body = `
${this.greetingParagraph(opts.directorFirstName)}
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.applicantName)}</strong> has submitted a new micro-grant application.`, '14px')}
<table role="presentation" width="100%" style="margin:0 0 16px;border:1px solid ${this.emailBorder};border-radius:10px;background:#fafafa;"><tr><td style="padding:14px 18px;font-size:14px;">
<p style="margin:0 0 6px;"><strong>Applicant</strong> · ${escapeEmailHtml(opts.applicantName)}</p>
<p style="margin:0 0 6px;"><strong>Role</strong> · ${escapeEmailHtml(opts.applicantRole)}</p>
<p style="margin:0;"><strong>Submitted</strong> · ${escapeEmailHtml(opts.submittedAtIso)}</p>
</td></tr></table>
${opts.reviewUrl ? this.primaryCta(opts.reviewUrl, 'Review application') : this.proseParagraph('Log in to your Director dashboard to review.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `New micro-grant from ${opts.applicantName}. Submitted ${opts.submittedAtIso}.`;
        await this.emit(opts.to, 'New Micro-Grant Application Received', text, this.wrapBranded('Micro-grant', '#c4b5fd', body));
    }

    async sendMicroGrantApplicantReceived(opts: { to: string; firstName: string; statusUrl?: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('We’ve received your micro-grant application. Our team will review your request and notify you once a decision has been made.', '16px')}
${opts.statusUrl ? this.primaryCta(opts.statusUrl, 'View application status') : ''}
${this.proseParagraph('Thanks for submitting — we’ll be in touch soon.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\nWe received your micro-grant application.`;
        await this.emit(opts.to, 'Your Micro-Grant Application Is In', text, this.wrapBranded('Application received', '#86efac', body));
    }

    async sendMicroGrantRejected(opts: { to: string; firstName: string; detailUrl?: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Thank you for submitting a micro-grant application. After review, your application was not approved at this time.', '16px')}
${opts.detailUrl ? this.primaryCta(opts.detailUrl, 'View application details') : ''}
${this.proseParagraph('If you have questions, log in or contact the CCC Team.', '0')}
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\nYour micro-grant application was not approved at this time.` + this.appLinksSnippetText();
        await this.emit(opts.to, 'Update on Your Micro-Grant Application', text, this.wrapBranded('Application update', '#fca5a5', body));
    }

    async sendMicroGrantPending(opts: { to: string; firstName: string; statusUrl?: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
${this.proseParagraph('Your micro-grant application has been moved to <strong>pending</strong> status. We may need additional time or information before a final decision.', '16px')}
${opts.statusUrl ? this.primaryCta(opts.statusUrl, 'View status') : ''}
${this.proseParagraph('We’ll notify you when there is an update.', '0')}
${this.appLinksSnippetHtml()}`;
        const text = `Hi ${opts.firstName},\n\nYour micro-grant is pending review.`;
        await this.emit(opts.to, 'Your Micro-Grant Application Is Pending', text, this.wrapBranded('Pending', '#fde68a', body));
    }
}
