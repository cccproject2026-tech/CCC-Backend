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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;">
  <tr>
    <td align="center" style="padding:28px 16px;font-family:${this.emailFontStack};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid ${this.emailBorder};overflow:hidden;">
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
          <td style="padding:32px 32px 24px;color:${this.emailInk};font-size:15px;line-height:1.6;">
            ${innerBodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;font-size:12px;line-height:1.55;color:${this.emailMuted};border-top:1px solid #f1f5f9;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding-top:20px;">
                <p style="margin:0;">You are receiving this because of activity in your CCC account.</p>
                <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;">CCC · © ${y} · Community mentorship &amp; learning</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:16px auto 0;max-width:600px;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">If buttons do not work, copy the plain link shown below each button.</p>
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
        return `<p style="margin:0 0 ${marginBottom};font-size:15px;line-height:1.65;color:#334155;">${html}</p>`;
    }

    private primaryCta(href: string, label: string): string {
        const h = escapeEmailAttr(href);
        return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;">
  <tr>
    <td style="border-radius:8px;background:${this.emailAccentBlue};">
      <a href="${h}" style="display:inline-block;padding:14px 28px;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:600;line-height:1.2;font-family:${this.emailFontStack};">${escapeEmailHtml(label)}</a>
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
                `<tr><td style="padding:8px 0;border-bottom:1px solid ${this.emailBorder};"><a href="${w}" style="color:${this.emailAccentBlue};font-size:14px;font-weight:600;text-decoration:none;">Web app »</a><span style="display:block;margin-top:2px;font-size:12px;color:${this.emailMuted};word-break:break-all;">${escapeEmailHtml(web)}</span></td></tr>`,
            );
        }
        if (andr) {
            const a = escapeEmailAttr(andr);
            rows.push(
                `<tr><td style="padding:8px 0;border-bottom:1px solid ${this.emailBorder};"><a href="${a}" style="color:${this.emailAccentBlue};font-size:14px;font-weight:600;text-decoration:none;">Google Play »</a></td></tr>`,
            );
        }
        if (ios) {
            const i = escapeEmailAttr(ios);
            rows.push(
                `<tr><td style="padding:8px 0;"><a href="${i}" style="color:${this.emailAccentBlue};font-size:14px;font-weight:600;text-decoration:none;">App Store »</a></td></tr>`,
            );
        }
        if (!rows.length) return '';
        return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;background:#f8fafc;border-radius:10px;border:1px solid ${this.emailBorder};">
  <tr>
    <td style="padding:16px 18px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:#475569;text-transform:uppercase;">Continue in CCC</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>
    </td>
  </tr>
</table>`;
    }

    async sendOtpEmail(email: string, otp: string) {
        const subject = 'Your OTP Code';
        const safeOtp = escapeEmailHtml(otp);
        const text = `Your OTP code is ${otp}. It will expire in 10 minutes.`;
        const inner = `
${this.proseParagraph('Use this one-time code to complete your sign-in. It expires in <b>10 minutes</b>.', '20px')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="padding:18px 24px;background:#f1f5f9;border-radius:10px;border:1px dashed #cbd5e1;text-align:center;">
  <p style="margin:0;font-size:12px;color:${this.emailMuted};letter-spacing:0.06em;text-transform:uppercase;">Your code</p>
  <p style="margin:8px 0 0;font-size:28px;font-weight:700;letter-spacing:0.25em;color:${this.emailInk};font-family:ui-monospace,Consolas,monospace;">${safeOtp}</p>
</td></tr></table>
${this.proseParagraph('If you didn’t request this, you can safely ignore this email.', '0')}`;
        const html = this.layoutEmail('Sign-in verification', '#fde68a', inner);
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
            'We received your interest form',
            text,
            this.wrapBranded('Interest form submitted', '#93c5fd', body),
        );
    }

    async sendInterestApprovedNextSteps(opts: { to: string; firstName: string }) {
        const custom = this.optionalBodyFromConfig(
            'CCC_INTEREST_APPROVED_HTML',
            '<p style="margin:0 0 14px;"><strong>Welcoming you to CCC.</strong></p><p style="margin:0;">Your application has been accepted. Sign in with the CCC web app or mobile app to begin onboarding, meet your cohort resources, and start your mentorship journey.</p>',
            'Your application has been accepted. Sign in via the CCC web or mobile apps to continue.',
        );

        const body = `
${this.greetingParagraph(opts.firstName)}
<div style="margin:0 0 20px;line-height:1.65;color:#334155;font-size:15px;">${custom.html}</div>
<table role="presentation" width="100%" style="margin:0 0 20px;border-radius:10px;border:1px solid ${this.emailBorder};background:#f8fafc;"><tr><td style="padding:14px 18px;font-size:13px;line-height:1.5;color:${this.emailMuted};">Tip: bookmark the CCC web app link on desktop and install the mobile app for session reminders.</td></tr></table>
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.firstName},\n\n${custom.text}` + this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'Your CCC application has been accepted',
            text,
            this.wrapBranded('Application accepted', '#86efac', body),
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
<p style="margin:0;font-size:15px;font-weight:700;color:#166534;line-height:1.4;">All required course milestones are complete.</p>
<p style="margin:10px 0 0;font-size:14px;color:#15803d;line-height:1.5;">Thank you for walking through CCC with diligence—your facilitator will share any wrap-up instructions.</p>
</td></tr></table>
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Course completed — CCC',
            `Hi ${opts.firstName},\n\nCongratulations — course completed.` + this.appLinksSnippetText(),
            this.wrapBranded('Course completed', '#86efac', body),
        );
    }

    async sendCertificateIssued(opts: { to: string; firstName: string }) {
        const body = `
${this.greetingParagraph(opts.firstName)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-radius:10px;background:linear-gradient(135deg,#fffbeb,#fef9c3);border:1px solid #fcd34d;"><tr><td style="padding:18px 20px;text-align:center;">
<p style="margin:0;font-size:15px;font-weight:700;color:#92400e;">Your CCC certificate has been issued</p>
<p style="margin:10px 0 0;font-size:14px;color:#a16207;line-height:1.55;">Open your dashboard to download or share official documents.</p>
</td></tr></table>
${this.appLinksSnippetHtml()}`;
        await this.emit(
            opts.to,
            'Certificate issued — CCC',
            `Hi ${opts.firstName},\n\nYour certificate has been issued.` + this.appLinksSnippetText(),
            this.wrapBranded('Certificate', '#fcd34d', body),
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
${this.proseParagraph(`<strong>${escapeEmailHtml(opts.inviterName)}</strong> invited you to become a <strong>Field Mentor</strong> for CCC—a leadership role alongside our mentor community.`, '18px')}
${
            link
                ? this.primaryCta(link, 'Review invitation')
                : `<p style="margin:14px 0;font-size:14px;color:${this.emailMuted};">Invitation link unavailable—ask your coordinator to resend.</p>`
        }
${this.appLinksSnippetHtml()}`;
        const text =
            `Hi ${opts.invitedFirstName},\n\n${opts.inviterName} invited you to become a Field Mentor.\nReview: ${opts.invitationLink}` +
            this.appLinksSnippetText();

        await this.emit(
            opts.to,
            'Field mentor invitation — CCC',
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
}
