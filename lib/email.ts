// Transactional email over an HTTPS API (port 443), because the Render free
// tier blocks outbound SMTP ports. Supports Brevo or Resend — whichever key
// is set. If neither is set the sender is a no-op, so email stays optional
// and never blocks a request.
//
//   Brevo  (recommended): BREVO_API_KEY  + EMAIL_FROM   — send to anyone once
//                          the sender address is verified in Brevo.
//   Resend:               RESEND_API_KEY + EMAIL_FROM   — needs a verified
//                          domain to send to arbitrary recipients (or use
//                          onboarding@resend.dev to send only to yourself).

type Provider = "brevo" | "resend" | null;

function provider(): Provider {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY) return "resend";
  return null;
}

export function isEmailConfigured(): boolean {
  return provider() !== null;
}

const APP_URL = process.env.APP_URL || "https://defensa-7ggt.onrender.com";
const BRAND = "#2563eb";

// EMAIL_FROM is "Name <address>" or just "address".
function parseFrom(): { name: string; email: string; raw: string } {
  const raw =
    process.env.EMAIL_FROM ||
    (provider() === "resend" ? "Defensa <onboarding@resend.dev>" : "Defensa <no-reply@defensa.app>");
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1] || "Defensa", email: m[2], raw };
  return { name: "Defensa", email: raw.trim(), raw: `Defensa <${raw.trim()}>` };
}

// ---- low-level send -------------------------------------------------------

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const p = provider();
  if (!p || !opts.to) {
    console.log("[email] no provider configured - skipping send");
    return false;
  }
  const from = parseFrom();

  try {
    if (p === "brevo") {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY as string,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: from.name, email: from.email },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
        }),
      });
      if (resp.ok) {
        console.log("[email] Brevo send ok ->", opts.to);
        return true;
      }
      console.warn("[email] Brevo send failed", resp.status, await resp.text().catch(() => ""));
      return false;
    }

    // resend
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from.raw,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (resp.ok) {
      console.log("[email] Resend send ok ->", opts.to);
      return true;
    }
    console.warn("[email] Resend send failed", resp.status, await resp.text().catch(() => ""));
    return false;
  } catch (e: any) {
    console.warn("[email] send error:", e?.message ?? e);
    return false;
  }
}

// Diagnostic: is a provider configured and does the API key work? Runs a
// lightweight authenticated GET — no email sent. Never returns the key.
export async function checkEmailConnection(): Promise<{
  configured: boolean;
  provider: string | null;
  from: string | null;
  ok: boolean;
  error?: string;
}> {
  const p = provider();
  const base = {
    configured: p !== null,
    provider: p,
    from: p ? parseFrom().raw : null,
  };
  if (!p) return { ...base, ok: false, error: "No BREVO_API_KEY or RESEND_API_KEY set" };
  try {
    const resp =
      p === "brevo"
        ? await fetch("https://api.brevo.com/v3/account", {
            headers: { "api-key": process.env.BREVO_API_KEY as string, accept: "application/json" },
          })
        : await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY}` },
          });
    if (resp.ok) return { ...base, ok: true };
    return { ...base, ok: false, error: `${p} API returned ${resp.status}: ${await resp.text().catch(() => "")}`.slice(0, 300) };
  } catch (e: any) {
    return { ...base, ok: false, error: e?.message ?? String(e) };
  }
}

// ---- branded shell ------------------------------------------------------

function shell(opts: {
  heading: string;
  body: string;
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

// ---- public senders (signatures unchanged) -----------------------------

export async function sendVerificationEmail(opts: {
  to: string;
  fullName?: string;
  link: string;
}): Promise<boolean> {
  if (!opts.to || !opts.link) return false;
  return sendEmail({
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
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  fullName?: string;
  link: string;
}): Promise<boolean> {
  if (!opts.to || !opts.link) return false;
  return sendEmail({
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
}

export async function sendGoogleWelcomeEmail(opts: {
  to: string;
  fullName: string;
}): Promise<void> {
  if (!opts.to) return;
  await sendEmail({
    to: opts.to,
    subject: "Welcome to Defensa",
    html: shell({
      heading: "Welcome to Defensa",
      body: `Hello <strong>${opts.fullName || "there"}</strong>, your account is ready. Upload your capstone manuscript and start practising for your oral defense.`,
      buttonLabel: "Open Defensa",
      buttonHref: APP_URL,
      footnote: "If you did not sign in to Defensa, you can ignore this email.",
    }),
  });
}
