import nodemailer from "nodemailer";

// Best-effort transactional email. If SMTP_USER / SMTP_PASS are not set the
// sender is a no-op, so email is optional and never blocks a request.

let cached: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (cached) return cached;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Fail fast instead of hanging when the host blocks outbound SMTP.
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  return cached;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Diagnostic: does the configured SMTP account actually accept our login?
// Runs an SMTP handshake + auth check WITHOUT sending anything. Never returns
// the password — only booleans and the provider's error text.
export async function checkEmailConnection(): Promise<{
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  ok: boolean;
  error?: string;
}> {
  const base = {
    configured: isEmailConfigured(),
    host: process.env.SMTP_HOST ?? (isEmailConfigured() ? "smtp.gmail.com" : null),
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : isEmailConfigured() ? 587 : null,
    user: process.env.SMTP_USER ?? null,
  };
  const t = getTransporter();
  if (!t) return { ...base, ok: false, error: "SMTP_USER / SMTP_PASS not set" };
  try {
    await Promise.race([
      t.verify(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout — the host is likely blocking outbound SMTP on this port")), 15_000),
      ),
    ]);
    return { ...base, ok: true };
  } catch (e: any) {
    return { ...base, ok: false, error: e?.message ?? String(e) };
  }
}

const FROM = process.env.EMAIL_FROM ?? `Defensa <${process.env.SMTP_USER ?? "no-reply@defensa.app"}>`;
const APP_URL = process.env.APP_URL ?? "";
const BRAND = "#2563eb";

// Shared responsive shell so every Defensa email looks the same.
function shell(opts: {
  heading: string;
  body: string; // inner HTML for the message paragraphs
  buttonLabel: string;
  buttonHref: string;
  footnote?: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
          <tr>
            <td style="background:${BRAND};padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="width:40px;height:40px;background:rgba(255,255,255,0.18);border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;">&#128737;</td>
                <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.5px;">DEFENSA</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">${opts.heading}</h1>
              <div style="font-size:15px;line-height:1.6;color:#475569;">${opts.body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 36px;">
              <a href="${opts.buttonHref}" style="display:inline-block;background:${BRAND};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">${opts.buttonLabel}</a>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">
                If the button doesn't work, copy and paste this link:<br>
                <span style="color:#64748b;word-break:break-all;">${opts.buttonHref}</span>
              </p>
              ${opts.footnote ? `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">${opts.footnote}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
              Defensa &mdash; AI Viva Simulator &amp; Readiness Platform
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(opts: {
  to: string;
  fullName?: string;
  link: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t || !opts.to || !opts.link) {
    console.log("[email] SMTP not configured or missing data - skipping verification email");
    return false;
  }
  try {
    await t.sendMail({
      from: FROM,
      to: opts.to,
      subject: "Verify Your Email",
      html: shell({
        heading: "Verify Your Email",
        body: `Welcome${opts.fullName ? `, <strong>${opts.fullName}</strong>` : ""}! Click the button below to verify your account.`,
        buttonLabel: "Verify Account",
        buttonHref: opts.link,
        footnote: "If you did not create a Defensa account, you can safely ignore this email.",
      }),
    });
    console.log("[email] Verification email sent to", opts.to);
    return true;
  } catch (e: any) {
    console.warn("[email] Failed to send verification email:", e?.message ?? e);
    return false;
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  fullName?: string;
  link: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t || !opts.to || !opts.link) {
    console.log("[email] SMTP not configured or missing data - skipping password reset email");
    return false;
  }
  try {
    await t.sendMail({
      from: FROM,
      to: opts.to,
      subject: "Reset your Defensa password",
      html: shell({
        heading: "Reset your password",
        body: `We received a request to reset the password for your Defensa account${opts.fullName ? `, <strong>${opts.fullName}</strong>` : ""}. Click the button below to choose a new one. This link expires in one hour.`,
        buttonLabel: "Reset password",
        buttonHref: opts.link,
        footnote: "If you did not request this, ignore this email and your password stays the same.",
      }),
    });
    console.log("[email] Password reset email sent to", opts.to);
    return true;
  } catch (e: any) {
    console.warn("[email] Failed to send password reset email:", e?.message ?? e);
    return false;
  }
}

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
      html: shell({
        heading: "Welcome to Defensa",
        body: `Hello <strong>${opts.fullName || "there"}</strong>, your account is ready. Upload your capstone manuscript and start practising for your oral defense.`,
        buttonLabel: "Open Defensa",
        buttonHref: APP_URL || "https://defensa-7ggt.onrender.com",
        footnote: "If you did not sign in to Defensa, you can ignore this email.",
      }),
    });
    console.log("[email] Google welcome email sent to", opts.to);
  } catch (e: any) {
    console.warn("[email] Failed to send welcome email:", e?.message ?? e);
  }
}
