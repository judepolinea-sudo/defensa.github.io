import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { supabase, rowToProfile, profileToRow, logAudit } from "./lib/supabaseAdmin.ts";
import { sendGoogleWelcomeEmail, sendVerificationEmail, isEmailConfigured } from "./lib/email.ts";
import {
  saveActiveSession,
  getActiveSession,
  clearActiveSession,
} from "./services/sessionRecoveryService.ts";
import { PANELISTS, DOMAIN_PANELISTS } from "./constants.tsx";

dotenv.config();

// ===============================================================
// PDF TEXT EXTRACTION (pdfjs)
// ===============================================================

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    parts.push(pageText);
  }
  return parts.join("\n");
}

// ===============================================================
// DETERMINISTIC SYSTEM INITIALIZATION
// ===============================================================

let systemStatus: "READY" | "CONFIGURATION_REQUIRED" | "INVALID_CONFIG" =
  "CONFIGURATION_REQUIRED";
let configErrorMessage: string | null = null;

function checkSystemIntegrity() {
  const required = [
    "FIREBASE_SERVICE_ACCOUNT",
    "INITIAL_ADMIN_EMAIL",
    "ADMIN_SETUP_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const missing = required.filter(
    (key) => !process.env[key] || process.env[key]?.trim() === "",
  );
  if (missing.length > 0) {
    systemStatus = "CONFIGURATION_REQUIRED";
    configErrorMessage = `Missing required variables: ${missing.join(", ")}`;
    return false;
  }

  try {
    const sanitized = process.env
      .FIREBASE_SERVICE_ACCOUNT!.trim()
      .replace(/^['"]|['"]$/g, "");
    JSON.parse(sanitized);
  } catch {
    systemStatus = "INVALID_CONFIG";
    configErrorMessage =
      "FIREBASE_SERVICE_ACCOUNT is not a valid JSON string.";
    return false;
  }

  systemStatus = "READY";
  return true;
}

const integrityOk = checkSystemIntegrity();

let auth: admin.auth.Auth;

if (integrityOk) {
  const serviceAccountRaw = process.env
    .FIREBASE_SERVICE_ACCOUNT!.trim()
    .replace(/^['"]|['"]$/g, "");
  const serviceAccount = JSON.parse(serviceAccountRaw);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`,
    });
  }

  auth = admin.auth();
}

// ===============================================================
// RBAC CONSTANTS
// ===============================================================

const VALID_ROLES = ["STUDENT", "ADMIN"] as const;
type AppRole = (typeof VALID_ROLES)[number];
// Department / program is free text — a project (uploaded paper) can come from
// any program, not just BSIT/BSCpE. Kept only as a soft length guard.
const MAX_DEPARTMENT_LEN = 120;

function isValidRole(role: string): role is AppRole {
  return (VALID_ROLES as readonly string[]).includes(role);
}

// ===============================================================
// SIGN-UP EMAIL DOMAIN ALLOW-LIST
// Only these domains may self-register (email/password) or self-provision
// via Google sign-in. Admin-created accounts (/api/users/create) and the
// bootstrap admin are exempt.
// ===============================================================

// Optional allow-list of sign-up email domains. Empty = any real email is
// accepted (email verification proves the address is real). To lock sign-up
// back down to one institution, put its domain here, e.g. ["nu-clark.edu.ph"].
const ALLOWED_SIGNUP_DOMAINS: string[] = [];

function isValidEmailFormat(email: string | undefined | null): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isAllowedSignupEmail(email: string | undefined | null): boolean {
  if (!isValidEmailFormat(email)) return false;
  if (ALLOWED_SIGNUP_DOMAINS.length === 0) return true;
  const domain = String(email).slice(String(email).lastIndexOf("@") + 1).toLowerCase().trim();
  return ALLOWED_SIGNUP_DOMAINS.includes(domain);
}

const SIGNUP_DOMAIN_MESSAGE =
  ALLOWED_SIGNUP_DOMAINS.length > 0
    ? `Sign-up is limited to: ${ALLOWED_SIGNUP_DOMAINS.map((d) => "@" + d).join(", ")}`
    : "Please enter a valid email address.";

// ===============================================================
// REGISTRATION REQUEST PASSWORD ENCRYPTION
// A self-registration is held in registration_requests until an admin
// approves it. The password is stored encrypted (AES-256-GCM) so the real
// Firebase account can be created on approval without keeping it in the
// clear. The key is derived from ADMIN_SETUP_KEY (already a required secret).
// ===============================================================

function regEncKey(): Buffer {
  const secret = process.env.ADMIN_SETUP_KEY || "defensa-registration-fallback-key";
  return crypto.scryptSync(secret, "defensa-registration-salt", 32);
}

function encryptRegPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", regEncKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

function decryptRegPassword(enc: string): string {
  const [ivB, tagB, ctB] = enc.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", regEncKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

// ===============================================================
// AUTH MIDDLEWARE HELPER
// Verifies Firebase ID token → extracts Firebase UID →
// looks up Supabase user row → returns merged caller object.
// This is the ONLY place that trusts the Firebase JWT.
// All other identity checks use caller.profile which is
// sourced from Supabase (the backend SSOT).
// ===============================================================

async function verifyAndGetCaller(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.split("Bearer ")[1];

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    return null;
  }

  const { data: row, error } = await supabase
    .from("users")
    .select("*")
    .eq("firebase_uid", decoded.uid)
    .single();

  if (!error && row) {
    if (row.is_deleted === true) return null;
    if (row.status === "PENDING" || row.status === "REJECTED") return null;
    // Email verification is mandatory for email/password accounts (admins are
    // exempt — they are provisioned deliberately). Google identities are
    // verified by Google.
    const provider = decoded.firebase?.sign_in_provider;
    if (row.role !== "ADMIN" && provider === "password" && decoded.email_verified === false) {
      return null;
    }
    if (provider === "google.com" && decoded.email_verified === false) return null;
    return { decoded, profile: rowToProfile(row) };
  }

  // No Supabase profile yet. Two self-service paths auto-provision a STUDENT
  // row here, and BOTH require a verified email:
  //   • Google sign-in — any Google account, first login.
  //   • Email/password self sign-up — the row is created only now, on the
  //     first VERIFIED sign-in, so an unverified sign-up leaves no record in
  //     Supabase. The name/school/etc. entered at sign-up are carried on a
  //     Firebase custom claim (`pendingProfile`) until this point.
  const provider = decoded.firebase?.sign_in_provider;
  if (provider !== "google.com" && provider !== "password") return null;
  if (decoded.email_verified === false) return null;

  const pending = (decoded as any).pendingProfile ?? {};
  const { data: created, error: createErr } = await supabase
    .from("users")
    .insert(
      profileToRow({
        firebaseUid: decoded.uid,
        email: decoded.email ?? "",
        fullName: decoded.name || pending.fullName || decoded.email || "Student",
        role: "STUDENT",
        program: pending.program ?? null,
        yearLevel: pending.yearLevel ?? null,
        school: pending.school ?? null,
        isDeleted: false,
        status: "APPROVED",
        createdBy: provider === "google.com" ? "GOOGLE_AUTO_SIGNUP" : "SELF_SIGNUP",
      }),
    )
    .select()
    .single();

  if (createErr) {
    // Unique violation on firebase_uid — a concurrent request already created
    // the row (the login call and the onAuthStateChanged listener can race).
    if (createErr.code === "23505") {
      const { data: existing } = await supabase
        .from("users")
        .select("*")
        .eq("firebase_uid", decoded.uid)
        .single();
      if (existing) {
        if (existing.is_deleted === true) return null;
        return { decoded, profile: rowToProfile(existing) };
      }
    }
    console.error("Self-signup provisioning failed:", createErr.message);
    return null;
  }
  if (!created) return null;

  // Clear the stash claim now that the real row exists.
  if (provider === "password") {
    await auth.setCustomUserClaims(decoded.uid, null).catch(() => {});
  }

  await logAudit(
    decoded.uid,
    provider === "google.com" ? "GOOGLE_AUTO_SIGNUP" : "SELF_SIGNUP",
    "users",
    decoded.uid,
    { email: decoded.email },
  );

  // Fire-and-forget welcome email (no-op unless SMTP is configured).
  sendGoogleWelcomeEmail({
    to: decoded.email ?? "",
    fullName: created.full_name || decoded.email || "Student",
  }).catch(() => {});

  return { decoded, profile: rowToProfile(created) };
}

// ===============================================================
// BOOTSTRAP ADMIN
// If no users exist in Supabase and the Firebase Auth account
// for INITIAL_ADMIN_EMAIL already exists, auto-provision it.
// ===============================================================

export async function bootstrapAdmin() {
  if (systemStatus !== "READY") return;
  try {
    const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
    if (!initialAdminEmail) return;

    // The bootstrap admin should be an institution-owned mailbox, not a
    // developer's personal webmail.
    const FREE_WEBMAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|proton|protonmail|icloud|aol)\.[a-z.]+$/i;
    if (FREE_WEBMAIL.test(initialAdminEmail)) {
      console.warn(
        `⚠️  INITIAL_ADMIN_EMAIL (${initialAdminEmail}) is a personal webmail address. ` +
          `Set it to an institution-owned admin mailbox before going live.`,
      );
    }

    const { data: existingUsers } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (!existingUsers || existingUsers.length === 0) {
      console.log(
        `🛡️ No users found. Checking Firebase Auth for ${initialAdminEmail}...`,
      );
      try {
        const userRecord = await auth.getUserByEmail(initialAdminEmail);
        const { error } = await supabase.from("users").insert(
          profileToRow({
            firebaseUid: userRecord.uid,
            email: initialAdminEmail,
            fullName: userRecord.displayName || "System Administrator",
            role: "ADMIN",
            isDeleted: false,
            createdBy: "SYSTEM_BOOTSTRAP",
          }),
        );
        if (error) throw new Error(error.message);
        console.log(`✅ Bootstrap Admin provisioned: ${initialAdminEmail}`);
        await logAudit(userRecord.uid, "BOOTSTRAP_ADMIN", "users", userRecord.uid);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          console.log(
            `ℹ️ Admin ${initialAdminEmail} not in Firebase Auth yet — use /api/admin/setup.`,
          );
        } else {
          throw err;
        }
      }
    }
  } catch (error: any) {
    console.warn("⚠️ Bootstrap check failed:", error.message);
  }
}

// ===============================================================
// HELPER: group row → API shape (includes studentIds array)
// ===============================================================

async function groupRowToApi(groupRow: Record<string, any>): Promise<Record<string, any>> {
  const { data: members } = await supabase
    .from("group_members")
    .select("student_firebase_uid")
    .eq("group_id", groupRow.id);

  return {
    id: groupRow.id,
    name: groupRow.name,
    adviserId: groupRow.adviser_firebase_uid,
    adviserName: groupRow.adviser_name ?? null,
    department: groupRow.department ?? null,
    studentIds: members?.map((m) => m.student_firebase_uid) ?? [],
    createdBy: groupRow.created_by ?? null,
    createdAt: groupRow.created_at,
    updatedAt: groupRow.updated_at,
  };
}

// ===============================================================
// HELPER: lookup Supabase user by Firebase UID
// ===============================================================

async function getSupabaseUserByFirebaseUid(
  firebaseUid: string,
): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("firebase_uid", firebaseUid)
    .single();
  return data ?? null;
}

// ===============================================================
// SERVER
// ===============================================================

export async function createApp() {
  const app = express();

  // ===============================================================
  // SECURITY HEADERS
  // Baseline hardening for securityheaders.com. Applied to every response
  // (static files, the SPA shell, and the API) before any other middleware.
  // ===============================================================
  const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // No inline scripts in the build. 'unsafe-eval' is required only by the
    // Tailwind Play CDN (cdn.tailwindcss.com); removing that CDN in favour of
    // a build-time Tailwind step would let this drop too.
    "script-src 'self' 'unsafe-eval' https://cdn.tailwindcss.com https://apis.google.com https://www.gstatic.com",
    // 'unsafe-inline' for styles: Tailwind, Framer Motion and Recharts all
    // inject inline <style>/style attributes at runtime.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  app.use((req, res, next) => {
    const proto = (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim();
    if (req.secure || proto === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), " +
        "magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
    );
    res.setHeader("Content-Security-Policy", CSP);
    next();
  });

  app.use(cors());
  app.use(express.json({ limit: "20mb" }));

  // GATEKEEPER MIDDLEWARE
  app.use((req, res, next) => {
    if (systemStatus === "READY") return next();

    if (req.path === "/api/health") {
      return res.status(200).json({
        status: "configuration_required",
        message: configErrorMessage,
      });
    }

    if (req.path === "/" || req.path === "/index.html") {
      return res.status(200).send(`<!DOCTYPE html><html>
        <head><title>Defensa | System Setup Required</title>
        <style>body{background:#E4E3E0;color:#141414;font-family:'Helvetica Neue',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.container{background:white;border:1px solid #141414;padding:4rem;max-width:800px;box-shadow:20px 20px 0 #141414}h1{font-family:'Georgia',serif;font-style:italic;border-bottom:2px solid #141414;padding-bottom:1rem}.error-box{background:#ff4444;color:white;padding:1rem;margin-bottom:2rem;font-family:monospace}.code{background:#f0f0f0;padding:1rem;border:1px dashed #141414;font-family:monospace;overflow-x:auto;font-size:13px}</style>
        </head><body><div class="container">
        <h1>Defensa System Configuration Required</h1>
        <div class="error-box"><strong>DETECTION:</strong> ${configErrorMessage}</div>
        <p>Set all required environment variables and restart the server.</p>
        <div class="code">FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}<br>INITIAL_ADMIN_EMAIL=admin@school.edu.ph<br>ADMIN_SETUP_KEY=secret<br>NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co<br>SUPABASE_SERVICE_ROLE_KEY=eyJ...<br>OPENROUTER_API_KEY=sk-or-v1-...<br>GEMINI_API_KEY=AIza...</div>
        </div></body></html>`);
    }

    return res.status(503).json({
      error: "CONFIGURATION_REQUIRED",
      message: configErrorMessage,
    });
  });

  // ===============================================================
  // HEALTH CHECK
  // ===============================================================

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", db: "supabase", auth: "firebase" });
  });

  // ===============================================================
  // ADMIN SETUP (one-time)
  // Creates the first ADMIN account; blocked once any user exists.
  // ===============================================================

  app.post("/api/admin/setup", async (req, res) => {
    try {
      const { setupKey, email, password, fullName } = req.body;
      if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
        return res.status(401).json({ message: "Invalid or missing setup key" });
      }

      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .limit(1);
      if (existing && existing.length > 0) {
        return res.status(403).json({ message: "System already initialized" });
      }

      const userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: true,
      });

      const { error } = await supabase.from("users").insert(
        profileToRow({
          firebaseUid: userRecord.uid,
          email,
          fullName,
          role: "ADMIN",
          isDeleted: false,
          createdBy: "MANUAL_SETUP",
        }),
      );
      if (error) throw new Error(error.message);

      await logAudit(userRecord.uid, "ADMIN_SETUP", "users", userRecord.uid);
      res.status(201).json({ message: "System Admin created", uid: userRecord.uid });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===============================================================
  // AUTH: VERIFY IDENTITY
  // ===============================================================

  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });

      let decoded: admin.auth.DecodedIdToken;
      try {
        decoded = await auth.verifyIdToken(authHeader.split("Bearer ")[1]);
      } catch {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Does its own lookup (rather than verifyAndGetCaller) so it can tell
      // a pending self-registration apart from a truly unknown account and
      // surface a message the login screen can react to specifically.
      const { data: row } = await supabase
        .from("users")
        .select("*")
        .eq("firebase_uid", decoded.uid)
        .single();

      if (!row) {
        // No Supabase profile yet.
        //  • Google, or a self-signed-up email/password account whose email is
        //    now verified → verifyAndGetCaller provisions the real STUDENT row.
        //  • A self-signed-up account that hasn't verified yet → tell the login
        //    screen so it can show the "verify your email" message + resend.
        const provider = decoded.firebase?.sign_in_provider;
        if (provider === "google.com" || (provider === "password" && decoded.email_verified === true)) {
          const caller = await verifyAndGetCaller(authHeader);
          if (caller) return res.json({ user: caller.profile });
        }
        if (provider === "password" && decoded.email_verified === false) {
          return res.status(403).json({
            message:
              "Please verify your email address first. We sent a verification link to your inbox — open it, then sign in again.",
            code: "EMAIL_NOT_VERIFIED",
          });
        }
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (row.is_deleted === true) {
        return res.status(403).json({
          message: "This account has been deactivated. Please contact your administrator.",
          code: "ACCOUNT_DEACTIVATED",
        });
      }
      if (row.status === "PENDING") {
        return res.status(403).json({
          message: "Your account is awaiting admin approval.",
          code: "PENDING_APPROVAL",
        });
      }
      if (row.status === "REJECTED") {
        return res.status(403).json({
          message: "Your registration was not approved. Contact your administrator.",
          code: "REGISTRATION_REJECTED",
        });
      }

      const provider = decoded.firebase?.sign_in_provider;
      if (
        row.role !== "ADMIN" &&
        ((provider === "password" && decoded.email_verified === false) ||
          (provider === "google.com" && decoded.email_verified === false))
      ) {
        return res.status(403).json({
          message:
            "Please verify your email address first. We sent a verification link to your inbox — open it, then sign in again.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }

      res.json({ user: rowToProfile(row) });
    } catch (error: any) {
      res.status(401).json({ message: error.message || "Invalid identity token" });
    }
  });

  // ===============================================================
  // AUTH: UPDATE OWN PROFILE
  // A signed-in user can change their own program, year level, and photo.
  // ===============================================================

  app.patch("/api/users/me", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const { fullName, program, yearLevel, school, phone, avatar } = req.body ?? {};
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };

      let newDisplayName: string | null = null;
      if (fullName !== undefined) {
        if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 120) {
          return res.status(400).json({ message: "Name is required and must be under 120 characters." });
        }
        updates.full_name = fullName.trim();
        newDisplayName = fullName.trim();
      }
      if (program !== undefined) {
        if (program !== null && (typeof program !== "string" || program.length > MAX_DEPARTMENT_LEN)) {
          return res.status(400).json({ message: "Program name is invalid or too long." });
        }
        updates.program = typeof program === "string" && program.trim() ? program.trim() : null;
      }
      if (yearLevel !== undefined) {
        if (yearLevel !== null && (typeof yearLevel !== "string" || yearLevel.length > 40)) {
          return res.status(400).json({ message: "Year level is invalid." });
        }
        updates.year_level = typeof yearLevel === "string" && yearLevel.trim() ? yearLevel.trim() : null;
      }
      if (school !== undefined) {
        if (school !== null && (typeof school !== "string" || school.length > 120)) {
          return res.status(400).json({ message: "School is invalid or too long." });
        }
        updates.school = typeof school === "string" && school.trim() ? school.trim() : null;
      }
      if (phone !== undefined) {
        const p = String(phone ?? "").replace(/\D/g, "");
        if (p && !/^9\d{9}$/.test(p)) {
          return res.status(400).json({ message: "Enter a valid mobile number (10 digits, starting with 9)." });
        }
        updates.phone = p || null;
      }
      if (avatar !== undefined) {
        if (
          avatar !== null &&
          (typeof avatar !== "string" || !avatar.startsWith("data:image/") || avatar.length > 400_000)
        ) {
          return res.status(400).json({ message: "The image is invalid or too large." });
        }
        updates.avatar = avatar;
      }

      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("firebase_uid", caller.decoded.uid)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Keep the Firebase Auth display name in sync (best effort).
      if (newDisplayName) {
        await auth.updateUser(caller.decoded.uid, { displayName: newDisplayName }).catch((e) => {
          console.warn("Could not sync Firebase displayName:", e?.message);
        });
      }

      await logAudit(caller.decoded.uid, "PROFILE_UPDATE", "users", caller.decoded.uid, {
        fields: Object.keys(updates).filter((k) => k !== "updated_at"),
      });

      res.json({ user: rowToProfile(data) });
    } catch (error: any) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // ===============================================================
  // PUBLIC SELF-REGISTRATION
  // Unauthenticated. Self-service — no admin approval.
  //
  // Creates ONLY a Firebase Auth user (unverified). NOTHING is written to
  // Supabase yet — the `users` row is created lazily by verifyAndGetCaller on
  // the first VERIFIED sign-in. The profile fields entered here (name, school,
  // program, year) are stashed on a Firebase custom claim until then, so an
  // account that is never verified leaves no record in Supabase.
  // ===============================================================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, fullName, program, yearLevel, school } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({
          message: "Missing required fields: email, password, fullName",
        });
      }
      const normEmail = String(email).trim().toLowerCase();
      if (!isAllowedSignupEmail(normEmail)) {
        return res.status(400).json({ message: SIGNUP_DOMAIN_MESSAGE });
      }
      if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      }
      if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 120) {
        return res.status(400).json({ message: "Please provide your full name." });
      }

      // Existing verified member?
      const { data: existingUser } = await supabase
        .from("users").select("id").eq("email", normEmail).maybeSingle();
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
      }

      // A Firebase user may already exist from an earlier, unverified sign-up.
      let existingRecord: admin.auth.UserRecord | null = null;
      try {
        existingRecord = await auth.getUserByEmail(normEmail);
      } catch (e: any) {
        if (e.code !== "auth/user-not-found") throw e;
      }
      if (existingRecord?.emailVerified) {
        return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
      }

      const pendingProfile = {
        fullName: fullName.trim(),
        school: school || null,
        program: program || null,
        yearLevel: yearLevel || null,
      };

      let uid: string;
      if (existingRecord) {
        // Re-registration before verifying — refresh the password + stash.
        uid = existingRecord.uid;
        await auth.updateUser(uid, { password, displayName: fullName.trim() });
        await auth.setCustomUserClaims(uid, { pendingProfile }).catch(() => {});
      } else {
        try {
          const userRecord = await auth.createUser({
            email: normEmail,
            password,
            displayName: fullName.trim(),
            emailVerified: false,
          });
          uid = userRecord.uid;
        } catch (createErr: any) {
          if (createErr.code === "auth/email-already-exists") {
            return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
          }
          throw createErr;
        }
        await auth.setCustomUserClaims(uid, { pendingProfile }).catch(() => {});
      }

      await logAudit(uid, "SELF_SIGNUP_PENDING", "users", uid, { email: normEmail });

      // Send the branded verification email ourselves (needs SMTP). If SMTP
      // isn't configured, the client falls back to Firebase's own (plain)
      // verification email via sendEmailVerification.
      let emailSent = false;
      try {
        // No actionCodeSettings — the link uses Firebase's default handler,
        // which needs no extra authorized-domain setup.
        const link = await auth.generateEmailVerificationLink(normEmail);
        emailSent = await sendVerificationEmail({
          to: normEmail,
          fullName: fullName.trim(),
          link,
        });
      } catch (e: any) {
        console.warn("[register] verification email failed:", e?.message ?? e);
      }

      res.status(201).json({
        message: "Account created. Check your email for the verification link, then sign in.",
        emailSent,
        emailConfigured: isEmailConfigured(),
      });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(500).json({ message: error.message || "Registration failed. Please try again." });
    }
  });

  // ===============================================================
  // FORGOT PASSWORD  (admin-approved)
  // A signed-out user submits their email + a new password. Nothing changes
  // in Firebase yet — the request is held in password_reset_requests (new
  // password encrypted at rest) until an admin approves it. The response is
  // always generic so it never reveals whether an account exists.
  // ===============================================================

  app.post("/api/auth/forgot-password", async (req, res) => {
    const GENERIC = {
      message:
        "Your password reset request has been submitted. An administrator will review it and apply the new password.",
    };
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const newPassword = String(req.body?.newPassword ?? "");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "The new password must be at least 6 characters." });
      }

      // Must be a real, active account in the system of record (Supabase).
      // Match case-insensitively — some accounts were created with the email
      // stored in its original casing (e.g. "ST6@nu-clark.edu.ph").
      const { data: rows } = await supabase
        .from("users")
        .select("firebase_uid, email, full_name, is_deleted, status")
        .ilike("email", email);
      const row = (rows ?? [])[0];

      if (!row || row.is_deleted === true || row.status === "PENDING" || row.status === "REJECTED") {
        await logAudit(null, "PASSWORD_RESET_REQUEST", "users", email, { email, matched: false });
        return res.json(GENERIC);
      }

      // Store the request under the account's actual email casing.
      const acctEmail = (row.email as string) || email;

      // One pending request per email — replace any existing one.
      await supabase.from("password_reset_requests").delete().ilike("email", acctEmail);
      const { error: insErr } = await supabase.from("password_reset_requests").insert({
        firebase_uid: row.firebase_uid,
        email: acctEmail,
        full_name: row.full_name ?? null,
        enc_password: encryptRegPassword(newPassword),
        status: "PENDING",
      });
      if (insErr) {
        // A missing table / column is a real server-side failure, not an
        // enumeration signal — surface it instead of a false "submitted".
        console.error("Forgot-password insert failed:", insErr);
        const missing =
          /relation .*password_reset_requests.* does not exist|Could not find the table/i.test(
            insErr.message || "",
          );
        return res.status(500).json({
          message: missing
            ? "Password reset is not set up yet. Ask the administrator to run migration 014."
            : "Could not submit the reset request. Please try again.",
        });
      }

      await logAudit(row.firebase_uid ?? null, "PASSWORD_RESET_REQUEST", "users", email, {
        email,
        matched: true,
      });
      return res.json(GENERIC);
    } catch (error: any) {
      console.error("Forgot-password error:", error);
      return res.status(500).json({
        message: "Could not submit the reset request. Please try again.",
      });
    }
  });

  // ---- Password reset requests (Admin only) ----

  app.get("/api/password-reset-requests", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { data, error } = await supabase
        .from("password_reset_requests")
        .select("id, email, full_name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      res.json(
        (data ?? []).map((r) => ({
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          createdAt: r.created_at,
        })),
      );
    } catch (error) {
      console.error("List password reset requests error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/password-reset-requests/:id/approve", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can approve password resets." });
      }

      const { id } = req.params;
      const { data: reqRow, error: rErr } = await supabase
        .from("password_reset_requests").select("*").eq("id", id).maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!reqRow) return res.status(404).json({ message: "Request not found or already handled." });

      let newPassword: string;
      try {
        newPassword = decryptRegPassword(reqRow.enc_password);
      } catch {
        return res.status(500).json({
          message: "Could not read the stored password. Ask the user to submit the reset again.",
        });
      }

      // Resolve the Firebase account (the stored uid, falling back to email).
      let uid = reqRow.firebase_uid as string | null;
      if (!uid) {
        try {
          uid = (await auth.getUserByEmail(reqRow.email)).uid;
        } catch {
          await supabase.from("password_reset_requests").delete().eq("id", id);
          return res.status(404).json({ message: "No Firebase account for that email. Request removed." });
        }
      }

      await auth.updateUser(uid!, { password: newPassword });

      await supabase.from("password_reset_requests").delete().eq("id", id);
      await logAudit(caller.decoded.uid, "PASSWORD_RESET_APPROVE", "users", uid!, {
        email: reqRow.email,
      });

      res.json({ message: `Password updated for ${reqRow.email}. They can now sign in with it.` });
    } catch (error: any) {
      console.error("Approve password reset error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  app.post("/api/password-reset-requests/:id/reject", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can reject password resets." });
      }

      const { id } = req.params;
      const { data: reqRow } = await supabase
        .from("password_reset_requests").select("email").eq("id", id).maybeSingle();
      if (!reqRow) return res.status(404).json({ message: "Request not found or already handled." });

      const { error } = await supabase.from("password_reset_requests").delete().eq("id", id);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "PASSWORD_RESET_REJECT", "password_reset_requests", id, {
        email: reqRow.email,
      });
      res.json({ message: `Password reset request for ${reqRow.email} was rejected and removed.` });
    } catch (error: any) {
      console.error("Reject password reset error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // RESEND EMAIL VERIFICATION
  // For a signed-out user who registered but hasn't verified yet. Always
  // returns a generic message so it can't be used to probe for accounts.
  // ===============================================================

  app.post("/api/auth/resend-verification", async (req, res) => {
    const GENERIC = {
      message:
        "If that email needs verification, a new verification link has been sent. Check your inbox and spam folder.",
    };
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      let record;
      try {
        record = await auth.getUserByEmail(email);
      } catch {
        return res.json(GENERIC);
      }
      if (record.emailVerified) return res.json(GENERIC);

      try {
        const link = await auth.generateEmailVerificationLink(email);
        await sendVerificationEmail({
          to: email,
          fullName: record.displayName ?? undefined,
          link,
        });
      } catch (e: any) {
        console.warn("[resend-verification] failed:", e?.message ?? e);
      }
      return res.json(GENERIC);
    } catch (error: any) {
      console.error("Resend verification error:", error);
      return res.json(GENERIC);
    }
  });

  // ===============================================================
  // PRESENCE (who is online)
  // The client posts { event } while the app is open. "login" stamps a fresh
  // session start; "ping" keeps the session warm; "logout" clears it.
  // ===============================================================

  app.post("/api/presence", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const event = String(req.body?.event ?? "ping");
      const now = new Date().toISOString();

      let updates: Record<string, any>;
      if (event === "logout") {
        updates = { last_seen_at: null };
      } else if (event === "login") {
        // Only treat this as a new sign-in (stamping login time) when the user
        // wasn't already active — a plain page refresh shouldn't reset it.
        const { data: cur } = await supabase
          .from("users")
          .select("last_seen_at")
          .eq("firebase_uid", caller.decoded.uid)
          .maybeSingle();
        const staleCutoff = Date.now() - 3 * 60_000;
        const wasActive =
          cur?.last_seen_at && new Date(cur.last_seen_at).getTime() > staleCutoff;
        updates = wasActive
          ? { last_seen_at: now }
          : { last_login_at: now, last_seen_at: now };
      } else {
        updates = { last_seen_at: now };
      }

      await supabase.from("users").update(updates).eq("firebase_uid", caller.decoded.uid);
      res.json({ ok: true });
    } catch (error: any) {
      // Presence is best-effort — never surface as a hard error to the client.
      res.json({ ok: false });
    }
  });

  // Admin view of currently-online users.
  app.get("/api/admin/online-users", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Admin access required." });
      }

      const windowMinutes = 3;
      const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();

      const { data, error } = await supabase
        .from("users")
        .select("firebase_uid, email, full_name, role, program, year_level, last_login_at, last_seen_at")
        .eq("is_deleted", false)
        .gte("last_seen_at", cutoff)
        .order("last_login_at", { ascending: false });

      if (error) throw new Error(error.message);

      const users = (data ?? []).map((u) => ({
        id: u.firebase_uid,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        program: u.program ?? null,
        yearLevel: u.year_level ?? null,
        loginAt: u.last_login_at,
        lastSeenAt: u.last_seen_at,
      }));

      res.json({ windowMinutes, count: users.length, users });
    } catch (error: any) {
      console.error("online-users error:", error);
      res.status(500).json({ message: error.message || "Failed to load online users." });
    }
  });

  // ===============================================================
  // USER MANAGEMENT (Admin + Coordinator)
  // ===============================================================

  app.post("/api/users/create", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: insufficient permissions" });
      }

      const { email: rawEmail, password, fullName, role, program, yearLevel, school } = req.body;
      if (!rawEmail || !password || !fullName || !role) {
        return res.status(400).json({
          message: "Missing required fields: email, password, fullName, role",
        });
      }
      const email = String(rawEmail).trim().toLowerCase();

      const normalizedRole = (role as string).toUpperCase();
      if (!isValidRole(normalizedRole)) {
        return res.status(400).json({
          message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      const userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: true,
      });

      const row = profileToRow({
        firebaseUid: userRecord.uid,
        email,
        fullName,
        role: normalizedRole,
        program: program || null,
        yearLevel: yearLevel || null,
        school: school || null,
        isDeleted: false,
        createdBy: caller.decoded.uid,
      });

      const { error } = await supabase.from("users").insert(row);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_CREATE", "users", userRecord.uid, {
        role: normalizedRole,
        createdEmail: email,
      });

      res.status(201).json({
        message: "User created successfully",
        user: rowToProfile({ ...row, id: undefined, firebase_uid: userRecord.uid }),
      });
    } catch (error: any) {
      console.error("Create user error:", error);
      res.status(500).json({ message: error.message || "Server error during user creation" });
    }
  });

  // Keep legacy route
  app.post("/api/admin/users/create", async (req, res) => {
    req.url = "/api/users/create";
    app.handle(req, res);
  });

  // List users
  app.get("/api/users", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const includeDeleted = req.query.includeDeleted === "true";
      let query = supabase.from("users").select("*");
      if (!includeDeleted) query = query.eq("is_deleted", false);

      const { data: users, error } = await query;
      if (error) throw new Error(error.message);

      res.json((users ?? []).map(rowToProfile));
    } catch (error) {
      console.error("List users error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Keep legacy route
  app.get("/api/admin/users", async (req, res) => {
    req.url =
      "/api/users" +
      (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
    app.handle(req, res);
  });

  // Soft-delete user
  app.patch("/api/users/:uid/delete", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { uid } = req.params;
      if (uid === caller.decoded.uid) {
        return res.status(400).json({ message: "You cannot delete your own account." });
      }

      const target = await getSupabaseUserByFirebaseUid(uid);
      if (!target) return res.status(404).json({ message: "User not found" });

      if (target.role === "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Cannot delete admin account." });
      }

      const { error } = await supabase
        .from("users")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_DEACTIVATE", "users", uid);
      res.json({ message: "User account deactivated successfully." });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Restore user (Admin only)
  app.patch("/api/users/:uid/restore", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({
          message: "Forbidden: Only Superadmin can restore accounts.",
        });
      }

      const { uid } = req.params;
      const target = await getSupabaseUserByFirebaseUid(uid);
      if (!target) return res.status(404).json({ message: "User not found" });

      const { error } = await supabase
        .from("users")
        .update({ is_deleted: false, updated_at: new Date().toISOString() })
        .eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_RESTORE", "users", uid);
      res.json({ message: "User account restored successfully." });
    } catch (error) {
      console.error("Restore user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Approve a pending self-registration (Admin only)
  app.patch("/api/users/:uid/approve", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can approve registrations." });
      }

      const { uid } = req.params;
      const target = await getSupabaseUserByFirebaseUid(uid);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.status !== "PENDING") {
        return res.status(400).json({ message: "This account is not pending approval." });
      }

      const { error } = await supabase
        .from("users")
        .update({ status: "APPROVED", updated_at: new Date().toISOString() })
        .eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_APPROVE", "users", uid);
      res.json({ message: "Account approved." });
    } catch (error) {
      console.error("Approve user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Reject a LEGACY pending user row (Admin only). New registrations never
  // create a users row (see /api/registration-requests below); this handles
  // any PENDING rows created by the old flow. Rejecting fully removes the
  // Firebase account and the users row so no trace is left.
  app.patch("/api/users/:uid/reject", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can reject registrations." });
      }

      const { uid } = req.params;
      const target = await getSupabaseUserByFirebaseUid(uid);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.status !== "PENDING") {
        return res.status(400).json({ message: "This account is not pending approval." });
      }

      await auth.deleteUser(uid).catch(() => {});
      const { error } = await supabase.from("users").delete().eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_REJECT", "users", uid, { email: target.email });
      res.json({ message: "Registration rejected and removed." });
    } catch (error) {
      console.error("Reject user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // REGISTRATION REQUESTS (Admin only)
  // The new self-registration flow. A request lives in registration_requests
  // with nothing in Firebase or the users table until it is approved.
  // ===============================================================

  app.get("/api/registration-requests", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { data, error } = await supabase
        .from("registration_requests")
        .select("id, email, full_name, program, year_level, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      res.json(
        (data ?? []).map((r) => ({
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          program: r.program,
          yearLevel: r.year_level,
          createdAt: r.created_at,
        })),
      );
    } catch (error) {
      console.error("List registration requests error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/registration-requests/:id/approve", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can approve registrations." });
      }

      const { id } = req.params;
      const { data: reqRow, error: rErr } = await supabase
        .from("registration_requests").select("*").eq("id", id).maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!reqRow) return res.status(404).json({ message: "Request not found or already handled." });

      let password: string;
      try {
        password = decryptRegPassword(reqRow.enc_password);
      } catch {
        return res.status(500).json({
          message: "Could not read the stored password. Ask the student to register again.",
        });
      }

      let userRecord;
      try {
        // Not email-verified yet — the student must click the verification link
        // before they can sign in (enforced in verifyAndGetCaller / /api/auth/me).
        userRecord = await auth.createUser({
          email: reqRow.email,
          password,
          displayName: reqRow.full_name,
          emailVerified: false,
        });
      } catch (createErr: any) {
        if (createErr.code === "auth/email-already-exists") {
          await supabase.from("registration_requests").delete().eq("id", id);
          return res.status(409).json({ message: "An account with this email already exists. Request removed." });
        }
        throw createErr;
      }

      const { error: insErr } = await supabase.from("users").insert(
        profileToRow({
          firebaseUid: userRecord.uid,
          email: reqRow.email,
          fullName: reqRow.full_name,
          role: "STUDENT",
          program: reqRow.program || null,
          yearLevel: reqRow.year_level || null,
          school: reqRow.school || null,
          isDeleted: false,
          status: "APPROVED",
          createdBy: caller.decoded.uid,
        }),
      );
      if (insErr) {
        await auth.deleteUser(userRecord.uid).catch(() => {});
        throw new Error(insErr.message);
      }

      await supabase.from("registration_requests").delete().eq("id", id);
      await logAudit(caller.decoded.uid, "REGISTRATION_APPROVE", "users", userRecord.uid, {
        email: reqRow.email,
      });

      // Send the email verification link (best-effort).
      try {
        const link = await auth.generateEmailVerificationLink(reqRow.email);
        await sendVerificationEmail({ to: reqRow.email, fullName: reqRow.full_name, link });
      } catch (e: any) {
        console.warn("[approve] verification email failed:", e?.message ?? e);
      }

      res.json({
        message: `${reqRow.full_name} approved. A verification email has been sent — they can sign in after verifying.`,
      });
    } catch (error: any) {
      console.error("Approve registration error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  app.post("/api/registration-requests/:id/reject", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can reject registrations." });
      }

      const { id } = req.params;
      const { data: reqRow } = await supabase
        .from("registration_requests").select("email, full_name").eq("id", id).maybeSingle();
      if (!reqRow) return res.status(404).json({ message: "Request not found or already handled." });

      const { error } = await supabase.from("registration_requests").delete().eq("id", id);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "REGISTRATION_REJECT", "registration_requests", id, {
        email: reqRow.email,
      });
      res.json({ message: `${reqRow.full_name}'s request was rejected and removed.` });
    } catch (error: any) {
      console.error("Reject registration error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Change user role (Admin only)
  app.patch("/api/users/:uid/role", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden: Only Superadmin can change roles." });
      }

      const { uid } = req.params;
      const { role } = req.body;
      const normalizedRole = (role as string)?.toUpperCase();

      if (!isValidRole(normalizedRole)) {
        return res.status(400).json({
          message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      const { error } = await supabase
        .from("users")
        .update({ role: normalizedRole, updated_at: new Date().toISOString() })
        .eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_ROLE_CHANGE", "users", uid, { newRole: normalizedRole });
      res.json({ message: "User role updated successfully." });
    } catch (error) {
      console.error("Change role error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // GROUP MANAGEMENT (Admin + Coordinator)
  // ===============================================================

  app.post("/api/groups", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN" && callerRole !== "CAPSTONE_COORDINATOR") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { name, adviserId, studentIds } = req.body;
      if (!name || !adviserId) {
        return res.status(400).json({ message: "Missing required fields: name, adviserId" });
      }

      // Validate adviser
      const adviserRow = await getSupabaseUserByFirebaseUid(adviserId);
      if (!adviserRow || adviserRow.role !== "CAPSTONE_ADVISER") {
        return res.status(400).json({
          message: "Invalid adviser: must be a Capstone Adviser account.",
        });
      }
      if (adviserRow.is_deleted) {
        return res.status(400).json({ message: "Invalid adviser: account has been deactivated." });
      }

      const resolvedStudents: string[] = Array.isArray(studentIds) ? studentIds : [];
      if (resolvedStudents.length === 0) {
        return res.status(400).json({
          message: "At least one student must be assigned to the group.",
        });
      }

      // Validate each student
      for (const sUid of resolvedStudents) {
        const sRow = await getSupabaseUserByFirebaseUid(sUid);
        if (!sRow || sRow.role !== "STUDENT") {
          return res.status(400).json({ message: `Invalid student ID: ${sUid}` });
        }
        if (sRow.is_deleted) {
          return res.status(400).json({
            message: `Student ${sRow.full_name} has a deactivated account and cannot be assigned.`,
          });
        }
        if (sRow.group_id) {
          return res.status(400).json({
            message: `Student ${sRow.full_name} is already assigned to a group.`,
          });
        }
      }

      const now = new Date().toISOString();

      // Insert group
      const { data: newGroup, error: groupErr } = await supabase
        .from("groups")
        .insert({
          name,
          adviser_firebase_uid: adviserId,
          adviser_name: adviserRow.full_name,
          created_by: caller.decoded.uid,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (groupErr || !newGroup) throw new Error(groupErr?.message ?? "Group insert failed");

      // Insert group_members
      const memberRows = resolvedStudents.map((sUid) => ({
        group_id: newGroup.id,
        student_firebase_uid: sUid,
      }));
      const { error: membersErr } = await supabase.from("group_members").insert(memberRows);
      if (membersErr) throw new Error(membersErr.message);

      // Update each student's group_id and adviser_firebase_uid
      const { error: studentsErr } = await supabase
        .from("users")
        .update({
          group_id: newGroup.id,
          adviser_firebase_uid: adviserId,
          updated_at: now,
        })
        .in("firebase_uid", resolvedStudents);
      if (studentsErr) throw new Error(studentsErr.message);

      await logAudit(caller.decoded.uid, "GROUP_CREATE", "groups", newGroup.id, {
        name,
        adviserId,
        studentCount: resolvedStudents.length,
      });

      const groupApi = await groupRowToApi(newGroup);
      res.status(201).json({ message: "Group created successfully", group: groupApi });
    } catch (error: any) {
      console.error("Create group error:", error);
      res.status(error.status ?? 500).json({ message: error.message || "Server error" });
    }
  });

  // List groups
  app.get("/api/groups", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      const validRoles: AppRole[] = ["ADMIN", "CAPSTONE_COORDINATOR", "CAPSTONE_ADVISER"];
      if (!validRoles.includes(callerRole)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      let query = supabase.from("groups").select("*");
      if (callerRole === "CAPSTONE_ADVISER") {
        query = query.eq("adviser_firebase_uid", caller.decoded.uid);
      }

      const { data: groups, error } = await query;
      if (error) throw new Error(error.message);

      const result = await Promise.all((groups ?? []).map(groupRowToApi));
      res.json(result);
    } catch (error) {
      console.error("List groups error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update group
  app.put("/api/groups/:id", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN" && callerRole !== "CAPSTONE_COORDINATOR") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const { data: groupRow, error: gErr } = await supabase
        .from("groups")
        .select("*")
        .eq("id", id)
        .single();
      if (gErr || !groupRow) return res.status(404).json({ message: "Group not found" });

      const { name, adviserId, studentIds } = req.body;
      const now = new Date().toISOString();

      // Fetch current members
      const { data: currentMembers } = await supabase
        .from("group_members")
        .select("student_firebase_uid")
        .eq("group_id", id);
      const prevStudentFuids: string[] = (currentMembers ?? []).map(
        (m) => m.student_firebase_uid,
      );
      const newStudentFuids: string[] =
        studentIds !== undefined ? (Array.isArray(studentIds) ? studentIds : prevStudentFuids) : prevStudentFuids;

      if (studentIds !== undefined && newStudentFuids.length === 0) {
        return res.status(400).json({ message: "At least one student must remain in the group." });
      }

      // Validate new students
      for (const sUid of newStudentFuids) {
        if (prevStudentFuids.includes(sUid)) continue;
        const sRow = await getSupabaseUserByFirebaseUid(sUid);
        if (!sRow || sRow.role !== "STUDENT") {
          return res.status(400).json({ message: `Student not found: ${sUid}` });
        }
        if (sRow.is_deleted) {
          return res.status(400).json({
            message: `Student ${sRow.full_name} has a deactivated account and cannot be assigned.`,
          });
        }
        if (sRow.group_id && sRow.group_id !== id) {
          return res.status(400).json({
            message: `Student ${sRow.full_name} is already in another group.`,
          });
        }
      }

      // Build group updates
      const updates: Record<string, any> = { updated_at: now };
      if (name) updates.name = name;
      if (adviserId) {
        const adviserRow = await getSupabaseUserByFirebaseUid(adviserId);
        if (!adviserRow || adviserRow.role !== "CAPSTONE_ADVISER") {
          return res.status(400).json({ message: "Invalid adviser." });
        }
        if (adviserRow.is_deleted) {
          return res.status(400).json({ message: "Selected adviser account has been deactivated." });
        }
        updates.adviser_firebase_uid = adviserId;
        updates.adviser_name = adviserRow.full_name;
      }

      await supabase.from("groups").update(updates).eq("id", id);

      // Sync group_members
      const removed = prevStudentFuids.filter((s) => !newStudentFuids.includes(s));
      const added = newStudentFuids.filter((s) => !prevStudentFuids.includes(s));

      if (removed.length > 0) {
        await supabase.from("group_members").delete()
          .eq("group_id", id)
          .in("student_firebase_uid", removed);
        await supabase.from("users")
          .update({ group_id: null, adviser_firebase_uid: null, updated_at: now })
          .in("firebase_uid", removed);
      }

      if (added.length > 0) {
        const memberRows = added.map((sUid) => ({ group_id: id, student_firebase_uid: sUid }));
        await supabase.from("group_members").insert(memberRows);
        await supabase.from("users")
          .update({
            group_id: id,
            adviser_firebase_uid: adviserId ?? groupRow.adviser_firebase_uid,
            updated_at: now,
          })
          .in("firebase_uid", added);
      }

      await logAudit(caller.decoded.uid, "GROUP_UPDATE", "groups", id);
      res.json({ message: "Group updated successfully" });
    } catch (error) {
      console.error("Update group error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Delete group
  app.delete("/api/groups/:id", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const callerRole: AppRole = caller.profile.role as AppRole;
      if (callerRole !== "ADMIN" && callerRole !== "CAPSTONE_COORDINATOR") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const { data: groupRow } = await supabase
        .from("groups")
        .select("id")
        .eq("id", id)
        .single();
      if (!groupRow) return res.status(404).json({ message: "Group not found" });

      // Fetch members before deleting (ON DELETE CASCADE handles group_members)
      const { data: members } = await supabase
        .from("group_members")
        .select("student_firebase_uid")
        .eq("group_id", id);
      const studentFuids = (members ?? []).map((m) => m.student_firebase_uid);

      // Clear group reference on students
      if (studentFuids.length > 0) {
        await supabase.from("users")
          .update({ group_id: null, adviser_firebase_uid: null, updated_at: new Date().toISOString() })
          .in("firebase_uid", studentFuids);
      }

      // Delete group (group_members cascade)
      await supabase.from("groups").delete().eq("id", id);

      await logAudit(caller.decoded.uid, "GROUP_DELETE", "groups", id);
      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      console.error("Delete group error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // PROJECTS (one per group)
  // ===============================================================

  // If the projects table still carries the old BSIT/BSCpE department CHECK
  // (i.e. migration 009 hasn't been applied to this database yet), a project
  // from any other program is rejected with Postgres error 23514. Department
  // is cosmetic — not used for question generation — so in that case we just
  // save it with a null department instead of failing the whole upload.
  function isDepartmentConstraintError(err: any): boolean {
    if (!err) return false;
    const blob = `${err.code ?? ""} ${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
    return blob.includes("department") && (err.code === "23514" || blob.includes("check constraint"));
  }

  app.get("/api/projects/my", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const role: AppRole = caller.profile.role as AppRole;

      if (role === "STUDENT") {
        const groupId: string | null = caller.profile.groupId;
        const projectQuery = supabase.from("projects").select("*");
        const { data: project } = groupId
          ? await projectQuery.eq("group_id", groupId).single()
          : await projectQuery.eq("created_by", caller.decoded.uid).is("group_id", null).single();
        if (!project) return res.status(404).json({ message: "No project found." });
        return res.json(projectRowToApi(project));
      }

      if (role === "CAPSTONE_ADVISER") {
        const { data: groups } = await supabase
          .from("groups")
          .select("id, name")
          .eq("adviser_firebase_uid", caller.decoded.uid);
        if (!groups || groups.length === 0) {
          return res.status(404).json({ message: "No groups assigned to you." });
        }
        const groupIds = groups.map((g) => g.id);
        const { data: projects } = await supabase
          .from("projects")
          .select("*")
          .in("group_id", groupIds);

        const groupNameMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));
        return res.json(
          (projects ?? []).map((p) => ({
            ...projectRowToApi(p),
            groupName: groupNameMap[p.group_id] ?? "—",
          })),
        );
      }

      if (role === "CAPSTONE_COORDINATOR" || role === "ADMIN") {
        const { data: groups } = await supabase.from("groups").select("id, name");
        const groupNameMap = Object.fromEntries(
          (groups ?? []).map((g) => [g.id, g.name]),
        );
        const { data: projects } = await supabase.from("projects").select("*");
        return res.json(
          (projects ?? []).map((p) => ({
            ...projectRowToApi(p),
            groupName: groupNameMap[p.group_id] ?? "—",
          })),
        );
      }

      return res.status(403).json({ message: "Forbidden" });
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      if (caller.profile.role !== "STUDENT") {
        return res.status(403).json({ message: "Only students can create projects." });
      }

      const groupId: string | null = caller.profile.groupId ?? null;

      const existingQuery = supabase.from("projects").select("id");
      const { data: existing } = groupId
        ? await existingQuery.eq("group_id", groupId).single()
        : await existingQuery.eq("created_by", caller.decoded.uid).is("group_id", null).single();
      if (existing) {
        return res.status(409).json({
          message: groupId
            ? "Your group already has a project. Use edit to make changes."
            : "You already have a project. Use edit to make changes.",
        });
      }

      const {
        title, methodology, department, techStack, defenseDate, description,
        abstractText, analysisResults,
      } = req.body;

      if (!title?.trim()) return res.status(400).json({ message: "Project title is required." });
      if (typeof department === "string" && department.length > MAX_DEPARTMENT_LEN) {
        return res.status(400).json({ message: "Department / program name is too long." });
      }
      const departmentValue = typeof department === "string" && department.trim()
        ? department.trim()
        : null;

      // Resolve adviser name from group, if the student has one
      let adviserName: string | null = null;
      if (groupId) {
        const { data: groupRow } = await supabase
          .from("groups")
          .select("adviser_name, adviser_firebase_uid")
          .eq("id", groupId)
          .single();

        adviserName = groupRow?.adviser_name ?? null;
        if (!adviserName && groupRow?.adviser_firebase_uid) {
          const adviserRow = await getSupabaseUserByFirebaseUid(groupRow.adviser_firebase_uid);
          adviserName = adviserRow?.full_name ?? null;
        }
      }

      const now = new Date().toISOString();
      const row: Record<string, any> = {
        group_id: groupId,
        title: title.trim(),
        methodology: methodology || "Quantitative",
        department: departmentValue,
        tech_stack: Array.isArray(techStack) ? techStack : [],
        defense_date: defenseDate || null,
        description: description || null,
        abstract_text: abstractText || null,
        analysis_results: analysisResults || null,
        adviser_name: adviserName,
        status: "active",
        created_by: caller.decoded.uid,
        created_at: now,
        updated_at: now,
      };

      let { data: newProject, error } = await supabase
        .from("projects").insert(row).select().single();

      if (isDepartmentConstraintError(error) && row.department != null) {
        console.warn("[projects] DB rejected department value — retrying with null. Apply migration 009 to keep the program name.");
        row.department = null;
        ({ data: newProject, error } = await supabase
          .from("projects").insert(row).select().single());
      }

      if (error || !newProject) {
        console.error("Create project insert error:", error);
        return res.status(500).json({ message: `Could not save project: ${error?.message ?? "unknown database error"}` });
      }

      if (abstractText) stampAbstractUpload(newProject.id);

      await logAudit(caller.decoded.uid, "PROJECT_CREATE", "projects", newProject.id, {
        title: title.trim(),
        department: row.department,
      });

      return res.status(201).json(projectRowToApi(newProject));
    } catch (error: any) {
      console.error("Create project error:", error);
      res.status(500).json({ message: `Server error: ${error?.message ?? "unknown"}` });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const { id } = req.params;
      const { data: projectRow, error: pErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (pErr || !projectRow) return res.status(404).json({ message: "Project not found." });

      const role: AppRole = caller.profile.role as AppRole;

      if (role === "STUDENT") {
        const ownsViaGroup = !!caller.profile.groupId && caller.profile.groupId === projectRow.group_id;
        const ownsDirectly = projectRow.created_by === caller.decoded.uid;
        if (!ownsViaGroup && !ownsDirectly) {
          return res.status(403).json({ message: "You can only edit your own project." });
        }
      } else if (role === "CAPSTONE_ADVISER") {
        const { data: groupRow } = await supabase
          .from("groups")
          .select("adviser_firebase_uid")
          .eq("id", projectRow.group_id)
          .single();
        if (!groupRow || groupRow.adviser_firebase_uid !== caller.decoded.uid) {
          return res.status(403).json({ message: "You can only edit projects from your assigned group." });
        }
      } else {
        return res.status(403).json({ message: "Forbidden." });
      }

      const {
        title, methodology, department, techStack,
        defenseDate, description, abstractText, analysisResults,
      } = req.body;

      if (title !== undefined && !title?.trim()) {
        return res.status(400).json({ message: "Project title cannot be empty." });
      }
      if (typeof department === "string" && department.length > MAX_DEPARTMENT_LEN) {
        return res.status(400).json({ message: "Department / program name is too long." });
      }
      if (techStack !== undefined && (!Array.isArray(techStack) || techStack.length === 0)) {
        return res.status(400).json({ message: "Select at least one technology." });
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title.trim();
      if (methodology !== undefined) updates.methodology = methodology;
      if (department !== undefined) updates.department = (typeof department === "string" && department.trim()) ? department.trim() : null;
      if (techStack !== undefined) updates.tech_stack = techStack;
      if (defenseDate !== undefined) updates.defense_date = defenseDate;
      if (description !== undefined) updates.description = description;
      if (abstractText !== undefined) updates.abstract_text = abstractText;
      if (analysisResults !== undefined) updates.analysis_results = analysisResults;

      let { data: updated, error } = await supabase
        .from("projects").update(updates).eq("id", id).select().single();

      if (isDepartmentConstraintError(error) && updates.department != null) {
        console.warn("[projects] DB rejected department value on update — retrying with null. Apply migration 009 to keep the program name.");
        updates.department = null;
        ({ data: updated, error } = await supabase
          .from("projects").update(updates).eq("id", id).select().single());
      }

      if (error || !updated) {
        console.error("Update project write error:", error);
        return res.status(500).json({ message: `Could not save project: ${error?.message ?? "unknown database error"}` });
      }

      if (abstractText !== undefined) {
        // Keep own-ai in sync whenever the abstract text changes
        indexInOwnAI(abstractText, `project-${id}-abstract`).catch(() => {});
        if (abstractText) stampAbstractUpload(id);
        await logAudit(caller.decoded.uid, "ABSTRACT_UPLOAD", "projects", id);
      } else {
        await logAudit(caller.decoded.uid, "PROJECT_UPDATE", "projects", id);
      }

      return res.json(projectRowToApi(updated));
    } catch (error: any) {
      console.error("Update project error:", error);
      res.status(500).json({ message: `Server error: ${error?.message ?? "unknown"}` });
    }
  });

  // DELETE /api/projects/:id — remove a project (and its abstract) so the
  // group can start a fresh one. Past defense sessions are kept: their
  // project_id FK is ON DELETE SET NULL, so history/analytics stay intact.
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const { id } = req.params;
      const { data: projectRow, error: pErr } = await supabase
        .from("projects")
        .select("id, group_id, created_by, title")
        .eq("id", id)
        .single();
      if (pErr || !projectRow) return res.status(404).json({ message: "Project not found." });

      const role: AppRole = caller.profile.role as AppRole;

      if (role === "STUDENT") {
        const ownsViaGroup = !!caller.profile.groupId && caller.profile.groupId === projectRow.group_id;
        const ownsDirectly = projectRow.created_by === caller.decoded.uid;
        if (!ownsViaGroup && !ownsDirectly) {
          return res.status(403).json({ message: "You can only remove your own project." });
        }
      } else if (role === "CAPSTONE_ADVISER") {
        const { data: groupRow } = await supabase
          .from("groups")
          .select("adviser_firebase_uid")
          .eq("id", projectRow.group_id)
          .single();
        if (!groupRow || groupRow.adviser_firebase_uid !== caller.decoded.uid) {
          return res.status(403).json({ message: "You can only remove projects from your assigned group." });
        }
      } else if (role !== "ADMIN" && role !== "CAPSTONE_COORDINATOR") {
        return res.status(403).json({ message: "Forbidden." });
      }

      const { error: delErr } = await supabase.from("projects").delete().eq("id", id);
      if (delErr) throw new Error(delErr.message);

      await logAudit(caller.decoded.uid, "PROJECT_DELETE", "projects", id, {
        title: projectRow.title,
      });

      return res.json({ message: "Project removed successfully." });
    } catch (error: any) {
      console.error("Delete project error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // PANELISTS (server-generated per session, name varies every time)
  // ===============================================================

  const PANELIST_SURNAMES = [
    "Martinez", "Santos", "Reyes", "Cruz", "Mendoza", "Garcia", "Torres", "Villanueva",
    "Dela Cruz", "Navarro", "Bautista", "Ramos", "Gonzalez", "Flores", "Morales",
    "Castillo", "Santiago", "Aguilar", "Mercado", "Abad", "Pascual", "Villegas",
    "Fernandez", "Ocampo", "Hernandez", "Lopez", "Rivera", "Dizon", "Marquez",
    "Soriano", "Aquino", "Cunanan", "Guevara", "Banaag",
  ];

  function pickTitleForRole(role: string): string {
    const titles = /practitioner/i.test(role) ? ["Mr.", "Ms.", "Engr."] : ["Dr.", "Prof."];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  function generateSessionPanelists(domain: string) {
    const template = (DOMAIN_PANELISTS as Record<string, typeof PANELISTS>)[domain] ?? PANELISTS;
    const usedSurnames = new Set<string>();
    return template.map((slot) => {
      let surname: string;
      do {
        surname = PANELIST_SURNAMES[Math.floor(Math.random() * PANELIST_SURNAMES.length)];
      } while (usedSurnames.has(surname) && usedSurnames.size < PANELIST_SURNAMES.length);
      usedSurnames.add(surname);
      return {
        name: `${pickTitleForRole(slot.role)} ${surname}`,
        role: slot.role,
        specialization: slot.specialization,
        persona: slot.persona,
      };
    });
  }

  // POST /api/panelists/generate — called once a practice session starts.
  // Reuses each domain's role/specialization/persona templates but with a
  // freshly randomized name every time, and logs the generated set to
  // Supabase so there's a record of who examined which student.
  app.post("/api/panelists/generate", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const domain = typeof req.body?.domain === "string" ? req.body.domain : "default";
      const generated = generateSessionPanelists(domain);

      const { data: inserted, error } = await supabase
        .from("panelists")
        .insert(
          generated.map((p) => ({
            name: p.name,
            role: p.role,
            specialization: p.specialization,
            persona: p.persona,
            student_firebase_uid: caller.decoded.uid,
          })),
        )
        .select();

      if (error) throw new Error(error.message);

      res.json({
        panelists: (inserted ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          specialization: row.specialization,
          persona: row.persona,
        })),
      });
    } catch (error: any) {
      console.error("Generate panelists error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // SESSIONS
  // ===============================================================

  // POST /api/sessions — save completed session + per-question history
  app.post("/api/sessions", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const {
        projectTitle,
        overallScore,
        accuracyScore,
        completenessScore,
        clarityScore,
        confidenceScore,
        duration,
        questionsAnswered,
        history,
        weakestCategory,
      } = req.body;

      // Resolve group and project from caller profile
      const groupId: string | null = caller.profile.groupId ?? null;
      const projQuery = supabase.from("projects").select("id");
      const { data: proj } = groupId
        ? await projQuery.eq("group_id", groupId).single()
        : await projQuery.eq("created_by", caller.decoded.uid).is("group_id", null).single();
      const projectId: string | null = proj?.id ?? null;

      const now = new Date().toISOString();

      // Insert defense session
      const { data: sessionRow, error: sessErr } = await supabase
        .from("defense_sessions")
        .insert({
          student_firebase_uid: caller.decoded.uid,
          group_id: groupId,
          project_id: projectId,
          project_title: projectTitle ?? null,
          overall_score: overallScore ?? 0,
          accuracy_score: accuracyScore ?? 0,
          completeness_score: completenessScore ?? 0,
          clarity_score: clarityScore ?? 0,
          confidence_score: confidenceScore ?? 0,
          duration_seconds: duration ?? 0,
          questions_answered: questionsAnswered ?? 0,
          weakest_category: weakestCategory ?? null,
          status: "completed",
          started_at: null,
          ended_at: now,
          created_at: now,
        })
        .select()
        .single();

      if (sessErr || !sessionRow) throw new Error(sessErr?.message ?? "Session insert failed");

      // Insert per-question rows
      if (Array.isArray(history) && history.length > 0) {
        const questionRows = history.map((qa: any) => ({
          session_id: sessionRow.id,
          panelist_name: qa.panelistName ?? null,
          panelist_personality: qa.panelistPersonality ?? null,
          question: qa.question ?? "",
          answer: qa.answer ?? null,
          source_section: qa.sourceSection ?? null,
          difficulty: qa.difficulty ?? null,
          question_type: qa.questionType ?? null,
          // Clamp score to integer 0-100 to satisfy DB CHECK constraint
          score: Math.min(100, Math.max(0, Math.round(qa.feedback?.score ?? 0))),
          category: qa.category ?? null,
          feedback: qa.feedback ?? null,
          confidence_metrics: qa.feedback?.confidenceMetrics ?? null,
        }));
        const { error: qErr } = await supabase.from("session_questions").insert(questionRows);
        if (qErr) {
          console.error("[session_questions] insert failed:", qErr.message, qErr.details ?? "");
          console.error("[session_questions] first row sample:", JSON.stringify(questionRows[0]));
        } else {
          console.log(`[session_questions] inserted ${questionRows.length} rows for session ${sessionRow.id}`);
        }
      }

      // Record readiness history entry
      await supabase.from("readiness_history").insert({
        student_firebase_uid: caller.decoded.uid,
        session_id: sessionRow.id,
        readiness_score: overallScore ?? 0,
        created_at: now,
      });

      // Clear any active session state (session ended)
      await clearActiveSession(caller.decoded.uid);

      await logAudit(caller.decoded.uid, "SESSION_END", "defense_sessions", sessionRow.id, {
        overallScore,
        questionsAnswered,
      });

      res.status(201).json({ message: "Session saved", sessionId: sessionRow.id });
    } catch (error: any) {
      console.error("Save session error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/sessions/:id/feedback — quick post-session survey
  app.post("/api/sessions/:id/feedback", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const sessionId = req.params.id;
      const { realism, difficulty, helpfulness, prepared, comment } = req.body ?? {};

      const clampRating = (v: any): number | null => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
      };
      const preparedVal =
        ["yes", "somewhat", "no"].includes(String(prepared)) ? String(prepared) : null;
      const commentVal =
        typeof comment === "string" && comment.trim()
          ? comment.trim().slice(0, 2000)
          : null;

      // The session must belong to the caller (when it's a real session id).
      let realSessionId: string | null = null;
      if (sessionId && sessionId !== "unknown") {
        const { data: sess } = await supabase
          .from("defense_sessions")
          .select("id, student_firebase_uid")
          .eq("id", sessionId)
          .maybeSingle();
        if (sess && sess.student_firebase_uid !== caller.decoded.uid) {
          return res.status(403).json({ message: "Not your session." });
        }
        realSessionId = sess?.id ?? null;
      }

      const { error } = await supabase.from("session_feedback").insert({
        session_id: realSessionId,
        student_firebase_uid: caller.decoded.uid,
        realism_rating: clampRating(realism),
        difficulty_rating: clampRating(difficulty),
        helpfulness_rating: clampRating(helpfulness),
        prepared: preparedVal,
        comment: commentVal,
      });
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "SESSION_FEEDBACK", "defense_sessions", realSessionId ?? undefined);
      res.status(201).json({ message: "Thanks for the feedback." });
    } catch (error: any) {
      console.error("Session feedback error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // GET /api/sessions/my — student's full session history
  app.get("/api/sessions/my", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "STUDENT") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const page = parseInt(String(req.query.page ?? "1"), 10);
      const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
      const offset = (page - 1) * limit;

      const { data: sessions, error } = await supabase
        .from("defense_sessions")
        .select("*")
        .eq("student_firebase_uid", caller.decoded.uid)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);

      const results: any[] = [];
      for (const s of sessions ?? []) {
        const { data: questions } = await supabase
          .from("session_questions")
          .select("*")
          .eq("session_id", s.id)
          .order("created_at", { ascending: true });

        const history = (questions ?? []).map((q: any) => {
          let feedback: any = {
            score: q.score ?? 0,
            strengths: [],
            improvements: [],
            betterExample: "",
            semanticRelevance: 0,
            keywordAccuracy: 0,
            confidenceLevel: 0,
          };
          if (q.feedback && typeof q.feedback === "object") {
            feedback = { ...feedback, ...q.feedback };
          }
          return {
            question: q.question,
            answer: q.answer ?? "",
            category: q.category ?? "",
            panelistName: q.panelist_name ?? null,
            feedback,
          };
        });

        results.push({
          id: s.id,
          date: s.created_at,
          projectTitle: s.project_title ?? null,
          overallScore: s.overall_score ?? 0,
          duration: s.duration_seconds ?? 0,
          questionsAnswered: s.questions_answered ?? 0,
          weakestCategory: s.weakest_category ?? null,
          groupId: s.group_id ?? null,
          projectId: s.project_id ?? null,
          categoryScores: {
            Accuracy: s.accuracy_score ?? 0,
            Completeness: s.completeness_score ?? 0,
            Clarity: s.clarity_score ?? 0,
            Confidence: s.confidence_score ?? 0,
          },
          history,
        });
      }

      return res.json(results);
    } catch (error: any) {
      console.error("Get sessions/my error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/sessions/group — adviser/coordinator/admin view
  app.get("/api/sessions/group", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const role: AppRole = caller.profile.role as AppRole;
      const allowedRoles: AppRole[] = ["CAPSTONE_ADVISER", "CAPSTONE_COORDINATOR", "ADMIN"];
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const empty = {
        summary: { totalStudents: 0, totalSessions: 0, overallAvg: 0, atRiskCount: 0, categoryAverages: {} },
        students: [],
      };

      // Determine groups in scope
      let groupQuery = supabase.from("groups").select("id, name");
      if (role === "CAPSTONE_ADVISER") {
        groupQuery = groupQuery.eq("adviser_firebase_uid", caller.decoded.uid);
      }
      const { data: groups } = await groupQuery;
      if (!groups || groups.length === 0) return res.json(empty);

      const groupIds = groups.map((g) => g.id);
      const groupNameMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));

      // Fetch all group members in scope
      const { data: members } = await supabase
        .from("group_members")
        .select("group_id, student_firebase_uid")
        .in("group_id", groupIds);
      if (!members || members.length === 0) return res.json(empty);

      const studentFuids = [...new Set(members.map((m) => m.student_firebase_uid))];

      // Map student → group
      const studentGroupMap = new Map<string, { groupId: string; groupName: string }>();
      for (const m of members) {
        studentGroupMap.set(m.student_firebase_uid, {
          groupId: m.group_id,
          groupName: groupNameMap[m.group_id] ?? "—",
        });
      }

      // Fetch user info for these students
      const { data: studentRows } = await supabase
        .from("users")
        .select("firebase_uid, full_name, email")
        .in("firebase_uid", studentFuids)
        .eq("is_deleted", false);

      if (!studentRows || studentRows.length === 0) return res.json(empty);

      const uidToInfo = new Map(
        studentRows.map((u) => [u.firebase_uid, { fullName: u.full_name, email: u.email }]),
      );

      // Fetch all sessions for these students
      const { data: sessions } = await supabase
        .from("defense_sessions")
        .select(
          "id, student_firebase_uid, overall_score, accuracy_score, completeness_score, clarity_score, confidence_score, created_at",
        )
        .in("student_firebase_uid", studentFuids)
        .order("created_at", { ascending: false });

      // Group sessions by student
      const studentSessions = new Map<string, any[]>();
      for (const uid of studentFuids) studentSessions.set(uid, []);
      for (const s of sessions ?? []) {
        studentSessions.get(s.student_firebase_uid)?.push(s);
      }

      const CAT_KEYS = ["Accuracy", "Completeness", "Clarity", "Confidence"] as const;
      const globalCat: Record<string, { sum: number; n: number }> = {
        Accuracy: { sum: 0, n: 0 },
        Completeness: { sum: 0, n: 0 },
        Clarity: { sum: 0, n: 0 },
        Confidence: { sum: 0, n: 0 },
      };
      const dbCols: Record<string, string> = {
        Accuracy: "accuracy_score",
        Completeness: "completeness_score",
        Clarity: "clarity_score",
        Confidence: "confidence_score",
      };

      let totalSessions = 0;
      let atRiskCount = 0;
      const scoreList: number[] = [];

      const students = [...uidToInfo.entries()].map(([uid, info]) => {
        const sess = studentSessions.get(uid) ?? [];
        const sessionCount = sess.length;
        const avgScore =
          sessionCount > 0
            ? Math.round(
                sess.reduce((s: number, r: any) => s + (r.overall_score ?? 0), 0) / sessionCount,
              )
            : 0;
        const lastScore = sess.length > 0 ? (sess[0].overall_score ?? 0) : null;
        const lastDate = sess.length > 0 ? sess[0].created_at : null;
        const atRisk = sessionCount > 0 && avgScore < 70;

        const catAvgs: Record<string, number> = {};
        for (const cat of CAT_KEYS) {
          const col = dbCols[cat];
          const vals = sess.filter((s: any) => s[col] != null).map((s: any) => s[col] as number);
          catAvgs[cat] = vals.length > 0
            ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
            : 0;
          if (vals.length > 0) {
            globalCat[cat].sum += vals.reduce((a: number, b: number) => a + b, 0);
            globalCat[cat].n += vals.length;
          }
        }

        totalSessions += sessionCount;
        if (atRisk) atRiskCount++;
        if (sessionCount > 0) scoreList.push(avgScore);

        return {
          userId: uid,
          fullName: info.fullName,
          groupId: studentGroupMap.get(uid)?.groupId ?? null,
          groupName: studentGroupMap.get(uid)?.groupName ?? "—",
          sessionCount,
          avgScore,
          lastScore,
          lastDate,
          atRisk,
          categoryAvgs: catAvgs,
        };
      });

      students.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
      const overallAvg =
        scoreList.length > 0
          ? Math.round(scoreList.reduce((a, b) => a + b, 0) / scoreList.length)
          : 0;
      const categoryAverages: Record<string, number> = {};
      for (const cat of CAT_KEYS) {
        categoryAverages[cat] =
          globalCat[cat].n > 0 ? Math.round(globalCat[cat].sum / globalCat[cat].n) : 0;
      }

      return res.json({
        summary: { totalStudents: students.length, totalSessions, overallAvg, atRiskCount, categoryAverages },
        students,
      });
    } catch (error: any) {
      console.error("Group sessions error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // SESSION RECOVERY API
  // ===============================================================

  // GET /api/sessions/active — restore in-progress session
  app.get("/api/sessions/active", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "STUDENT") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const state = await getActiveSession(caller.decoded.uid);
      if (!state) return res.status(404).json({ message: "No active session found" });

      res.json(state);
    } catch (error: any) {
      console.error("Get active session error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // PUT /api/sessions/active — save live session state (called periodically during session)
  app.put("/api/sessions/active", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "STUDENT") {
        return res.status(403).json({ message: "Forbidden" });
      }

      await saveActiveSession(caller.decoded.uid, req.body);
      res.json({ message: "Session state saved" });
    } catch (error: any) {
      console.error("Save active session error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // DELETE /api/sessions/active — clear state on session end
  app.delete("/api/sessions/active", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      await clearActiveSession(caller.decoded.uid);
      res.json({ message: "Session state cleared" });
    } catch (error: any) {
      console.error("Clear active session error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // ANALYTICS
  // ===============================================================

  app.get("/api/adviser/analytics", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });

      const allowedRoles: AppRole[] = ["CAPSTONE_ADVISER", "CAPSTONE_COORDINATOR", "ADMIN"];
      if (!allowedRoles.includes(caller.profile.role as AppRole)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Program averages: join defense_sessions → users (by firebase_uid)
      const { data: allSessions } = await supabase
        .from("defense_sessions")
        .select("student_firebase_uid, overall_score");

      const { data: allUsers } = await supabase
        .from("users")
        .select("firebase_uid, program");

      const programMap = new Map(
        (allUsers ?? []).map((u) => [u.firebase_uid, u.program ?? "Unknown"]),
      );

      const programAggregates: Record<string, { sum: number; count: number }> = {};
      for (const s of allSessions ?? []) {
        const prog = programMap.get(s.student_firebase_uid) ?? "Unknown";
        if (!programAggregates[prog]) programAggregates[prog] = { sum: 0, count: 0 };
        programAggregates[prog].sum += s.overall_score ?? 0;
        programAggregates[prog].count++;
      }

      const programAverages = Object.entries(programAggregates).map(([program, agg]) => ({
        program,
        averageReadiness: Math.round(agg.sum / agg.count),
        totalSimulations: agg.count,
      }));

      // At-risk students: average < 70
      const studentScoreMap = new Map<string, number[]>();
      for (const s of allSessions ?? []) {
        if (!studentScoreMap.has(s.student_firebase_uid)) {
          studentScoreMap.set(s.student_firebase_uid, []);
        }
        studentScoreMap.get(s.student_firebase_uid)!.push(s.overall_score ?? 0);
      }

      const { data: userDetails } = await supabase
        .from("users")
        .select("firebase_uid, full_name, email, program")
        .eq("is_deleted", false);
      const userDetailMap = new Map(
        (userDetails ?? []).map((u) => [u.firebase_uid, u]),
      );

      const atRiskStudents: any[] = [];
      for (const [uid, scores] of studentScoreMap.entries()) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < 70) {
          const u = userDetailMap.get(uid);
          if (u) {
            atRiskStudents.push({
              fullName: u.full_name,
              email: u.email,
              program: u.program,
              avgScore: Math.round(avg),
            });
          }
        }
      }
      atRiskStudents.sort((a, b) => a.avgScore - b.avgScore);
      const topAtRisk = atRiskStudents.slice(0, 10);

      // Weak categories
      const { data: weakData } = await supabase
        .from("defense_sessions")
        .select("weakest_category")
        .not("weakest_category", "is", null);

      const weakCount: Record<string, number> = {};
      for (const s of weakData ?? []) {
        if (s.weakest_category) {
          weakCount[s.weakest_category] = (weakCount[s.weakest_category] ?? 0) + 1;
        }
      }
      const weakCategories = Object.entries(weakCount)
        .map(([weakestCategory, count]) => ({ weakestCategory, count }))
        .sort((a, b) => b.count - a.count);

      res.json({ programAverages, atRiskStudents: topAtRisk, weakCategories });
    } catch (error: any) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin: all sessions
  app.get("/api/admin/sessions", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const page = parseInt(String(req.query.page ?? "1"), 10);
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
      const offset = (page - 1) * limit;

      const { data: sessions, error } = await supabase
        .from("defense_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);

      const fuids = [...new Set((sessions ?? []).map((s) => s.student_firebase_uid))];
      const { data: userRows } = await supabase
        .from("users")
        .select("firebase_uid, full_name, email")
        .in("firebase_uid", fuids);
      const userMap = new Map(
        (userRows ?? []).map((u) => [u.firebase_uid, { fullName: u.full_name, email: u.email }]),
      );

      // Backfill project titles for older sessions that were saved without one
      const projIds = [
        ...new Set((sessions ?? []).map((s) => s.project_id).filter(Boolean)),
      ];
      const projMap = new Map<string, string>();
      if (projIds.length > 0) {
        const { data: projRows } = await supabase
          .from("projects")
          .select("id, title")
          .in("id", projIds);
        for (const p of projRows ?? []) projMap.set(p.id, p.title);
      }

      const result = (sessions ?? []).map((s) => ({
        ...s,
        userName: userMap.get(s.student_firebase_uid)?.fullName ?? "Unknown",
        userEmail: userMap.get(s.student_firebase_uid)?.email ?? "",
        // Camel-case fields the dashboard table reads directly
        projectTitle: s.project_title ?? (s.project_id ? projMap.get(s.project_id) : null) ?? null,
        overallScore: s.overall_score ?? 0,
        duration: s.duration_seconds ?? 0,
        questionsAnswered: s.questions_answered ?? 0,
        weakestCategory: s.weakest_category ?? null,
        date: s.started_at ?? s.ended_at ?? s.created_at,
      }));

      res.json(result);
    } catch (error: any) {
      console.error("Admin sessions error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Readiness dashboard: student trend data
  app.get("/api/readiness/trend", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "STUDENT") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { data: history, error } = await supabase
        .from("readiness_history")
        .select("readiness_score, created_at")
        .eq("student_firebase_uid", caller.decoded.uid)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);

      const scores = (history ?? []).map((r) => r.readiness_score);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const { data: sessions } = await supabase
        .from("defense_sessions")
        .select("accuracy_score, completeness_score, clarity_score, confidence_score")
        .eq("student_firebase_uid", caller.decoded.uid);

      const CAT_KEYS = ["Accuracy", "Completeness", "Clarity", "Confidence"] as const;
      const dbCols: Record<string, string> = {
        Accuracy: "accuracy_score",
        Completeness: "completeness_score",
        Clarity: "clarity_score",
        Confidence: "confidence_score",
      };
      const catAvgs: Record<string, number> = {};
      for (const cat of CAT_KEYS) {
        const col = dbCols[cat];
        const vals = (sessions ?? [])
          .filter((s: any) => s[col] != null)
          .map((s: any) => s[col] as number);
        catAvgs[cat] = vals.length > 0
          ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
          : 0;
      }

      const sorted = Object.entries(catAvgs);
      const strongestCategory = sorted.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const weakestCategory = sorted.sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;

      const improvementRate =
        scores.length >= 2 ? scores[scores.length - 1] - scores[0] : 0;

      res.json({
        trend: history ?? [],
        avgScore,
        sessionCount: scores.length,
        categoryAverages: catAvgs,
        strongestCategory,
        weakestCategory,
        improvementRate,
      });
    } catch (error: any) {
      console.error("Readiness trend error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // AUDIT LOGS (Admin only)
  // ===============================================================

  app.get("/api/audit-logs", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      if (caller.profile.role !== "ADMIN") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const page = parseInt(String(req.query.page ?? "1"), 10);
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
      const offset = (page - 1) * limit;

      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);
      res.json(logs ?? []);
    } catch (error: any) {
      console.error("Audit logs error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ===============================================================
  // ABSTRACT FILE UPLOAD & TEXT EXTRACTION
  // ===============================================================

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "pdf" || ext === "docx") cb(null, true);
      else cb(new Error("INVALID_TYPE"));
    },
  });

  function normalizeExtractedText(raw: string): string {
    return raw
      .replace(/ﬀ/g, "ff").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
      .replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl").replace(/ﬅ/g, "st").replace(/ﬆ/g, "st")
      .replace(/['']/g, "'").replace(/[""]/g, '"').replace(/[–—]/g, "-")
      .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ɏ]/g, " ")
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      .replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isGibberish(text: string): boolean {
    const cleaned = text.replace(/\s+/g, " ").trim();
    const nonSpace = cleaned.replace(/\s/g, "");
    if (nonSpace.length === 0) return true;
    const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount / nonSpace.length < 0.18) return true;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const wordLike = tokens.filter((t) => /^[a-zA-ZÀ-ÖØ-öø-ÿ''-]{2,35}$/.test(t));
    if (wordLike.length < 8) return true;
    if (tokens.length > 30 && wordLike.length / tokens.length < 0.12) return true;
    const COMMON = [
      "the","and","of","in","to","is","are","a","an","this","that","for",
      "with","as","study","research","data","results","using","which","were",
      "system","chapter","introduction","methodology","conclusion","analysis",
      "ang","ng","sa","mga","ay","na","ito","para",
    ];
    const lower = cleaned.toLowerCase();
    const hasCommonWord = COMMON.some((w) => new RegExp(`\\b${w}\\b`).test(lower));
    if (tokens.length > 120 && !hasCommonWord) return true;
    if (wordLike.length > 80) {
      const uniqueRatio = new Set(wordLike.map((w) => w.toLowerCase())).size / wordLike.length;
      if (uniqueRatio < 0.08) return true;
    }
    return false;
  }

  app.post("/api/upload/abstract", (req: any, res: any) => {
    upload.single("file")(req, res, async (multerErr: any) => {
      if (multerErr) {
        if (multerErr.message === "INVALID_TYPE") {
          return res.status(415).json({ error: "INVALID_TYPE" });
        }
        if (multerErr.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "FILE_TOO_LARGE" });
        }
        return res.status(400).json({ error: multerErr.message || "Upload failed." });
      }

      try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded." });
        const ext = (req.file.originalname as string).split(".").pop()?.toLowerCase() ?? "";

        let text = "";
        if (ext === "pdf") {
          try {
            const rawText = await extractPdfText(req.file.buffer);
            text = normalizeExtractedText(rawText);
          } catch (pdfErr: any) {
            console.error("[Upload] PDF extraction error:", pdfErr.message);
            return res.status(422).json({ error: "PDF_PARSE_FAILED" });
          }
        } else if (ext === "docx") {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          text = normalizeExtractedText(result.value ?? "");
        } else {
          return res.status(415).json({ error: "INVALID_TYPE" });
        }

        if (!text || text.length < 20) {
          return res.status(422).json({ error: "EMPTY_FILE" });
        }
        if (isGibberish(text)) {
          return res.status(422).json({ error: "GIBBERISH_CONTENT" });
        }

        const caller = await verifyAndGetCaller(req.headers.authorization);
        if (caller) {
          await logAudit(caller.decoded.uid, "FILE_UPLOAD", "projects", undefined, {
            fileName: req.file.originalname,
            size: req.file.size,
          });
        }

        // Index in own-ai in background — don't await, don't block the response
        indexInOwnAI(text, req.file.originalname).catch(() => {});

        res.json({ text });
      } catch (err: any) {
        console.error("[Upload] handler error:", err.message);
        res.status(500).json({ error: "Failed to extract text from file." });
      }
    });
  });

  // POST /api/upload/folder — accept up to 20 files, index them all in own-ai.
  // The concatenated text is returned so the caller can save it as abstract_text if desired.
  app.post("/api/upload/folder", (req: any, res: any) => {
    upload.array("files", 20)(req, res, async (multerErr: any) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message || "Upload failed" });
      }

      try {
        const caller = await verifyAndGetCaller(req.headers.authorization);
        if (!caller) return res.status(401).json({ message: "Unauthorized" });

        const files: Express.Multer.File[] = (req.files as Express.Multer.File[]) ?? [];
        if (!files.length) return res.status(400).json({ error: "No files uploaded" });

        const results: { file: string; chunks: number; status: string }[] = [];
        const allTexts: string[] = [];

        for (const file of files) {
          try {
            const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
            let text = "";

            if (ext === "pdf") {
              const raw = await extractPdfText(file.buffer);
              text = normalizeExtractedText(raw);
            } else if (ext === "docx") {
              const mammoth = await import("mammoth");
              const result = await mammoth.extractRawText({ buffer: file.buffer });
              text = normalizeExtractedText(result.value ?? "");
            }

            if (!text || text.length < 20 || isGibberish(text)) {
              results.push({ file: file.originalname, chunks: 0, status: "skipped — no readable text" });
              continue;
            }

            allTexts.push(text);

            // Send each file to own-ai for indexing (background, non-blocking per file)
            indexInOwnAI(text, file.originalname).catch(() => {});
            results.push({ file: file.originalname, chunks: Math.ceil(text.split(/\s+/).length / 350), status: "indexed" });

            await logAudit(caller.decoded.uid, "FOLDER_FILE_UPLOAD", "projects", undefined, {
              fileName: file.originalname, size: file.size,
            });
          } catch (fileErr: any) {
            results.push({ file: file.originalname, chunks: 0, status: `error: ${fileErr.message}` });
          }
        }

        const combinedText = allTexts.join("\n\n");
        res.json({
          filesProcessed: files.length,
          filesIndexed: results.filter(r => r.status === "indexed").length,
          combinedText: combinedText || null,
          results,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  });

  // ===============================================================
  // AI PROXY — priority order:
  //   1. Own AI     (own-ai/serve.py running on localhost:8080)
  //   2. OpenRouter (external API, requires OPENROUTER_API_KEY)
  //   3. Gemini     (external API, requires GEMINI_API_KEY)
  //   4. Groq       (external API, requires GROQ_API_KEY)
  // ===============================================================

  const OWN_AI_URL = process.env.OWN_AI_URL ?? "http://127.0.0.1:8080";

  async function callOwnAI(prompt: string, system?: string, timeoutMs = 15_000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${OWN_AI_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`Own AI returned HTTP ${resp.status}`);
      const data: any = await resp.json();
      const text = data?.text ?? "";
      if (!text) throw new Error("Own AI returned empty text");
      // Every caller of /api/ai/generate expects JSON back — own-ai is a small
      // fine-tuned model that can return well-formed prose instead of the
      // requested JSON. Validate before accepting, so garbage output falls
      // through to OpenRouter/Gemini/Groq instead of silently breaking the
      // downstream parseAIJson() call.
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      try {
        JSON.parse(cleaned);
      } catch {
        throw new Error("Own AI returned non-JSON text — rejecting");
      }
      console.log("[AI] Own AI success");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  // Fire-and-forget: index document text in own-ai so RAG can use it during sessions.
  // Never throws — own-ai may not be running and that's fine (Gemini/Groq are fallbacks).
  async function indexInOwnAI(text: string, source: string = "document"): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(`${OWN_AI_URL}/index-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) console.log(`[OwnAI] Indexed "${source}" (${text.length} chars)`);
    } catch {
      // own-ai not running — silent, not a failure
    }
  }

  // GET /api/ai/status — tells the frontend whether own-ai is online + how many chunks indexed
  app.get("/api/ai/status", async (_req, res) => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3_000);
      const resp = await fetch(`${OWN_AI_URL}/health`, { signal: controller.signal });
      const data: any = await resp.json();
      res.json({ online: true, indexedChunks: data.indexed_chunks ?? 0, model: data.model ?? "unknown" });
    } catch {
      res.json({ online: false, indexedChunks: 0, model: null });
    }
  });

  // POST /api/ai/index — let the frontend manually send text to own-ai for indexing
  app.post("/api/ai/index", async (req, res) => {
    try {
      const caller = await verifyAndGetCaller(req.headers.authorization);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      const { text, source } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "text is required" });
      await indexInOwnAI(text, source ?? "manual");
      res.json({ message: "Indexing request sent to own-ai" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bounds a single fetch so one slow provider can't stall the whole cascade.
  function abortAfter(ms: number): { signal: AbortSignal; done: () => void } {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, done: () => clearTimeout(t) };
  }

  async function callOpenRouter(prompt: string, system?: string, maxTokens = 1200, timeoutMs = 30_000): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    // Free-tier models, tried in order until one responds.
    // (gpt-oss-20b:free returns empty content under response_format:json_object — kept last, after models that reliably return text)
    const models = [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "openai/gpt-oss-20b:free",
    ];
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    for (const model of models) {
      const guard = abortAfter(timeoutMs);
      try {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://defensa.app",
            "X-Title": "Defensa",
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: maxTokens,
          }),
          signal: guard.signal,
        });

        if (resp.status === 429) { console.warn(`[OpenRouter] ${model} rate-limited`); continue; }
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          console.warn(`[OpenRouter] ${model} HTTP ${resp.status}: ${errBody}`);
          continue;
        }

        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        if (text) { console.log(`[AI] OpenRouter success: ${model}`); return text; }
      } catch (e: any) {
        console.warn(`[OpenRouter] ${model} error: ${e.message}`);
      } finally {
        guard.done();
      }
    }
    throw new Error("All OpenRouter models failed.");
  }

  async function callGemini(prompt: string, maxTokens = 1200, timeoutMs = 30_000): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment");

    const ai = new GoogleGenAI({ apiKey });
    const models = [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-2.5-flash-lite-preview-06-17",
    ];

    let authFailed = false;
    for (const model of models) {
      if (authFailed) break;
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
          }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`Gemini ${model} timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
        const text = response.text ?? "";
        if (text) {
          console.log(`[AI] Gemini success: ${model}`);
          return text;
        }
        console.warn(`[AI] ${model} returned empty — trying next`);
      } catch (e: any) {
        const msg: string = e?.message ?? String(e);
        // Auth failure applies to all models — break immediately to trigger Groq fallback
        if (msg.includes("API_KEY_INVALID") || msg.includes("PERMISSION_DENIED") || e?.status === 401 || e?.status === 403) {
          console.error(`[AI] Gemini API key rejected (${model}): ${msg}`);
          authFailed = true;
          break;
        }
        if (msg.includes("429") || e?.status === 429) {
          console.warn(`[AI] ${model} rate-limited — trying next`);
          continue;
        }
        console.warn(`[AI] ${model} error: ${msg} — trying next`);
      }
    }
    throw new Error(authFailed ? "Gemini API key is invalid — falling back to Groq" : "All Gemini models failed.");
  }

  async function callGroq(prompt: string, system?: string, maxTokens = 1200, timeoutMs = 30_000): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"];
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    for (const model of models) {
      const guard = abortAfter(timeoutMs);
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: maxTokens,
          }),
          signal: guard.signal,
        });

        if (resp.status === 429) { console.warn(`[Groq] ${model} rate-limited`); continue; }
        if (!resp.ok) { console.warn(`[Groq] ${model} HTTP ${resp.status}`); continue; }

        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        if (text) { console.log(`[AI] Groq success: ${model}`); return text; }
      } catch (e: any) {
        console.warn(`[Groq] ${model} error: ${e.message}`);
      } finally {
        guard.done();
      }
    }
    throw new Error("All Groq models failed.");
  }

  app.post("/api/ai/generate", async (req, res) => {
    try {
      if (!integrityOk) return res.status(503).json({ error: "System not configured" });
      const { prompt, system, fast, maxTokens } = req.body;
      if (!prompt) return res.status(400).json({ error: "Missing prompt" });

      const cap =
        typeof maxTokens === "number" && maxTokens > 0 ? Math.min(maxTokens, 2000) : 1200;
      const geminiPrompt = system
        ? `[SYSTEM ROLE]\n${system}\n[/SYSTEM ROLE]\n\n${prompt}`
        : prompt;

      // `fast` = interactive question generation: prefer the lowest-latency
      // providers (Groq LPU first, hosted Flash next) and only fall back to the
      // slower local model last. Non-fast (evaluation/reports) keeps the
      // cost-first order: free local model → OpenRouter → Gemini → Groq.
      // On the interactive (fast) path, bound each provider tightly so a slow or
      // stalled provider is abandoned quickly and the cascade moves on.
      const netTimeout = fast ? 12_000 : 30_000;
      const runners: Record<string, () => Promise<string>> = {
        OwnAI: () => callOwnAI(prompt, system, fast ? 9_000 : 15_000),
        OpenRouter: () => callOpenRouter(prompt, system, cap, netTimeout),
        Gemini: () => callGemini(geminiPrompt, cap, netTimeout),
        Groq: () => callGroq(prompt, system, cap, netTimeout),
      };
      const order = fast
        ? ["Groq", "Gemini", "OpenRouter", "OwnAI"]
        : ["OwnAI", "OpenRouter", "Gemini", "Groq"];

      let text: string | null = null;
      let lastErr = "";
      for (const name of order) {
        if (name === "OpenRouter" && !process.env.OPENROUTER_API_KEY) continue;
        if (name === "Groq" && !process.env.GROQ_API_KEY) continue;
        if (name === "Gemini" && !process.env.GEMINI_API_KEY) continue;
        try {
          const out = await runners[name]();
          if (out) { console.log(`[AI] ${name} responded${fast ? " (fast path)" : ""}`); text = out; break; }
        } catch (e: any) {
          lastErr = e?.message ?? String(e);
          console.warn(`[AI] ${name} failed: ${lastErr}`);
        }
      }

      if (!text) return res.status(502).json({ error: lastErr || "All AI providers failed" });
      res.json({ text });
    } catch (err: any) {
      console.error("AI generate error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ===============================================================
  // STATIC / VITE
  // ===============================================================
  // Skipped entirely on Vercel — its own CDN/build output serves the static
  // frontend, and a serverless function must never call app.listen(); see
  // the Vercel entrypoint at api/[...path].ts, which imports createApp()
  // directly without this block ever running.

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*all", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return app;
}

// ===============================================================
// TRADITIONAL SERVER ENTRYPOINT (local dev, Render, Railway, etc.)
// Skipped on Vercel — api/[...path].ts calls createApp() directly and lets
// Vercel's own runtime handle the HTTP layer instead of app.listen().
// ===============================================================

if (!process.env.VERCEL) {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3011;
  createApp().then((app) => {
    app.listen(PORT, "0.0.0.0", async () => {
      console.log(`🚀 Defensa server running on http://localhost:${PORT}`);
      console.log(`   Auth:     Firebase Authentication`);
      console.log(`   Database: Supabase PostgreSQL`);
      await bootstrapAdmin();
    });
  });
}

// ===============================================================
// PROJECT ROW → API MAPPER
// ===============================================================

function projectRowToApi(row: Record<string, any>) {
  return {
    id: row.id,
    groupId: row.group_id ?? null,
    title: row.title,
    methodology: row.methodology,
    department: row.department,
    techStack: row.tech_stack ?? [],
    defenseDate: row.defense_date ?? null,
    description: row.description ?? null,
    abstractText: row.abstract_text ?? null,
    analysisResults: row.analysis_results ?? null,
    adviserName: row.adviser_name ?? null,
    status: row.status,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    abstractUploadedAt: row.abstract_uploaded_at ?? null,
  };
}

// Records when the abstract/paper was uploaded. Fire-and-forget: if the
// abstract_uploaded_at column isn't present yet (migration 010 not applied),
// this just logs a warning and the UI falls back to created_at.
async function stampAbstractUpload(projectId: string) {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ abstract_uploaded_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) console.warn("[projects] abstract_uploaded_at not recorded (run migration 010):", error.message);
  } catch (e: any) {
    console.warn("[projects] abstract_uploaded_at update failed:", e?.message ?? e);
  }
}
