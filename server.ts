import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { supabase, rowToProfile, profileToRow, logAudit } from "./lib/supabaseAdmin.ts";
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
const VALID_DEPARTMENTS = ["BSIT", "BSCpE"] as const;

function isValidRole(role: string): role is AppRole {
  return (VALID_ROLES as readonly string[]).includes(role);
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
    return { decoded, profile: rowToProfile(row) };
  }

  // No Supabase profile yet. Email/password accounts stay admin-only — the
  // nu-clark.edu.ph account-creation flow is unchanged. Google sign-ins are
  // a separate, self-service path: any Google account gets an account
  // auto-provisioned as STUDENT on first login.
  if (decoded.firebase?.sign_in_provider !== "google.com") return null;

  const { data: created, error: createErr } = await supabase
    .from("users")
    .insert(
      profileToRow({
        firebaseUid: decoded.uid,
        email: decoded.email ?? "",
        fullName: decoded.name || decoded.email || "Student",
        role: "STUDENT",
        isDeleted: false,
        createdBy: "GOOGLE_AUTO_SIGNUP",
      }),
    )
    .select()
    .single();

  if (createErr) {
    // Unique violation on firebase_uid — a concurrent request for this same
    // first-time Google sign-in already created the row (the popup/redirect
    // login call and the onAuthStateChanged listener can both independently
    // resolve the profile, so they can race). Re-fetch instead of failing.
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
    console.error("Google auto-signup failed:", createErr.message);
    return null;
  }
  if (!created) return null;

  await logAudit(decoded.uid, "GOOGLE_AUTO_SIGNUP", "users", decoded.uid, {
    email: decoded.email,
  });

  return { decoded, profile: rowToProfile(created) };
}

// ===============================================================
// BOOTSTRAP ADMIN
// If no users exist in Supabase and the Firebase Auth account
// for INITIAL_ADMIN_EMAIL already exists, auto-provision it.
// ===============================================================

async function bootstrapAdmin() {
  if (systemStatus !== "READY") return;
  try {
    const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
    if (!initialAdminEmail) return;

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

async function startServer() {
  const app = express();
  const PORT = 3011;

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

      if (!row) return res.status(401).json({ message: "Unauthorized" });

      if (row.is_deleted === true) {
        return res.status(403).json({
          message: "Account deactivated. Contact your administrator.",
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

      res.json({ user: rowToProfile(row) });
    } catch (error: any) {
      res.status(401).json({ message: error.message || "Invalid identity token" });
    }
  });

  // ===============================================================
  // PUBLIC SELF-REGISTRATION
  // Unauthenticated — this is the entry point for a brand-new account.
  // Creates the Firebase Auth user and a Supabase profile immediately, but
  // with status PENDING. verifyAndGetCaller (and /api/auth/me above) both
  // treat PENDING the same as "no access yet" until an admin approves it
  // via /api/users/:uid/approve below.
  // ===============================================================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, fullName, program, yearLevel } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({
          message: "Missing required fields: email, password, fullName",
        });
      }
      if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      }

      let userRecord;
      try {
        userRecord = await auth.createUser({
          email,
          password,
          displayName: fullName,
          emailVerified: false,
        });
      } catch (createErr: any) {
        if (createErr.code === "auth/email-already-exists") {
          return res.status(409).json({ message: "An account with this email already exists." });
        }
        if (createErr.code === "auth/invalid-password") {
          return res.status(400).json({ message: "Password must be at least 6 characters." });
        }
        throw createErr;
      }

      const row = profileToRow({
        firebaseUid: userRecord.uid,
        email,
        fullName,
        role: "STUDENT",
        program: program || null,
        yearLevel: yearLevel || null,
        isDeleted: false,
        status: "PENDING",
        createdBy: "SELF_REGISTRATION",
      });

      const { error } = await supabase.from("users").insert(row);
      if (error) {
        // Roll back the Firebase user so a DB failure doesn't leave an
        // orphaned auth account with no matching profile.
        await auth.deleteUser(userRecord.uid).catch(() => {});
        throw new Error(error.message);
      }

      await logAudit(userRecord.uid, "SELF_REGISTRATION", "users", userRecord.uid, { email });

      res.status(201).json({
        message: "Registration submitted. An administrator will review your account.",
      });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(500).json({ message: error.message || "Registration failed. Please try again." });
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

      const { email, password, fullName, role, program, yearLevel } = req.body;
      if (!email || !password || !fullName || !role) {
        return res.status(400).json({
          message: "Missing required fields: email, password, fullName, role",
        });
      }

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

  // Reject a pending self-registration (Admin only) — soft, like delete;
  // keeps the row (audit trail) but permanently blocks login.
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

      const { error } = await supabase
        .from("users")
        .update({ status: "REJECTED", updated_at: new Date().toISOString() })
        .eq("firebase_uid", uid);
      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "USER_REJECT", "users", uid);
      res.json({ message: "Registration rejected." });
    } catch (error) {
      console.error("Reject user error:", error);
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
      if (department && !(VALID_DEPARTMENTS as readonly string[]).includes(department)) {
        return res.status(400).json({
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(", ")}`,
        });
      }

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
      const { data: newProject, error } = await supabase
        .from("projects")
        .insert({
          group_id: groupId,
          title: title.trim(),
          methodology: methodology || "Quantitative",
          department: department || null,
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
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      await logAudit(caller.decoded.uid, "PROJECT_CREATE", "projects", newProject.id, {
        title: title.trim(),
        department,
      });

      return res.status(201).json(projectRowToApi(newProject));
    } catch (error: any) {
      console.error("Create project error:", error);
      res.status(500).json({ message: "Server error" });
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
      if (department !== undefined && !(VALID_DEPARTMENTS as readonly string[]).includes(department)) {
        return res.status(400).json({
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(", ")}`,
        });
      }
      if (techStack !== undefined && (!Array.isArray(techStack) || techStack.length === 0)) {
        return res.status(400).json({ message: "Select at least one technology." });
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title.trim();
      if (methodology !== undefined) updates.methodology = methodology;
      if (department !== undefined) updates.department = department;
      if (techStack !== undefined) updates.tech_stack = techStack;
      if (defenseDate !== undefined) updates.defense_date = defenseDate;
      if (description !== undefined) updates.description = description;
      if (abstractText !== undefined) updates.abstract_text = abstractText;
      if (analysisResults !== undefined) updates.analysis_results = analysisResults;

      const { data: updated, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      if (abstractText !== undefined) {
        // Keep own-ai in sync whenever the abstract text changes
        indexInOwnAI(abstractText, `project-${id}-abstract`).catch(() => {});
        await logAudit(caller.decoded.uid, "ABSTRACT_UPLOAD", "projects", id);
      } else {
        await logAudit(caller.decoded.uid, "PROJECT_UPDATE", "projects", id);
      }

      return res.json(projectRowToApi(updated));
    } catch (error: any) {
      console.error("Update project error:", error);
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

      const result = (sessions ?? []).map((s) => ({
        ...s,
        userName: userMap.get(s.student_firebase_uid)?.fullName ?? "Unknown",
        userEmail: userMap.get(s.student_firebase_uid)?.email ?? "",
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

  async function callOwnAI(prompt: string, system?: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
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

  async function callOpenRouter(prompt: string, system?: string): Promise<string> {
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
            max_tokens: 1200,
          }),
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
      }
    }
    throw new Error("All OpenRouter models failed.");
  }

  async function callGemini(prompt: string): Promise<string> {
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
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
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

  async function callGroq(prompt: string, system?: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"];
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    for (const model of models) {
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
            max_tokens: 1200,
          }),
        });

        if (resp.status === 429) { console.warn(`[Groq] ${model} rate-limited`); continue; }
        if (!resp.ok) { console.warn(`[Groq] ${model} HTTP ${resp.status}`); continue; }

        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        if (text) { console.log(`[AI] Groq success: ${model}`); return text; }
      } catch (e: any) {
        console.warn(`[Groq] ${model} error: ${e.message}`);
      }
    }
    throw new Error("All Groq models failed.");
  }

  app.post("/api/ai/generate", async (req, res) => {
    try {
      if (!integrityOk) return res.status(503).json({ error: "System not configured" });
      const { prompt, system } = req.body;
      if (!prompt) return res.status(400).json({ error: "Missing prompt" });

      const geminiPrompt = system
        ? `[SYSTEM ROLE]\n${system}\n[/SYSTEM ROLE]\n\n${prompt}`
        : prompt;

      let text: string | null = null;

      // 1. Try own local AI first (no API key needed, no cost)
      try {
        text = await callOwnAI(prompt, system);
      } catch (ownAiErr: any) {
        console.warn("[AI] Own AI unavailable:", ownAiErr.message, "— trying OpenRouter");
      }

      // 2. Fallback to OpenRouter
      if (!text && process.env.OPENROUTER_API_KEY) {
        try {
          text = await callOpenRouter(prompt, system);
        } catch (openRouterErr: any) {
          console.warn("[AI] OpenRouter failed:", openRouterErr.message, "— trying Gemini");
        }
      }

      // 3. Fallback to Gemini
      if (!text) {
        try {
          text = await callGemini(geminiPrompt);
        } catch (geminiErr: any) {
          console.warn("[AI] Gemini failed:", geminiErr.message);
          // 4. Fallback to Groq
          if (process.env.GROQ_API_KEY) {
            console.log("[AI] Falling back to Groq...");
            text = await callGroq(prompt, system);
          } else {
            throw geminiErr;
          }
        }
      }

      res.json({ text });
    } catch (err: any) {
      console.error("AI generate error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ===============================================================
  // STATIC / VITE
  // ===============================================================

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

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 Defensa server running on http://localhost:${PORT}`);
    console.log(`   Auth:     Firebase Authentication`);
    console.log(`   Database: Supabase PostgreSQL`);
    await bootstrapAdmin();
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
  };
}

startServer();
