import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    throw new Error("Email service not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.");
  }

  return { transporter: nodemailer.createTransporter({ host, port, secure: port === 465, auth: { user, pass } }), from };
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const { transporter, from } = createTransporter();
  const resetUrl = `https://airuncoach.live/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: `"AI Run Coach" <${from}>`,
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
