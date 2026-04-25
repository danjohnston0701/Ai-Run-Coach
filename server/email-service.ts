import { Resend } from "resend";

// Resend integration via Replit Connectors — never cache this client
async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Resend integration not available in this environment");
  }

  const data = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  ).then((r) => r.json());

  const settings = data.items?.[0];
  if (!settings?.settings?.api_key) {
    throw new Error("Resend not connected — please link your Resend account in Replit integrations");
  }

  return {
    client: new Resend(settings.settings.api_key),
    fromEmail: settings.settings.from_email || "noreply@airuncoach.live",
  };
}

export async function sendSupportEmail(opts: {
  name: string;
  email: string;
  subject: string;
  message: string;
  screenshots?: Array<{ filename: string; base64: string; mimeType: string }>;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const subjectLine = opts.subject?.trim() || "Support Request";

  // Use the real notification inbox; fall back to noreply (visible in logs) if not set
  const notifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || fromEmail;

  const screenshotCount = opts.screenshots?.length ?? 0;
  const attachmentNote = screenshotCount > 0
    ? `<p style="margin: 16px 0 0; color: #94a3b8; font-size: 13px;">📎 ${screenshotCount} screenshot${screenshotCount > 1 ? "s" : ""} attached.</p>`
    : "";

  const attachments = (opts.screenshots ?? []).map((s, i) => ({
    filename: s.filename || `screenshot-${i + 1}.png`,
    content: s.base64,
    type: s.mimeType || "image/png",
  }));

  // Notify the support team
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: notifyEmail,
    replyTo: opts.email,
    subject: `[Support] ${subjectLine}`,
    attachments,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">AI Run Coach — Support Request</h1>
        </div>
        <div style="padding: 40px 32px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 80px;">From</td><td style="padding: 8px 0; color: #ffffff;">${opts.name} &lt;${opts.email}&gt;</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Subject</td><td style="padding: 8px 0; color: #ffffff;">${subjectLine}</td></tr>
          </table>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00D4FF;">
            <p style="margin: 0; color: #e2e8f0; line-height: 1.7; white-space: pre-wrap;">${opts.message}</p>
          </div>
          ${attachmentNote}
          <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">Reply directly to this email to respond to ${opts.name}.</p>
        </div>
      </div>
    `,
    text: `Support request from ${opts.name} <${opts.email}>\nSubject: ${subjectLine}\n\n${opts.message}${screenshotCount > 0 ? `\n\n[${screenshotCount} screenshot(s) attached]` : ""}`,
  });

  // Auto-reply to the user
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: opts.email,
    subject: "We've received your support request — AI Run Coach",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">AI Run Coach</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Hi ${opts.name},</h2>
          <p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6;">Thanks for getting in touch! We've received your support request and our team will get back to you within 24 hours on business days.</p>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
            <p style="margin: 0 0 6px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your message</p>
            <p style="margin: 0; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${opts.message}</p>
          </div>
          <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">While you wait, you may find an answer in our <a href="https://airuncoach.live/support" style="color: #00D4FF;">Help Centre</a>.</p>
          <p style="margin: 24px 0 0; color: #64748b; font-size: 13px;">The AI Run Coach Team</p>
        </div>
      </div>
    `,
    text: `Hi ${opts.name},\n\nThanks for reaching out! We've received your support request and will get back to you within 24 hours.\n\nYour message:\n${opts.message}\n\nThe AI Run Coach Team`,
  });
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const resetUrl = `https://airuncoach.live/reset-password?token=${resetToken}`;

  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to,
    subject: "Reset your AI Run Coach password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">AI Run Coach</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Reset your password</h2>
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; background: #00D4FF; color: #0A0A1A; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 999px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">Reset Password</a>
          <p style="margin: 32px 0 0; color: #64748b; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          <p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #00D4FF;">${resetUrl}</a></p>
        </div>
      </div>
    `,
    text: `Reset your AI Run Coach password\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}
