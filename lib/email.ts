import nodemailer from "nodemailer";

// Best-effort transactional email. If SMTP_USER / SMTP_PASS are not set the
// sender is a no-op, so email is optional and never blocks a request.

let cached: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (cached) return cached;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

const FROM = process.env.EMAIL_FROM ?? "Defensa <no-reply@defensa.app>";
const APP_URL = process.env.APP_URL ?? "";

export async function sendGoogleWelcomeEmail(opts: {
  to: string;
  fullName: string;
}): Promise<void> {
  const t = getTransporter();
  if (!t || !opts.to) {
    console.log("[email] SMTP not configured or no address - skipping welcome email");
    return;
  }
  try {
    await t.sendMail({
      from: FROM,
      to: opts.to,
      subject: "Welcome to Defensa",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <div style="background:#1e293b;padding:24px 32px">
            <h2 style="color:#fff;margin:0;font-size:20px">Welcome to Defensa</h2>
          </div>
          <div style="padding:32px;background:#f8fafc">
            <p style="color:#1e293b;font-size:16px">Hello <strong>${opts.fullName || "there"}</strong>,</p>
            <p style="color:#475569">Your Defensa account was created using your Google sign in. You can now upload your capstone manuscript and start practising for your oral defense.</p>
            ${
              APP_URL
                ? `<div style="margin-top:24px;text-align:center">
                     <a href="${APP_URL}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Open Defensa</a>
                   </div>`
                : ""
            }
            <p style="color:#94a3b8;font-size:12px;margin-top:32px">If you did not sign in to Defensa, you can ignore this email.</p>
          </div>
        </div>`,
    });
    console.log("[email] Google welcome email sent to", opts.to);
  } catch (e: any) {
    console.warn("[email] Failed to send welcome email:", e?.message ?? e);
  }
}
