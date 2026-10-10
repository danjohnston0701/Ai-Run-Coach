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
  // Set by the mobile apps' in-app "Get Support" form — lets support see who/what without
  // asking. All optional; the public web contact form sends none of them.
  userId?: string | null;
  platform?: string | null;     // "android" | "ios" | "web"
  appVersion?: string | null;
  deviceInfo?: string | null;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const subjectLine = opts.subject?.trim() || "Support Request";

  // Explicit support@ default. This used to fall back to fromEmail (noreply@airuncoach.live),
  // so with SUPPORT_NOTIFICATION_EMAIL unset every support ticket went to an inbox nobody
  // reads. Same fix sendAccountDeletionNotification below already had.
  const notifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live";

  const screenshotCount = opts.screenshots?.length ?? 0;
  const attachmentNote = screenshotCount > 0
    ? `<p style="margin: 16px 0 0; color: #94a3b8; font-size: 13px;">📎 ${screenshotCount} screenshot${screenshotCount > 1 ? "s" : ""} attached.</p>`
    : "";

  const contextRows = [
    opts.userId ? ["User ID", opts.userId] : null,
    opts.platform ? ["Platform", opts.platform] : null,
    opts.appVersion ? ["App version", opts.appVersion] : null,
    opts.deviceInfo ? ["Device", opts.deviceInfo] : null,
  ].filter((r): r is [string, string] => !!r);
  const contextHtml = contextRows
    .map(([k, v]) => `<tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">${k}</td><td style="padding: 8px 0; color: #ffffff;">${v}</td></tr>`)
    .join("");
  const contextText = contextRows.map(([k, v]) => `${k}: ${v}`).join("\n");

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
            ${contextHtml}
          </table>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00D4FF;">
            <p style="margin: 0; color: #e2e8f0; line-height: 1.7; white-space: pre-wrap;">${opts.message}</p>
          </div>
          ${attachmentNote}
          <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">Reply directly to this email to respond to ${opts.name}.</p>
        </div>
      </div>
    `,
    text: `Support request from ${opts.name} <${opts.email}>\nSubject: ${subjectLine}\n${contextText ? contextText + "\n" : ""}\n${opts.message}${screenshotCount > 0 ? `\n\n[${screenshotCount} screenshot(s) attached]` : ""}`,
  });

  // Auto-reply to the user. Non-fatal: the ticket has already reached support above, so a
  // failure here (e.g. a typo'd address) must not turn into a 500 that tells the user
  // their request failed when it didn't.
  try {
    await sendSupportAutoReply(client, fromEmail, opts.name, opts.email, opts.message);
  } catch (err) {
    console.warn(`[Support] Ticket delivered to ${notifyEmail} but auto-reply to ${opts.email} failed (non-fatal):`, err);
  }
}

async function sendSupportAutoReply(
  client: Resend,
  fromEmail: string,
  name: string,
  email: string,
  message: string,
): Promise<void> {
  const opts = { name, email, message };
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

export async function sendInterestRegistrationEmail(opts: {
  name: string;
  email: string;
  country: string;
  message?: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const notifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || fromEmail;

  const messageRow = opts.message
    ? `<tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 80px; vertical-align: top;">Message</td><td style="padding: 8px 0; color: #ffffff; white-space: pre-wrap;">${opts.message}</td></tr>`
    : "";
  const messageText = opts.message ? `\nMessage: ${opts.message}` : "";

  // Notify the team
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: notifyEmail,
    replyTo: opts.email,
    subject: `[Interest Registration] ${opts.name} from ${opts.country}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">New Interest Registration</h1>
        </div>
        <div style="padding: 40px 32px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 80px;">Name</td><td style="padding: 8px 0; color: #ffffff;">${opts.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Email</td><td style="padding: 8px 0; color: #ffffff;">${opts.email}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Country</td><td style="padding: 8px 0; color: #ffffff;">${opts.country}</td></tr>
            ${messageRow}
          </table>
        </div>
      </div>
    `,
    text: `New interest registration:\nName: ${opts.name}\nEmail: ${opts.email}\nCountry: ${opts.country}${messageText}`,
  });

  // Confirmation to the user
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: opts.email,
    subject: "You're on the list — AI Run Coach",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">AI Run Coach</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Hi ${opts.name}, you're on the list! 🏃</h2>
          <p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6;">Thanks for registering your interest in AI Run Coach. We'll keep you updated on our development progress and let you know as soon as the app is ready to download.</p>
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">In the meantime, feel free to explore our website to learn more about the features we're building for you.</p>
          <a href="https://airuncoach.live" style="display: inline-block; background: #00D4FF; color: #0A0A1A; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 999px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">Visit AI Run Coach</a>
          <p style="margin: 32px 0 0; color: #64748b; font-size: 13px;">The AI Run Coach Team</p>
        </div>
      </div>
    `,
    text: `Hi ${opts.name},\n\nThanks for registering your interest in AI Run Coach! We'll keep you updated on development progress and let you know when the app is available to download.\n\nThe AI Run Coach Team`,
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

export async function sendObserverInvitationEmail(
  email: string,
  runnerName: string,
  sessionId: string,
  token: string,
  inviteCode?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    // Use short code if available, otherwise fall back to token
    const primaryCode = inviteCode || token;
    
    // Deep link for opening app directly (iOS/Android) — use short code if available
    const deepLink = `airuncoach://observe/${primaryCode}`;
    
    // The email button must be an https link, not the custom scheme: Gmail (iOS and Android)
    // and several other mail clients silently ignore airuncoach:// hrefs, which is exactly what
    // a recipient reported on 2026-09-20 ("Observe in app" did nothing). /observe/{code} is a
    // server-rendered landing page (routes.ts) that shows the code and offers the app link.
    const webLink = `https://airuncoach.live/observe/${primaryCode}`;

    // Build email content — inviteCode SHOULD always be present in new invitations
    const codeDisplayHtml = `<p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6; font-size: 14px;"><strong>Your 8-character invite code:</strong> Type this code in the app to watch instantly:</p>
         <div style="background: #1a1a2e; padding: 16px; border-radius: 8px; text-align: center; margin: 0 0 16px;">
           <code style="font-family: monospace; color: #00D4FF; font-size: 28px; font-weight: 700; letter-spacing: 6px;">${inviteCode}</code>
         </div>`;

    const codeDisplayText = `Your 8-character invite code: ${inviteCode}\n`;

    await client.emails.send({
      from: `AI Run Coach <${fromEmail}>`,
      to: email,
      subject: `${runnerName} invited you to watch their run`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">🏃 You're Invited!</h1>
          </div>
          <div style="padding: 40px 32px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Watch ${runnerName}'s live run</h2>
            <p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6;">${runnerName} has invited you to watch their run in real-time.</p>
            <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">See their live location, route, and metrics as they run — no account needed!</p>
            ${codeDisplayHtml}
            <a href="${webLink}" style="display: inline-block; background: #00D4FF; color: #0A0A1A; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 999px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">Watch Live Run →</a>
            <p style="margin: 24px 0 0; color: #94a3b8; line-height: 1.6; font-size: 14px;">No app? Or if the link above doesn't work:</p>
            <ol style="margin: 12px 0; color: #94a3b8; padding-left: 20px;">
              <li style="margin: 6px 0;">Download AI Run Coach from the app store</li>
              <li style="margin: 6px 0;">On the login screen, tap "Observe Live Run"</li>
              <li style="margin: 6px 0;">Enter the 8-character code: <code style="background: #1a1a2e; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #00D4FF; font-weight: 600;">${inviteCode}</code></li>
            </ol>
            <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">This link will expire in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #1a1a2e; margin: 32px 0; opacity: 0.5;" />
            <p style="margin: 0; color: #64748b; font-size: 12px;">AI Run Coach — Your personal running coach</p>
          </div>
        </div>
      `,
      text: `${runnerName} invited you to watch their run!\n\nSee their live location, route, and metrics as they run — no account needed!\n\n${codeDisplayText}\nOption 1: Open this link\n${webLink}\n(or, with the app installed: ${deepLink})\n\nOption 2: Download the app and enter your invite code\n1. Download AI Run Coach from the app store\n2. On the login screen, tap "Observe Live Run"\n3. Enter this 8-character code: ${inviteCode}\n\nThis link will expire in 7 days.\n\n---\nAI Run Coach — Your personal running coach`,
    });

    console.log(`[Email] Observer invitation sent to ${email} for session ${sessionId} (code: ${inviteCode || 'MISSING'})`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send observer invitation to ${email}:`, error);
    return false;
  }
}

export async function sendFriendLiveRunInvitationEmail(
  email: string,
  friendName: string,
  runnerName: string,
  sessionId: string,
  inviteCode: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();

    // Registered friends get the SAME essentials as everyone else: the 8-character code shown
    // in the body, the manual "Observe Live Run" steps and an https landing link. This template
    // used to carry only an airuncoach:// button on the assumption that a friend "has the app
    // and gets a push" — a friend on 2026-09-20 got the email, no push, a button that did
    // nothing in Gmail, and no code to type. Product rule: every observer invitation email
    // must contain the live session code, existing user or not.
    const appLink = `airuncoach://observe/${inviteCode}`;
    const webLink = `https://airuncoach.live/observe/${inviteCode}`;
    const codeHtml = inviteCode
      ? `<p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6; font-size: 14px;"><strong>Your 8-character invite code:</strong> Type this in the app to watch instantly:</p>
         <div style="background: #1a1a2e; padding: 16px; border-radius: 8px; text-align: center; margin: 0 0 16px;">
           <code style="font-family: monospace; color: #00D4FF; font-size: 28px; font-weight: 700; letter-spacing: 6px;">${inviteCode}</code>
         </div>`
      : '';

    await client.emails.send({
      from: `AI Run Coach <${fromEmail}>`,
      to: email,
      subject: `${runnerName} invited you to watch their run`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">🏃 Live Run Invite</h1>
          </div>
          <div style="padding: 40px 32px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Watch ${runnerName}'s run live</h2>
            <p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6;">Hi ${friendName},</p>
            <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">${runnerName} has invited you to watch their run in real-time. See their live location, route, and metrics as they run!</p>
            ${codeHtml}
            <div style="text-align: center;">
              <a href="${webLink}" style="display: inline-block; background: #00D4FF; color: #0A0A1A; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 999px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">Watch Now →</a>
            </div>
            <p style="margin: 24px 0 0; color: #94a3b8; line-height: 1.6; font-size: 14px;">If the button doesn't open the app:</p>
            <ol style="margin: 12px 0; color: #94a3b8; padding-left: 20px;">
              <li style="margin: 6px 0;">Open AI Run Coach</li>
              <li style="margin: 6px 0;">On the login screen (or Live Share), tap "Observe Live Run"</li>
              <li style="margin: 6px 0;">Enter the 8-character code: <code style="background: #1a1a2e; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #00D4FF; font-weight: 600;">${inviteCode}</code></li>
            </ol>
            <p style="margin: 24px 0 0; color: #64748b; font-size: 12px; text-align: center;">You may also receive a push notification in the app</p>
            <hr style="border: none; border-top: 1px solid #1a1a2e; margin: 32px 0; opacity: 0.5;" />
            <p style="margin: 0; color: #64748b; font-size: 12px;">AI Run Coach — Your personal running coach</p>
          </div>
        </div>
      `,
      text: `${runnerName} invited you to watch their run!\n\nYour 8-character invite code: ${inviteCode}\n\nWatch their live location, route, and metrics as they run.\n\nOpen this link: ${webLink}\n(or, with the app installed: ${appLink})\n\nOr open AI Run Coach, tap "Observe Live Run" on the login screen and enter the code: ${inviteCode}\n\n---\nAI Run Coach — Your personal running coach`,
    });

    console.log(`[Email] Friend live-run invitation sent to ${email} from ${runnerName} (code: ${inviteCode || 'MISSING'})`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send friend live-run invitation to ${email}:`, error);
    return false;
  }
}

/**
 * Internal email to the team (not to a user). `to` defaults to SUPPORT_NOTIFICATION_EMAIL /
 * support@airuncoach.live — never to fromEmail (noreply@), which nobody reads.
 */
export async function sendInternalEmail(opts: { subject: string; html: string; text: string; to?: string | null }): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const to = opts.to || process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live";
  await client.emails.send({ from: `AI Run Coach <${fromEmail}>`, to, subject: opts.subject, html: opts.html, text: opts.text });
}

export async function sendAccountDeletionNotification(opts: {
  userId: string;
  email: string;
  name: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  // Explicit support@ default — falling back to fromEmail (noreply@) would send this
  // notification somewhere nobody actually checks if SUPPORT_NOTIFICATION_EMAIL isn't set.
  const notifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live";
  const deletionTime = new Date().toISOString();

  // Notify the support team about the deletion
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: notifyEmail,
    subject: `[Account Deletion] User requested account removal`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">Account Deletion Notice</h1>
        </div>
        <div style="padding: 40px 32px;">
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">A user has requested account deletion:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 100px;">User ID</td><td style="padding: 8px 0; color: #ffffff; font-family: monospace;">${opts.userId}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Email</td><td style="padding: 8px 0; color: #ffffff;">${opts.email}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Name</td><td style="padding: 8px 0; color: #ffffff;">${opts.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Deleted At</td><td style="padding: 8px 0; color: #ffffff;">${deletionTime}</td></tr>
          </table>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #EF4444;">
            <p style="margin: 0; color: #e2e8f0; font-size: 14px;">✓ User account and all associated data have been permanently deleted from the database.</p>
            <p style="margin: 8px 0 0; color: #e2e8f0; font-size: 14px;">✓ The user will not be able to log in with this email address again.</p>
          </div>
          <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">This is an automated notification. Please verify the deletion was processed successfully in the database.</p>
        </div>
      </div>
    `,
    text: `Account Deletion Notice\n\nA user has requested account deletion:\nUser ID: ${opts.userId}\nEmail: ${opts.email}\nName: ${opts.name}\nDeleted At: ${deletionTime}\n\nUser account and all associated data have been permanently deleted.\nThe user will not be able to log in with this email again.`,
  });

  console.log(`[Email] Account deletion notification sent to support for user ${opts.userId}`);
}

export async function sendEmailVerificationEmail(opts: {
  email: string;
  name: string;
  otp: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: opts.email,
    subject: "Verify your AI Run Coach account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00D4FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0A0A1A;">AI Run Coach</h1>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff;">Verify your email, ${opts.name} 🏃</h2>
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">Welcome to AI Run Coach! Enter the 6-digit code below in the app to verify your email address. This code expires in <strong style="color: #ffffff;">24 hours</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #111827; border: 2px solid #00D4FF; border-radius: 12px; padding: 20px 40px;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #00D4FF; font-family: monospace;">${opts.otp}</span>
            </div>
          </div>
          <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; text-align: center;">If you didn't create an account, you can safely ignore this email.</p>
          <p style="margin: 0; color: #64748b; font-size: 13px; text-align: center;">The AI Run Coach Team</p>
        </div>
      </div>
    `,
    text: `Welcome to AI Run Coach, ${opts.name}!\n\nYour email verification code is: ${opts.otp}\n\nThis code expires in 24 hours.\n\nIf you didn't create an account, you can safely ignore this email.\n\nThe AI Run Coach Team`,
  });

  console.log(`[Email] Email verification OTP sent to ${opts.email}`);
}

/**
 * "Approaching your monthly limit" — sent once per feature per month when a user's usage
 * crosses USAGE_ALERT_THRESHOLD (tier-limits.ts). The user gets a heads-up with an upgrade
 * nudge; SUPPORT_NOTIFICATION_EMAIL gets a one-line internal copy so we can see who is
 * running hot. Triggered from usage-service.ts recordUsage() → maybeSendUsageAlert().
 */
export async function sendUsageThresholdAlert(opts: {
  userId: string;
  email: string;
  name: string;
  tier: string;
  feature: "aiCoachingKm" | "trainingPlansGenerated" | "routesGenerated" | "postRunAnalyses";
  used: number;
  limit: number;
  yearMonth: string;
  resetMonth: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const notifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live";

  const featureLabel: Record<typeof opts.feature, string> = {
    aiCoachingKm: "AI-coached kilometres",
    trainingPlansGenerated: "AI training plans",
    routesGenerated: "AI route generations",
    postRunAnalyses: "AI post-run summaries",
  };
  const label = featureLabel[opts.feature];
  const unit = opts.feature === "aiCoachingKm" ? " km" : "";
  const usedStr = opts.feature === "aiCoachingKm" ? opts.used.toFixed(1) : String(opts.used);
  const pct = Math.round((opts.used / opts.limit) * 100);
  const isFree = opts.tier === "free";
  const tierLabel = isFree ? "free trial" : `${opts.tier.replace("_noaiplan", "")} plan`;
  const firstName = opts.name.trim().split(" ")[0] || "there";
  const nudge = isFree
    ? "Upgrade to a paid plan for a much bigger monthly allowance — and AI route generation and training plans."
    : `Your allowance resets on the 1st of next month, or upgrade now for more headroom.`;

  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: opts.email,
    subject: `You've used ${pct}% of your ${label} this month`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00E5FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #0A0A1A;">${pct}% of your monthly allowance used</h1>
        </div>
        <div style="padding: 40px 32px;">
          <p style="margin: 0 0 16px; color: #e2e8f0; line-height: 1.6;">Hi ${firstName},</p>
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">Great going — you've used <strong style="color:#ffffff;">${usedStr}${unit} of ${opts.limit}${unit}</strong> ${label} on your ${tierLabel} this month.</p>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00E5FF;">
            <p style="margin: 0; color: #e2e8f0; font-size: 14px;">${nudge}</p>
          </div>
          <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">Open AI Run Coach → Profile → Subscription to see your usage or change plan.</p>
        </div>
      </div>
    `,
    text: `Hi ${firstName},\n\nYou've used ${usedStr}${unit} of ${opts.limit}${unit} ${label} on your ${tierLabel} this month (${pct}%).\n\n${nudge}\n\nOpen AI Run Coach → Profile → Subscription to see your usage or change plan.`,
  });

  // Internal copy — deliberately terse; this can fire for many users near month-end.
  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: notifyEmail,
    subject: `[Usage ${pct}%] ${opts.email} — ${label} (${opts.tier})`,
    text: `User ${opts.userId} (${opts.email}, ${opts.name}) reached ${pct}% of ${label} on tier "${opts.tier}" for ${opts.yearMonth}: ${usedStr}${unit} / ${opts.limit}${unit}. Resets ${opts.resetMonth}.`,
  });

  console.log(`[Email] Usage ${pct}% alert sent to ${opts.email} for ${opts.feature} (${opts.yearMonth})`);
}

/**
 * Sent once, the first time we see a user genuinely using a watch with AI Run Coach (see
 * watch-onboarding.ts). The single most common mismatch between expectation and experience is
 * a runner who assumes the watch coaches on its own, leaves the phone at home, and gets no live
 * coaching — so this spells out both ways to run, framing watch-only as a real option (full
 * post-run analysis) rather than a mistake. Same message as the in-app WatchPhoneHowItWorks card.
 */
export async function sendWatchWelcomeEmail(opts: {
  email: string;
  name: string | null;
  watchLabel: string; // "Garmin watch" | "Galaxy Watch" | "Apple Watch"
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const firstName = (opts.name || "").trim().split(" ")[0] || "there";
  const phone = opts.watchLabel === "Apple Watch" ? "iPhone" : "phone";

  const step = (n: number, text: string) => `
    <tr>
      <td style="width: 28px; vertical-align: top; padding: 6px 0;">
        <div style="width: 22px; height: 22px; border-radius: 11px; background: rgba(0,229,255,0.18); color: #00E5FF; font-size: 12px; font-weight: 700; text-align: center; line-height: 22px;">${n}</div>
      </td>
      <td style="padding: 6px 0 6px 8px; color: #e2e8f0; font-size: 14px; line-height: 1.5;">${text}</td>
    </tr>`;

  await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to: opts.email,
    subject: `Getting the most from AI Run Coach on your ${opts.watchLabel}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #00E5FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #0A0A1A;">Your watch + AI Run Coach</h1>
        </div>
        <div style="padding: 36px 32px;">
          <p style="margin: 0 0 16px; color: #e2e8f0; line-height: 1.6;">Hi ${firstName},</p>
          <p style="margin: 0 0 24px; color: #94a3b8; line-height: 1.6;">Great to see you running with AI Run Coach on your ${opts.watchLabel}. There are two ways to use it — here's how each works so you get exactly the experience you want.</p>

          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00E5FF; margin-bottom: 16px;">
            <p style="margin: 0 0 8px; color: #00E5FF; font-weight: 700;">Watch + ${phone}: live AI coaching</p>
            <table style="border-collapse: collapse;">
              ${step(1, `Prepare your session on your ${phone}`)}
              ${step(2, `<strong style="color:#ffffff;">Keep your ${phone} with you</strong> for the whole session`)}
              ${step(3, "Press Start on your watch")}
            </table>
            <p style="margin: 10px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">Your coaching is created on your ${phone} and plays through its speaker or your headphones — the watch can't coach on its own, so without your ${phone} there's no live coaching.</p>
          </div>

          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00E676;">
            <p style="margin: 0 0 8px; color: #00E676; font-weight: 700;">Watch only: full analysis afterwards</p>
            <table style="border-collapse: collapse;">
              ${step(1, `Leave your ${phone} at home and press Start on your watch`)}
              ${step(2, "Your run syncs to AI Run Coach when you're back")}
            </table>
            <p style="margin: 10px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">You still get the full post-run AI analysis — just no real-time coaching during the session.</p>
          </div>

          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">Tip: if you open AI Run Coach on your watch and see <strong style="color:#ffffff;">“Prepare on your phone”</strong>, that's your cue — prepare the session on your ${phone} for live coaching, or choose “Continue without coaching” for a watch-only session.</p>
          <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">You can find this any time in the app under Profile → Connected Devices. Happy running!</p>
        </div>
      </div>
    `,
    text:
      `Hi ${firstName},\n\n` +
      `Great to see you running with AI Run Coach on your ${opts.watchLabel}. There are two ways to use it:\n\n` +
      `WATCH + ${phone.toUpperCase()}: LIVE AI COACHING\n` +
      `1. Prepare your session on your ${phone}\n` +
      `2. Keep your ${phone} with you for the whole session\n` +
      `3. Press Start on your watch\n` +
      `Your coaching is created on your ${phone} and plays through its speaker or your headphones — the watch can't coach on its own.\n\n` +
      `WATCH ONLY: FULL ANALYSIS AFTERWARDS\n` +
      `1. Leave your ${phone} at home and press Start on your watch\n` +
      `2. Your run syncs to AI Run Coach when you're back\n` +
      `You still get the full post-run AI analysis — just no real-time coaching during the session.\n\n` +
      `Tip: if your watch shows "Prepare on your phone", prepare the session on your ${phone} for live coaching, or choose "Continue without coaching" for a watch-only session.\n\n` +
      `You can find this any time under Profile → Connected Devices. Happy running!`,
  });

  console.log(`[Email] Watch welcome email sent to ${opts.email} (${opts.watchLabel})`);
}
